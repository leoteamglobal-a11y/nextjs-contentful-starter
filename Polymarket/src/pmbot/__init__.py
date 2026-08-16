"""Read-only Polymarket market-data client.

Phase 1 of a trading bot: observe and record. This package contains no
order-signing code and no private key handling, by design — you cannot lose
money with it, which makes it the right place to find out whether you have
an edge at all.
"""

__version__ = "0.1.0"

__all__ = ["__version__"]
