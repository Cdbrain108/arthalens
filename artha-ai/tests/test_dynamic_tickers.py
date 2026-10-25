"""Tests verifying dynamic universal ticker and exchange resolution across global markets."""

from app.tools.base import resolve_ticker_info, resolve_ticker_symbol
from app.tools.market_tools import _suffix
from app.tools.financial_tools import _resolve_symbol
from app.agents.collectors import _resolve_ent_exchange


def test_us_equities_resolve_dynamically():
    """US tickers without specified exchange resolve to bare symbols without hardcoded dicts."""
    for ticker in ["PLTR", "NVDA", "CRWD", "ASML", "SMCI", "ARM", "TSLA"]:
        info = resolve_ticker_info(ticker)
        assert info["symbol"] == ticker
        assert "." not in info["symbol"]
        assert _suffix(ticker) == ticker
        assert _resolve_symbol(ticker) == ticker


def test_indian_equities_resolve_dynamically():
    """Indian tickers resolve to .NS on NSE unless specified otherwise."""
    info_tcs = resolve_ticker_info("TCS")
    assert info_tcs["symbol"] == "TCS.NS"
    assert info_tcs["exchange"] == "NSE"

    info_suzlon = resolve_ticker_info("SUZLON")
    assert info_suzlon["symbol"] == "SUZLON.NS"
    assert info_suzlon["exchange"] == "NSE"

    # Explicit BSE override
    assert resolve_ticker_symbol("TCS", "BSE") == "TCS.BO"


def test_indices_and_foreign_exchanges_pass_through():
    """Index symbols (^NSEI, ^GSPC) and pre-suffixed foreign equities pass through cleanly."""
    assert resolve_ticker_symbol("^NSEI") == "^NSEI"
    assert resolve_ticker_symbol("^GSPC", "") == "^GSPC"
    assert resolve_ticker_symbol("SAP.DE") == "SAP.DE"
    assert resolve_ticker_symbol("7203.T") == "7203.T"


def test_clean_string_and_null_exchange_normalization():
    """Dollar prefixes and 'null' strings are normalized."""
    assert resolve_ticker_symbol("$TCS", "null") == "TCS.NS"
    assert resolve_ticker_symbol("$NVDA", "none") == "NVDA"
    assert resolve_ticker_symbol("AAPL", "NASDAQ") == "AAPL"


def test_collector_entity_exchange_resolution():
    """Collectors resolve exchange dynamically from entity name or ticker."""
    ent_us = {"name": "Palantir Technologies", "ticker": "PLTR"}
    assert _resolve_ent_exchange(ent_us) in ("NASDAQ", "NYSE")

    ent_in = {"name": "Suzlon Energy", "ticker": "SUZLON"}
    assert _resolve_ent_exchange(ent_in) == "NSE"

    # When exchange is already provided explicitly, it respects it
    ent_custom = {"name": "Custom Corp", "ticker": "XYZ", "exchange": "BSE"}
    assert _resolve_ent_exchange(ent_custom) == "BSE"
