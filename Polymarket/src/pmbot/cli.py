"""Command line entry point.

    python -m pmbot.cli doctor
    python -m pmbot.cli search  <text>
    python -m pmbot.cli market  <url-or-slug> [<url-or-slug> ...]
    python -m pmbot.cli watch   <url-or-slug> [<url-or-slug> ...] [--seconds N]
    python -m pmbot.cli report   <journal-file.jsonl>
    python -m pmbot.cli backtest <journal-file.jsonl> [...]
    python -m pmbot.cli live-check <url-or-slug> [--live]

Only `live-check --live` can place an order. Everything else reads.

`doctor`, `search` and `market` need no credentials. `watch` does: on
Polymarket US the market data socket is authenticated, so recording a book
requires an API key even though it cannot trade.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import logging
import sys
from pathlib import Path

import httpx

from . import endpoints, fees
from .auth import AuthError, Credentials
from .book import BookSet
from .config import Settings
from .discovery import DiscoveryError, Market, fetch_market, search_markets
from .feed import FeedAuthError, MarketFeed
from .journal import Journal, replay
from .plan import WatchPlan, build_plan, label_width
from .replay import run_replay
from .risk import RiskLimits, RiskManager
from .sim import PaperBroker
from .strategy import MakerStrategy


def _log_setup(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )


def resolve_markets(refs: list[str], settings: Settings) -> list[Market]:
    """Resolve every market reference, reporting failures individually.

    One unresolvable market must not abort a watch over the other nine: a
    typo'd slug is a bad reason to lose an overnight recording.
    """
    markets: list[Market] = []
    for ref in refs:
        try:
            markets.append(fetch_market(ref, timeout_s=settings.http_timeout_s))
        except (DiscoveryError, httpx.HTTPError) as exc:
            print(f"warning: skipping {ref!r}: {exc}", file=sys.stderr)
    return markets


def cmd_doctor(args: argparse.Namespace) -> int:
    """Check that this machine can reach the venue and hold a valid key."""
    settings = Settings.from_env()
    checks = [
        ("gateway", endpoints.gateway_url(endpoints.markets_path()) + "?limit=1"),
        ("api", endpoints.api_url(endpoints.balances_path())),
    ]
    failed = False
    for name, url in checks:
        try:
            response = httpx.get(url, timeout=settings.http_timeout_s)
            note = ""
            if name == "api" and response.status_code == 401:
                # Expected: this probe is deliberately unsigned. It proves the
                # host is reachable and rejecting properly, which is exactly
                # what you want to know before blaming your key.
                note = "  (401 unsigned — reachable, as expected)"
            print(f"  {name:<8} {response.status_code}  {url}{note}")
        except Exception as exc:  # noqa: BLE001
            failed = True
            print(f"  {name:<8} FAIL  {type(exc).__name__}: {exc}")

    print(f"  {'ws':<8} (not probed) {endpoints.WS_MARKETS}")

    credentials = settings.credentials
    if credentials is None:
        print("\n  credentials  MISSING")
        print("    export POLYMARKET_KEY_ID=... POLYMARKET_SECRET_KEY=...")
        print("    Create a key at https://polymarket.us/developer")
        print("    Needed for: watch, live-check. Not for: search, market, backtest.")
    else:
        try:
            credentials.validate()
            print(f"\n  credentials  OK   {credentials.redacted()}")
        except AuthError as exc:
            failed = True
            print(f"\n  credentials  BAD  {exc}")

    if failed:
        print("\nAt least one check failed. Fix that before assuming the bot is")
        print("broken — and check the system clock: timestamps more than 30s")
        print("out of sync are rejected exactly like a bad key.")
    return 1 if failed else 0


def cmd_search(args: argparse.Namespace) -> int:
    """Find a market slug by free text.

    Slugs here are venue-generated and unguessable (`aec-nfl-lac-ten-...`),
    unlike the readable ones on polymarket.com, so this is usually the first
    command you run.
    """
    settings = Settings.from_env()
    try:
        result = search_markets(
            args.text, limit=args.limit, timeout_s=settings.http_timeout_s
        )
    except (DiscoveryError, httpx.HTTPError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    for market in result.markets:
        print(f"{market.slug}")
        print(f"  {market.question}  [{market.category}]")

    if result.markets:
        print(f"\n{len(result.markets)} match(es) in {result.scanned} market(s) scanned")
    else:
        print(f"no match in the {result.scanned} market(s) scanned")

    # Never let an empty result read as "this market does not exist". The
    # search filters one page locally, so a full page means the catalogue
    # continues past where it looked.
    if result.page_was_full:
        print(
            f"\n  Only the first {result.scanned} open markets were searched, and "
            f"the venue\n  returned a full page — there are probably more. "
            f"Raise it with --limit,\n  or check the Polymarket US app to be sure."
        )
    return 0 if result.markets else 1


def _print_market(market: Market) -> None:
    print(f"question    {market.question}")
    print(f"slug        {market.slug}")
    print(f"id          {market.market_id}")
    print(f"category    {market.category}")
    print(f"tradable    {market.tradable} "
          f"(active={market.active} closed={market.closed} "
          f"archived={market.archived})")
    print(f"tick size   {market.tick_size}")
    print(f"min qty     {market.min_qty}")
    if market.end_date:
        print(f"ends        {market.end_date}")
    for side in market.sides:
        print(f"  {side.direction:<6} {side.description}")


def cmd_market(args: argparse.Namespace) -> int:
    settings = Settings.from_env()
    markets = resolve_markets(args.market, settings)
    if not markets:
        print("error: no markets could be resolved", file=sys.stderr)
        return 1

    for market in markets:
        _print_market(market)
        print()

    if len(markets) > 1:
        print(build_plan(markets).describe())
    return 0


class TopOfBookFilter:
    """Decides whether a book update is worth printing.

    The venue republishes a book on every depth change, so a market whose
    touch has not moved emits the same top-of-book line hundreds of times.
    Printed verbatim that buries the updates that do matter, and makes a
    quiet market look like a stuck program.

    The journal still records every message — depth below the touch is real
    information a backtest may want. This only filters the console.
    """

    def __init__(self) -> None:
        self._last: dict[str, tuple[object, object]] = {}
        self.updates = 0
        self.changes: dict[str, int] = {}

    def should_show(self, label: str, summary: dict) -> bool:
        self.updates += 1
        # Spread and mid are derived from bid and ask, so those two alone
        # decide whether the displayed line would differ.
        key = (summary.get("best_bid"), summary.get("best_ask"))
        if self._last.get(label) == key:
            return False
        self._last[label] = key
        self.changes[label] = self.changes.get(label, 0) + 1
        return True

    def summary_lines(self) -> list[str]:
        lines = [f"{self.updates} book update(s) received"]
        if not self.changes:
            lines.append("  no top-of-book moved — the market was quiet, not broken")
            return lines
        for label in sorted(self.changes, key=lambda k: -self.changes[k]):
            lines.append(f"  {label}: {self.changes[label]} price change(s)")
        return lines


def _print_plan(plan: WatchPlan) -> None:
    for market in plan.markets:
        flag = "" if market.tradable else "  [NOT TRADABLE]"
        print(f"{market.slug}{flag}")
        print(f"  {market.question}")
    print(f"\n{plan.describe()}\n")


async def _watch(
    refs: list[str], seconds: float | None, settings: Settings, stream_name: str
) -> int:
    credentials: Credentials = settings.require_credentials()

    markets = resolve_markets(refs, settings)
    if not markets:
        print("error: no markets could be resolved", file=sys.stderr)
        return 1

    try:
        plan = build_plan(markets)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if plan.untradable_markets:
        names = ", ".join(m.slug for m in plan.untradable_markets)
        print(f"warning: not currently tradable: {names}", file=sys.stderr)

    _print_plan(plan)

    books = BookSet(plan.slugs)
    feed = MarketFeed(list(plan.slugs), settings=settings, credentials=credentials)
    width = label_width(plan.labels.values())
    changes = TopOfBookFilter()

    with Journal(settings.journal_dir, stream_name) as journal:
        # One record per market, so `report` and `backtest` can label
        # instruments later without needing the network. The `tokens` key is
        # kept for journal compatibility: on this venue there is exactly one
        # instrument per market and its id is the slug.
        for market in plan.markets:
            long_side = market.long_side
            journal.write(
                "market",
                {
                    "slug": market.slug,
                    "market_id": market.market_id,
                    "question": market.question,
                    "tradable": market.tradable,
                    "tick_size": market.tick_size,
                    "min_qty": market.min_qty,
                    "tokens": [
                        {
                            "token_id": market.slug,
                            "outcome": long_side.description if long_side else "long",
                        }
                    ],
                },
            )

        async def run() -> None:
            async for message in feed.stream():
                event = str(message.get("event_type", ""))

                if event == "_reconnected":
                    books.reset()
                    journal.write("reconnected", {"n": message.get("reconnects")})
                    continue
                if event == "_disconnected":
                    journal.write("disconnected", {"error": message.get("error")})
                    continue
                if event == "_error":
                    journal.write("feed_error", {"error": message.get("error")})
                    print(f"feed error: {message.get('error')}", file=sys.stderr)
                    continue

                # Record the message before interpreting it: a parser bug
                # should cost you a rerun, not the data.
                journal.write("raw", {"msg": message})

                book = books.handle(message)
                if book is None:
                    continue

                summary = book.summary()
                label = plan.label_for(book.token_id)
                journal.write("book", {"label": label, **summary})
                if summary["crossed"]:
                    journal.write(
                        "anomaly", {"reason": "crossed", "label": label, **summary}
                    )

                # A crossed book is an anomaly worth seeing every time, even
                # if the touch is unchanged from the last one.
                if not changes.should_show(label, summary) and not summary["crossed"]:
                    continue

                def show(value: object) -> str:
                    return "-" if value is None else str(value)

                print(
                    f"  {label:<{width}} "
                    f"bid {show(summary['best_bid']):<8} "
                    f"ask {show(summary['best_ask']):<8} "
                    f"spread {show(summary['spread']):<8} "
                    f"mid {show(summary['mid'])}"
                    + ("   << CROSSED" if summary["crossed"] else "")
                )

        task = asyncio.ensure_future(run())
        try:
            if seconds:
                with contextlib.suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(asyncio.shield(task), timeout=seconds)
            else:
                await task
        except KeyboardInterrupt:
            pass
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task

    print()
    for line in changes.summary_lines():
        print(line)
    print(f"\njournal written to {settings.journal_dir}/")
    return 0


def cmd_watch(args: argparse.Namespace) -> int:
    settings = Settings.from_env()
    try:
        return asyncio.run(_watch(args.market, args.seconds, settings, args.name))
    except (AuthError, FeedAuthError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


def cmd_report(args: argparse.Namespace) -> int:
    """Summarise a journal: coverage per market, and connection stability."""
    path = Path(args.journal)
    if not path.exists():
        print(f"error: no such journal: {path}", file=sys.stderr)
        return 1

    counts: dict[str, int] = {}
    per_label: dict[str, list[float]] = {}
    updates: dict[str, int] = {}
    markets: list[str] = []
    anomalies = 0

    for record in replay(path):
        kind = str(record.get("kind"))
        counts[kind] = counts.get(kind, 0) + 1

        if kind == "market":
            markets.append(f"{record.get('slug')}  {record.get('question', '')[:60]}")
        elif kind == "book":
            label = str(record.get("label") or record.get("token_id", "?"))
            updates[label] = updates.get(label, 0) + 1
            if isinstance(record.get("spread"), (int, float)):
                per_label.setdefault(label, []).append(float(record["spread"]))
        elif kind == "anomaly":
            anomalies += 1

    print(f"journal   {path}")
    if markets:
        print("\nmarkets")
        for line in markets:
            print(f"  {line}")

    print("\nrecords")
    for kind, count in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {kind:<14} {count}")

    if updates:
        width = min(max(len(k) for k in updates), 44)
        print("\nper instrument")
        for label in sorted(updates, key=lambda k: -updates[k]):
            spreads = sorted(per_label.get(label, []))
            median = f"{spreads[len(spreads) // 2]:.4f}" if spreads else "-"
            print(
                f"  {label:<{width}}  updates={updates[label]:<7} "
                f"median_spread={median}"
            )

    reconnects = counts.get("reconnected", 0)
    if reconnects > 1:
        print(f"\n  feed reconnected {reconnects - 1} time(s) during this run")
    if counts.get("feed_error"):
        print(f"\n  {counts['feed_error']} feed error(s) — check the journal")
    if anomalies:
        print(
            f"\n  {anomalies} crossed-book anomalies — investigate before "
            "trusting this data"
        )
    return 0


def cmd_backtest(args: argparse.Namespace) -> int:
    """Replay journals through a strategy. Nothing here touches the network."""
    paths = [Path(p) for p in args.journal]
    missing = [p for p in paths if not p.exists()]
    if missing:
        for path in missing:
            print(f"error: no such journal: {path}", file=sys.stderr)
        return 1

    strategy = MakerStrategy(
        half_spread=args.half_spread,
        size=args.size,
        min_edge=args.min_edge,
        max_inventory=args.max_inventory,
        tick=args.tick,
    )
    risk = RiskManager(
        RiskLimits(
            max_shares_per_token=args.max_shares,
            max_exposure=args.max_exposure,
            max_loss=args.max_loss,
            max_order_size=max(args.size, 1.0),
        )
    )
    if args.fee_bps is not None:
        broker = PaperBroker(fee_bps=args.fee_bps, queue_factor=args.queue_factor)
        fee_description = f"flat {args.fee_bps} bps of notional"
    else:
        broker = PaperBroker(
            fee_model=fees.fee_model(args.fee_role), queue_factor=args.queue_factor
        )
        fee_description = f"venue schedule, {args.fee_role} side"

    result = run_replay(paths, strategy, risk=risk, broker=broker)

    print(f"strategy      {strategy.name} "
          f"(half_spread={args.half_spread}, size={args.size}, "
          f"min_edge={args.min_edge}, tick={args.tick})")
    print(f"fill model    queue_factor={args.queue_factor}, fees: {fee_description}")
    print(f"\nmessages      {result.messages}")
    print(f"book updates  {result.updates}")
    print(f"trade prints  {result.trades}")
    if result.reconnects:
        print(f"reconnects    {result.reconnects}  (books and orders dropped each time)")

    pf = result.portfolio
    print(f"\nfills         {pf.fills}")
    print(f"volume        {pf.volume:,.2f} USD")
    if pf.fees_paid < 0:
        # A negative fee is the maker rebate. Printing it as a cost of
        # "-0.42 USD" invites reading it as a loss; it is income.
        print(f"maker rebate  +{-pf.fees_paid:,.4f} USD  (earned, not paid)")
    else:
        print(f"fees          {pf.fees_paid:,.4f} USD")
    print(f"\nrealized      {result.realized:+,.4f} USD")
    print(f"unrealized    {result.unrealized:+,.4f} USD")
    print(f"total         {result.total_pnl:+,.4f} USD")

    open_positions = pf.open_positions()
    if open_positions:
        print("\nopen positions")
        for pos in open_positions:
            mark = result.marks.get(pos.token_id)
            mark_s = f"{mark:.4f}" if mark is not None else "-"
            print(f"  {result.label(pos.token_id):<28} "
                  f"shares={pos.shares:+9.2f} avg={pos.avg_cost:.4f} mark={mark_s}")

    risk_summary = risk.summary()
    if risk_summary["total_vetoed"]:
        print("\nrisk vetoes")
        for reason, count in risk_summary["vetoes"].items():  # type: ignore[union-attr]
            print(f"  {reason:<22} {count}")
    if risk.halted:
        print(f"\n  HALTED: {risk.halt_reason}")

    if pf.fills == 0:
        print("\n  No fills. Either the strategy never quoted (check min_edge "
              "against\n  the real spread), or the journal has no trade prints — a "
              "book-only\n  recording almost never fills a maker. Check `report` "
              "for trade events.")
    else:
        if result.trades == 0:
            print("\n  WARNING: every fill came from the book crossing your quote, "
                  "not from\n  a trade print. That path only triggers on large jumps, "
                  "so this is a\n  poor proxy for how a maker really fills. Record "
                  "trade events.")
        print("\n  Fills are inferred, not observed. Latency, queue position and "
              "\n  cancel races are all unmodelled, and every one of them costs "
              "money\n  live. Treat a marginally profitable result as a losing one.")
        if args.fee_bps is not None:
            print("\n  --fee-bps applies a flat rate to notional. The venue does "
                  "not:\n  its fee is theta x contracts x p x (1-p), which no single "
                  "bps value\n  matches at more than one price. Drop the flag to use "
                  "the real one.")
        elif args.fee_role == "maker" and pf.fees_paid < 0:
            share = abs(pf.fees_paid) / abs(result.total_pnl) if result.total_pnl else 0
            print(f"\n  The maker rebate is {share:.0%} of the total P&L here. It is "
                  "real income,\n  but it is only earned on fills you did not have to "
                  "cross for — if the\n  fill model is optimistic, so is the rebate.")
        if args.queue_factor >= 1.0:
            print("\n  queue_factor=1.0 assumes you are always first in the queue. "
                  "You are\n  not. This number is optimistic by construction.")
    return 0


def cmd_live_check(args: argparse.Namespace) -> int:
    """Plumbing test: prove the live path works, spending as close to nothing
    as the venue allows."""
    from .live import ClientConfig, LiveClient, run_checks
    from .live.checks import PLUMBING_MAX_NOTIONAL

    settings = Settings.from_env()
    markets = resolve_markets([args.market], settings)
    if not markets:
        return 1
    market = markets[0]

    if args.live:
        print("=" * 62)
        print("  LIVE MODE — this will post a real order with real money.")
        print(f"  Ceiling: {PLUMBING_MAX_NOTIONAL} USD per order, cancelled "
              "before exit.")
        print("  The order rests far below the touch and should never fill.")
        print("=" * 62)
        if not args.yes:
            reply = input("\nType 'yes' to continue: ").strip().lower()
            if reply != "yes":
                print("aborted")
                return 1
        try:
            config = ClientConfig.from_env()
        except Exception as exc:  # noqa: BLE001
            print(f"error: {exc}", file=sys.stderr)
            return 1
        print(f"\ncredentials   {config.redacted()}\n")
        factory = lambda: LiveClient(config)  # noqa: E731
    else:
        factory = None

    with Journal(settings.journal_dir, "live-check") as journal:
        run = run_checks(
            market,
            args.side,
            journal,
            client_factory=factory,
            dry_run=not args.live,
            fill_test=args.fill_test,
        )

    print(f"plumbing check — {market.slug} / {args.side}\n")
    for step in run.steps:
        print(step.render())

    if run.ok:
        print("\nAll steps passed." if args.live else
              "\nDry run complete. Re-run with --live to exercise the real path.")
        return 0

    print("\nFAILED at:")
    for step in run.failed:
        print(f"  {step.name}: {step.detail}")
    print("\nMost failures here are a revoked key, a clock more than 30s out of\n"
          "sync, or a market that is flagged active but already closed.")
    return 1


async def _run_strategy(args: argparse.Namespace, settings: Settings) -> int:
    from .live import LiveBroker, ClientConfig, LiveClient, PrivateFeed, run_live
    from .live.broker import LIVE_MAX_ORDER_NOTIONAL, LIVE_MAX_RESTING_NOTIONAL

    credentials = settings.require_credentials()

    markets = resolve_markets(args.market, settings)
    if not markets:
        print("error: no markets could be resolved", file=sys.stderr)
        return 1

    tradable = [m for m in markets if m.tradable]
    if not tradable:
        print("error: none of those markets are tradable right now", file=sys.stderr)
        return 1

    plan = build_plan(tradable)
    _print_plan(plan)

    # Quote on the venue's own grid. Quoting a 0.01 grid on a 0.001-tick
    # market throws away nine ticks of queue position per quote.
    tick = args.tick if args.tick else min(m.tick_size for m in tradable)

    strategy = MakerStrategy(
        half_spread=args.half_spread,
        size=args.size,
        min_edge=args.min_edge,
        max_inventory=args.max_inventory,
        tick=tick,
    )
    risk = RiskManager(
        RiskLimits(
            max_shares_per_token=args.max_shares,
            max_exposure=args.max_exposure,
            max_loss=args.max_loss,
            max_order_size=max(args.size, 1.0),
            kill_switch_file=Path(args.kill_switch) if args.kill_switch else None,
        )
    )

    print("=" * 62)
    print("  LIVE STRATEGY — this places real orders with real money.")
    print(f"  Per-order cap    {LIVE_MAX_ORDER_NOTIONAL} USD of buying power")
    print(f"  Resting cap      {LIVE_MAX_RESTING_NOTIONAL} USD across all orders")
    print(f"  Loss halt        {args.max_loss} USD (sticky — no auto-restart)")
    print(f"  Quoting tick     {tick}")
    if args.kill_switch:
        print(f"  Kill switch      touch {args.kill_switch} to stop and flatten")
    if args.seconds:
        print(f"  Time limit       {args.seconds}s")
    print("  Everything resting is cancelled on exit, halt or crash.")
    print("=" * 62)
    if not args.yes:
        reply = input("\nType 'trade' to start: ").strip().lower()
        if reply != "trade":
            print("aborted")
            return 1

    config = ClientConfig.from_env()
    print(f"\ncredentials   {config.redacted()}\n")

    client = LiveClient(config)
    who = client.connect()
    print(f"connected     {who}\n")

    with Journal(settings.journal_dir, args.name) as journal:
        broker = LiveBroker(client=client, journal=journal)
        broker.reconcile()
        if broker.resting:
            print(f"warning: {len(broker.resting)} order(s) already resting at the "
                  "venue; they will be cancelled", file=sys.stderr)
            await broker.cancel_all()

        market_feed = MarketFeed(
            list(plan.slugs), settings=settings, credentials=credentials
        )
        private_feed = PrivateFeed(
            list(plan.slugs), settings=settings, credentials=credentials
        )

        result = await run_live(
            plan,
            strategy,
            risk,
            broker,
            market_feed.stream(),
            private_feed.stream(),
            journal,
            max_seconds=args.seconds,
            max_fills=args.max_fills,
        )

    print(f"\nstopped       {result.stopped_because or 'end of stream'}")
    print(f"book updates  {result.updates}")
    print(f"executions    {result.executions}")
    if result.blind_periods:
        print(f"blind periods {result.blind_periods}  (orders cancelled each time)")

    summary = broker.summary()
    print(f"\norders sent   {summary['orders_sent']}")
    print(f"cancelled     {summary['orders_cancelled']}")
    print(f"fills         {summary['fills']}")
    print(f"buying power  {summary['buying_power']}")

    print(f"\nrealized      {result.realized:+,.4f} USD")
    print(f"unrealized    {result.unrealized:+,.4f} USD  (marked at mid)")
    print(f"total         {result.total_pnl:+,.4f} USD")
    print("\n  P&L above is gross of fees. The venue's maker rebate and taker")
    print("  fees land in the balance ledger — trust `buying power` and the")
    print("  app, not this number, for what actually happened to the cash.")

    for pos in result.portfolio.open_positions():
        mark = result.marks.get(pos.token_id)
        mark_s = f"{mark:.4f}" if mark is not None else "-"
        print(f"\n  OPEN POSITION {pos.token_id} shares={pos.shares:+.2f} "
              f"avg={pos.avg_cost:.4f} mark={mark_s}")
        print("  Orders are cancelled but the position is not closed. Flatten it")
        print("  in the app, or with: pmbot live-check <slug> --live")

    if summary["total_refused"]:
        print("\nbroker refusals")
        for reason, count in summary["refusals"].items():
            print(f"  {reason:<24} {count}")

    risk_summary = risk.summary()
    if risk_summary["total_vetoed"]:
        print("\nrisk vetoes")
        for reason, count in risk_summary["vetoes"].items():  # type: ignore[union-attr]
            print(f"  {reason:<24} {count}")
    if risk.halted:
        print(f"\n  HALTED: {risk.halt_reason}")
        return 1
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    """Phase 3b: the strategy, live, behind the same risk layer."""
    from .feed import FeedAuthError
    from .live.client import LiveClientError

    settings = Settings.from_env()
    if not args.live:
        print("Refusing to run without --live.\n")
        print("This command places real orders. There is no dry run: a dry run")
        print("of a live strategy is exactly what `backtest` already is, and")
        print("pretending otherwise would give you a false sense of having")
        print("tested this path.\n")
        print("Before the first --live run:")
        print("  1. pmbot live-check <slug> --live     prove the plumbing works")
        print("  2. pmbot backtest <journal>           prove there is an edge")
        print("  3. pmbot run <slug> --live --seconds 300 --max-fills 2")
        return 1

    try:
        return asyncio.run(_run_strategy(args, settings))
    except (AuthError, FeedAuthError, LiveClientError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\ninterrupted — orders cancelled", file=sys.stderr)
        return 130


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pmbot", description=__doc__)
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser(
        "doctor", help="check connectivity and credentials"
    ).set_defaults(func=cmd_doctor)

    p_search = sub.add_parser("search", help="find open markets by free text")
    p_search.add_argument("text", help="text to match against slug/question")
    p_search.add_argument("--limit", type=int, default=100)
    p_search.set_defaults(func=cmd_search)

    p_market = sub.add_parser("market", help="resolve markets and show their details")
    p_market.add_argument("market", nargs="+", help="Polymarket US URL(s) or slug(s)")
    p_market.set_defaults(func=cmd_market)

    p_watch = sub.add_parser(
        "watch",
        help="stream one or more markets' order books over a single connection",
    )
    p_watch.add_argument("market", nargs="+", help="Polymarket US URL(s) or slug(s)")
    p_watch.add_argument("--seconds", type=float, default=None, help="stop after N s")
    p_watch.add_argument(
        "--name", default="feed", help="journal stream name (default: feed)"
    )
    p_watch.set_defaults(func=cmd_watch)

    p_report = sub.add_parser("report", help="summarise a journal file")
    p_report.add_argument("journal", help="path to a .jsonl journal")
    p_report.set_defaults(func=cmd_report)

    p_back = sub.add_parser(
        "backtest", help="replay journals through a paper-trading strategy"
    )
    p_back.add_argument("journal", nargs="+", help="path(s) to .jsonl journals")
    p_back.add_argument("--half-spread", type=float, default=0.02)
    p_back.add_argument("--size", type=float, default=50.0)
    p_back.add_argument("--min-edge", type=float, default=0.01,
                        help="skip markets whose spread is tighter than this")
    p_back.add_argument("--max-inventory", type=float, default=200.0)
    p_back.add_argument("--tick", type=float, default=0.01,
                        help="price increment to quote on; see `market` for the "
                             "venue's tick (often 0.001)")
    p_back.add_argument("--queue-factor", type=float, default=0.5,
                        help="haircut on every fill; 1.0 assumes perfect queue position")
    p_back.add_argument("--fee-role", choices=("maker", "taker", "none"),
                        default="maker",
                        help="which side of the venue fee schedule to apply. "
                             "A resting quote is the passive side, so a maker "
                             "strategy earns the rebate (default: maker)")
    p_back.add_argument("--fee-bps", type=float, default=None,
                        help="override the venue schedule with a flat bps rate "
                             "on notional. The venue does not charge this way; "
                             "for comparison against older results only")
    p_back.add_argument("--max-shares", type=float, default=500.0)
    p_back.add_argument("--max-exposure", type=float, default=1000.0)
    p_back.add_argument("--max-loss", type=float, default=100.0)
    p_back.set_defaults(func=cmd_backtest)

    p_live = sub.add_parser(
        "live-check",
        help="plumbing test against the real venue (dry run unless --live)",
    )
    p_live.add_argument("market", help="Polymarket US URL or slug")
    p_live.add_argument("--side", default="long",
                        help="market side to test: long/short, or the venue's "
                             "own label (default: long)")
    p_live.add_argument(
        "--live",
        action="store_true",
        help="actually connect and post a real (tiny, cancelled) order",
    )
    p_live.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    p_live.add_argument("--fill-test", action="store_true", help="not yet implemented")
    p_live.set_defaults(func=cmd_live_check)

    p_run = sub.add_parser(
        "run",
        help="run the strategy against the live venue (phase 3b) — REAL MONEY",
    )
    p_run.add_argument("market", nargs="+", help="Polymarket US URL(s) or slug(s)")
    p_run.add_argument("--live", action="store_true",
                       help="required. There is no dry run; use `backtest`")
    p_run.add_argument("--yes", action="store_true", help="skip the confirmation")
    p_run.add_argument("--seconds", type=float, default=None,
                       help="stop after N seconds. Strongly recommended")
    p_run.add_argument("--max-fills", type=int, default=None,
                       help="stop after N fills. The cheapest way to bound a "
                            "first live run")
    p_run.add_argument("--name", default="live", help="journal stream name")
    p_run.add_argument("--kill-switch", default=None,
                       help="path to a file that, once it exists, halts and "
                            "flattens — stopping must not need a redeploy")
    p_run.add_argument("--half-spread", type=float, default=0.02)
    p_run.add_argument("--size", type=float, default=1.0,
                       help="contracts per quote (default: 1)")
    p_run.add_argument("--min-edge", type=float, default=0.01)
    p_run.add_argument("--max-inventory", type=float, default=5.0)
    p_run.add_argument("--tick", type=float, default=None,
                       help="quoting tick; defaults to the market's own")
    p_run.add_argument("--max-shares", type=float, default=10.0)
    p_run.add_argument("--max-exposure", type=float, default=20.0)
    p_run.add_argument("--max-loss", type=float, default=5.0,
                       help="sticky halt on drawdown (default: 5 USD)")
    p_run.set_defaults(func=cmd_run)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _log_setup(args.verbose)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
