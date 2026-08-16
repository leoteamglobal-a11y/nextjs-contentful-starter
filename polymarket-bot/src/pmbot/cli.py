"""Command line entry point.

    python -m pmbot.cli doctor
    python -m pmbot.cli market <url-or-slug> [<url-or-slug> ...]
    python -m pmbot.cli watch  <url-or-slug> [<url-or-slug> ...] [--seconds N]
    python -m pmbot.cli report   <journal-file.jsonl>
    python -m pmbot.cli backtest <journal-file.jsonl> [...]

None of these commands can place an order. There is no signing code in this
package at all.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import logging
import sys
from pathlib import Path

import httpx

from . import endpoints
from .book import BookSet
from .config import Settings
from .discovery import DiscoveryError, Market, fetch_market
from .feed import MarketFeed
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
    """Check that this machine can actually reach the venue."""
    settings = Settings.from_env()
    checks = [
        ("gamma", endpoints.gamma_markets_by_slug("will-it-rain")),
        ("clob", f"{endpoints.CLOB_BASE}/ok"),
    ]
    failed = False
    for name, url in checks:
        try:
            response = httpx.get(url, timeout=settings.http_timeout_s)
            print(f"  {name:<8} {response.status_code}  {url}")
        except Exception as exc:  # noqa: BLE001
            failed = True
            print(f"  {name:<8} FAIL  {type(exc).__name__}: {exc}")
    print(f"  {'ws':<8} (not probed) {endpoints.CLOB_WS}")
    if failed:
        print("\nAt least one endpoint is unreachable. Check egress/DNS before")
        print("assuming the bot is broken.")
    return 1 if failed else 0


def cmd_market(args: argparse.Namespace) -> int:
    settings = Settings.from_env()
    markets = resolve_markets(args.market, settings)
    if not markets:
        print("error: no markets could be resolved", file=sys.stderr)
        return 1

    for market in markets:
        print(f"question    {market.question}")
        print(f"slug        {market.slug}")
        print(f"conditionId {market.condition_id}")
        print(f"closed      {market.closed}")
        for token in market.tokens:
            print(f"  {token.outcome:<12} {token.token_id}")
        print()

    if len(markets) > 1:
        plan = build_plan(markets)
        print(plan.describe())
    return 0


def _print_plan(plan: WatchPlan) -> None:
    for market in plan.markets:
        flag = "  [CLOSED]" if market.closed else ""
        print(f"{market.slug}{flag}")
        print(f"  {market.question}")
        for token in market.tokens:
            print(f"    {token.outcome:<12} {token.token_id}")
    print(f"\n{plan.describe()}\n")


async def _watch(
    refs: list[str], seconds: float | None, settings: Settings, stream_name: str
) -> int:
    markets = resolve_markets(refs, settings)
    if not markets:
        print("error: no markets could be resolved", file=sys.stderr)
        return 1

    try:
        plan = build_plan(markets)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if plan.closed_markets:
        names = ", ".join(m.slug for m in plan.closed_markets)
        print(f"warning: already-closed market(s): {names}", file=sys.stderr)

    _print_plan(plan)

    books = BookSet(plan.token_ids)
    feed = MarketFeed(list(plan.token_ids), settings=settings)
    width = label_width(plan.labels.values())

    with Journal(settings.journal_dir, stream_name) as journal:
        # One record per market, so `report` can label token ids later without
        # needing the network.
        for market in plan.markets:
            journal.write(
                "market",
                {
                    "condition_id": market.condition_id,
                    "slug": market.slug,
                    "question": market.question,
                    "closed": market.closed,
                    "tokens": [
                        {"token_id": t.token_id, "outcome": t.outcome}
                        for t in market.tokens
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

                # Record the raw message before interpreting it: a parser bug
                # should cost you a rerun, not the data.
                journal.write("raw", {"msg": message})

                book = books.handle(message)
                if book is None:
                    continue

                summary = book.summary()
                label = plan.label_for(book.token_id)
                journal.write("book", {"label": label, **summary})
                if summary["crossed"]:
                    journal.write("anomaly", {"reason": "crossed", "label": label, **summary})

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

    print(f"\njournal written to {settings.journal_dir}/")
    return 0


def cmd_watch(args: argparse.Namespace) -> int:
    settings = Settings.from_env()
    try:
        return asyncio.run(_watch(args.market, args.seconds, settings, args.name))
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
        print("\nper token")
        for label in sorted(updates, key=lambda k: -updates[k]):
            spreads = sorted(per_label.get(label, []))
            median = f"{spreads[len(spreads) // 2]:.4f}" if spreads else "-"
            print(f"  {label:<{width}}  updates={updates[label]:<7} median_spread={median}")

    reconnects = counts.get("reconnected", 0)
    if reconnects > 1:
        print(f"\n  feed reconnected {reconnects - 1} time(s) during this run")
    if anomalies:
        print(f"\n  {anomalies} crossed-book anomalies — investigate before trusting this data")
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
    )
    risk = RiskManager(
        RiskLimits(
            max_shares_per_token=args.max_shares,
            max_exposure=args.max_exposure,
            max_loss=args.max_loss,
            max_order_size=max(args.size, 1.0),
        )
    )
    broker = PaperBroker(fee_bps=args.fee_bps, queue_factor=args.queue_factor)

    result = run_replay(paths, strategy, risk=risk, broker=broker)

    print(f"strategy      {strategy.name} "
          f"(half_spread={args.half_spread}, size={args.size}, "
          f"min_edge={args.min_edge})")
    print(f"fill model    queue_factor={args.queue_factor}, fee_bps={args.fee_bps}")
    print(f"\nmessages      {result.messages}")
    print(f"book updates  {result.updates}")
    print(f"trade prints  {result.trades}")
    if result.reconnects:
        print(f"reconnects    {result.reconnects}  (books and orders dropped each time)")

    pf = result.portfolio
    print(f"\nfills         {pf.fills}")
    print(f"volume        {pf.volume:,.2f} USDC")
    print(f"fees          {pf.fees_paid:,.4f} USDC")
    print(f"\nrealized      {result.realized:+,.4f} USDC")
    print(f"unrealized    {result.unrealized:+,.4f} USDC")
    print(f"total         {result.total_pnl:+,.4f} USDC")

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
        if args.queue_factor >= 1.0:
            print("\n  queue_factor=1.0 assumes you are always first in the queue. "
                  "You are\n  not. This number is optimistic by construction.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pmbot", description=__doc__)
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("doctor", help="check connectivity to the venue").set_defaults(
        func=cmd_doctor
    )

    p_market = sub.add_parser("market", help="resolve markets to their token ids")
    p_market.add_argument("market", nargs="+", help="Polymarket URL(s) or slug(s)")
    p_market.set_defaults(func=cmd_market)

    p_watch = sub.add_parser(
        "watch",
        help="stream one or more markets' order books over a single connection",
    )
    p_watch.add_argument("market", nargs="+", help="Polymarket URL(s) or slug(s)")
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
    p_back.add_argument("--queue-factor", type=float, default=0.5,
                        help="haircut on every fill; 1.0 assumes perfect queue position")
    p_back.add_argument("--fee-bps", type=float, default=0.0)
    p_back.add_argument("--max-shares", type=float, default=500.0)
    p_back.add_argument("--max-exposure", type=float, default=1000.0)
    p_back.add_argument("--max-loss", type=float, default=100.0)
    p_back.set_defaults(func=cmd_backtest)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _log_setup(args.verbose)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
