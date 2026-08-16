"""Generate a synthetic journal so the backtest can be exercised without data.

This is a test harness, NOT a market simulator. The price is a random walk
with a fixed spread: there is no order flow, no adverse selection beyond
what the walk produces by accident, and no relationship to how Polymarket
actually behaves.

Use it to check that the machinery runs and that your strategy parameters
do what you think. Never use it to decide whether a strategy is profitable
— a random walk with a constant spread is exactly the world in which naive
market making looks like free money, and the real world is not that world.

    python tools/synth_journal.py --out journal/synthetic.jsonl --updates 2000
"""

from __future__ import annotations

import argparse
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path


def generate(
    path: Path,
    updates: int,
    seed: int,
    spread: float,
    volatility: float,
    depth: float,
    reconnect_every: int,
    trade_rate: float,
) -> None:
    rng = random.Random(seed)
    path.parent.mkdir(parents=True, exist_ok=True)
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)

    tokens = [("t-yes", "Yes", 0.50), ("t-no", "No", 0.50)]

    with path.open("w", encoding="utf-8") as handle:

        def emit(kind: str, payload: dict, i: int) -> None:
            record = {
                "ts": (start + timedelta(seconds=i)).isoformat(),
                "kind": kind,
                **payload,
            }
            handle.write(json.dumps(record, separators=(",", ":")) + "\n")

        emit(
            "market",
            {
                "condition_id": "0xsynthetic",
                "slug": "synthetic-market",
                "question": "Synthetic random walk (NOT a real market)",
                "closed": False,
                "tokens": [
                    {"token_id": tid, "outcome": out} for tid, out, _ in tokens
                ],
            },
            0,
        )
        emit("reconnected", {"n": 0}, 0)

        mids = {tid: mid for tid, _, mid in tokens}
        for i in range(1, updates + 1):
            tid, _, _ = tokens[i % len(tokens)]
            mid = mids[tid] + rng.gauss(0, volatility)
            mid = min(max(mid, 0.05), 0.95)
            mids[tid] = mid

            half = spread / 2
            bid = round(round((mid - half) / 0.01) * 0.01, 2)
            ask = round(round((mid + half) / 0.01) * 0.01, 2)
            if ask <= bid:
                ask = round(bid + 0.01, 2)

            emit(
                "raw",
                {
                    "msg": {
                        "event_type": "book",
                        "asset_id": tid,
                        "timestamp": str(1739000000000 + i * 1000),
                        "bids": [
                            {"price": f"{bid:.2f}", "size": f"{depth:.0f}"},
                            {"price": f"{bid - 0.01:.2f}", "size": f"{depth * 2:.0f}"},
                        ],
                        "asks": [
                            {"price": f"{ask:.2f}", "size": f"{depth:.0f}"},
                            {"price": f"{ask + 0.01:.2f}", "size": f"{depth * 2:.0f}"},
                        ],
                    }
                },
                i,
            )

            # Trade prints: the path by which a resting maker quote actually
            # gets filled. Without these a book-only journal makes market
            # making look impossible rather than merely hard.
            if rng.random() < trade_rate:
                aggressive = rng.random() < 0.5
                trade_price = ask if aggressive else bid
                # Occasionally a taker sweeps past the touch, which is what
                # reaches quotes resting outside the spread.
                if rng.random() < 0.25:
                    trade_price = round(
                        trade_price + (0.02 if aggressive else -0.02), 2
                    )
                emit(
                    "raw",
                    {
                        "msg": {
                            "event_type": "last_trade_price",
                            "asset_id": tid,
                            "price": f"{min(max(trade_price, 0.01), 0.99):.2f}",
                            "size": f"{rng.randint(10, 120)}",
                        }
                    },
                    i,
                )

            if reconnect_every and i % reconnect_every == 0:
                emit("disconnected", {"error": "synthetic drop"}, i)
                emit("reconnected", {"n": i // reconnect_every}, i)

    print(f"wrote {updates} updates to {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="journal/synthetic.jsonl")
    parser.add_argument("--updates", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--spread", type=float, default=0.04)
    parser.add_argument("--volatility", type=float, default=0.004)
    parser.add_argument("--depth", type=float, default=200.0)
    parser.add_argument("--reconnect-every", type=int, default=0)
    parser.add_argument("--trade-rate", type=float, default=0.3,
                        help="probability of a trade print per update")
    args = parser.parse_args()

    generate(
        Path(args.out),
        args.updates,
        args.seed,
        args.spread,
        args.volatility,
        args.depth,
        args.reconnect_every,
        args.trade_rate,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
