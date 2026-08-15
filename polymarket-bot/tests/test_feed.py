import json

import pytest

from pmbot.feed import MarketFeed, _decode


def test_subscribe_payload_lists_every_token():
    feed = MarketFeed(["a", "b"])
    payload = json.loads(feed._subscribe_payload())
    assert payload == {"assets_ids": ["a", "b"], "type": "market"}


def test_feed_requires_tokens():
    with pytest.raises(ValueError):
        MarketFeed([])


def test_decode_handles_single_object():
    assert _decode('{"event_type": "book"}') == [{"event_type": "book"}]


def test_decode_handles_batched_array():
    raw = '[{"event_type": "book"}, {"event_type": "price_change"}]'
    assert [m["event_type"] for m in _decode(raw)] == ["book", "price_change"]


def test_decode_handles_bytes():
    assert _decode(b'{"event_type": "book"}') == [{"event_type": "book"}]


@pytest.mark.parametrize("raw", ["", "   ", "PONG", "not json", "[1, 2, 3]", '"str"'])
def test_decode_drops_junk_without_raising(raw):
    assert _decode(raw) == []
