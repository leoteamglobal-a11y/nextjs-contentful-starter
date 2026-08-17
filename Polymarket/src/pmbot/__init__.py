"""A trading bot for Polymarket US, the CFTC-regulated exchange.

This targets polymarket.us — the KYC'd, USD-settled, CFTC-regulated venue —
and not polymarket.com. They are different exchanges with different APIs;
an account and a balance on one does not exist on the other.

Reading, recording and backtesting need only an API key and cannot place an
order. The one module that can, `pmbot.live`, imports its SDK lazily and
asks before it does anything.
"""

__version__ = "0.2.0"

__all__ = ["__version__"]
