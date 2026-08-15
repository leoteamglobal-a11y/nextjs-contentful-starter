"""Command line entry point.

    python -m pmbot.cli doctor
    python -m pmbot.cli market <url-or-slug>
    python -m pmbot.cli watch  <url-or-slug> [--seconds N]
    python -m pmbot.cli report <journal-file.jsonl>

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
from .discovery import DiscoveryError, fetch_market
from .feed import MarketFeed
from .journal import Journal, replay


def _log_setup(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )


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
    try:
        market = fetch_market(args.market, timeout_s=settings.http_timeout_s)
    except (DiscoveryError, httpx.HTTPError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(f"question    {market.question}")
    print(f"slug        {market.slug}")
    print(f"conditionId {market.condition_id}")
    print(f"closed      {market.closed}")
    for token in market.tokens:
        print(f"  {token.outcome:<12} {token.token_id}")
    return 0


async def _watch(market_ref: str, seconds: float | None, settings: Settings) -> int:
    try:
        market = fetch_market(market_ref, timeout_s=settings.http_timeout_s)
    except (DiscoveryError, httpx.HTTPError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if market.closed:
        print(f"warning: market {market.slug!r} is closed", file=sys.stderr)

    print(f"watching: {market.question}")
    for token in market.tokens:
        print(f"  {token.outcome:<12} {token.token_id}")
    print()

    books = BookSet(market.token_ids)
    labels = {t.token_id: t.outcome for t in market.tokens}
    feed = MarketFeed(list(market.token_ids), settings=settings)

    with Journal(settings.journal_dir, f"feed-{market.slug or 'market'}") as journal:
        journal.write(
            "market",
            {
                "condition_id": market.condition_id,
                "slug": market.slug,
                "question": market.question,
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
                    # Missed increments cannot be recovered: throw the books
                    # away and wait for fresh snapshots.
                    books_reset = BookSet(market.token_ids)
                    books.__dict__.update(books_reset.__dict__)
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
                journal.write("book", summary)
                if summary["crossed"]:
                    journal.write("anomaly", {"reason": "crossed", **summary})

                outcome = labels.get(book.token_id, book.token_id[:10])
                bid = summary["best_bid"]
                ask = summary["best_ask"]
                mid = summary["mid"]
                print(
                    f"  {outcome:<10} "
                    f"bid {bid if bid is not None else '-':<8} "
                    f"ask {ask if ask is not None else '-':<8} "
                    f"spread {summary['spread'] if summary['spread'] is not None else '-':<8} "
                    f"mid {mid if mid is not None else '-'}"
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
        return asyncio.run(_watch(args.market, args.seconds, settings))
    except KeyboardInterrupt:
        return 130


def cmd_report(args: argparse.Namespace) -> int:
    """Summarise a journal: how much data, how stable was the connection."""
    path = Path(args.journal)
    if not path.exists():
        print(f"error: no such journal: {path}", file=sys.stderr)
        return 1

    counts: dict[str, int] = {}
    spreads: list[float] = []
    anomalies = 0
    for record in replay(path):
        kind = str(record.get("kind"))
        counts[kind] = counts.get(kind, 0) + 1
        if kind == "book" and isinstance(record.get("spread"), (int, float)):
            spreads.append(float(record["spread"]))
        if kind == "anomaly":
            anomalies += 1

    print(f"journal   {path}")
    for kind, count in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {kind:<14} {count}")
    if spreads:
        spreads.sort()
        print(f"  spread    min={spreads[0]:.4f} "
              f"median={spreads[len(spreads) // 2]:.4f} max={spreads[-1]:.4f}")
    if anomalies:
        print(f"\n  {anomalies} crossed-book anomalies — investigate before trusting this data")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pmbot", description=__doc__)
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("doctor", help="check connectivity to the venue").set_defaults(
        func=cmd_doctor
    )

    p_market = sub.add_parser("market", help="resolve a market to its token ids")
    p_market.add_argument("market", help="Polymarket URL or slug")
    p_market.set_defaults(func=cmd_market)

    p_watch = sub.add_parser("watch", help="stream a market's order book")
    p_watch.add_argument("market", help="Polymarket URL or slug")
    p_watch.add_argument("--seconds", type=float, default=None, help="stop after N s")
    p_watch.set_defaults(func=cmd_watch)

    p_report = sub.add_parser("report", help="summarise a journal file")
    p_report.add_argument("journal", help="path to a .jsonl journal")
    p_report.set_defaults(func=cmd_report)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _log_setup(args.verbose)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
