from pmbot.journal import Journal, replay


def test_write_and_replay_roundtrip(tmp_path):
    with Journal(tmp_path, "feed") as journal:
        journal.write("book", {"mid": 0.5})
        journal.write("raw", {"msg": {"event_type": "book"}})

    files = list(tmp_path.glob("feed-*.jsonl"))
    assert len(files) == 1

    records = list(replay(files[0]))
    assert [r["kind"] for r in records] == ["book", "raw"]
    assert records[0]["mid"] == 0.5
    assert "ts" in records[0]


def test_replay_filters_by_kind(tmp_path):
    with Journal(tmp_path, "feed") as journal:
        journal.write("book", {"mid": 0.5})
        journal.write("anomaly", {"reason": "crossed"})

    path = next(tmp_path.glob("feed-*.jsonl"))
    assert [r["kind"] for r in replay(path, kind="anomaly")] == ["anomaly"]


def test_replay_skips_truncated_final_line(tmp_path):
    """A hard kill mid-write must not make the whole journal unreadable."""
    with Journal(tmp_path, "feed") as journal:
        journal.write("book", {"mid": 0.5})

    path = next(tmp_path.glob("feed-*.jsonl"))
    with path.open("a") as handle:
        handle.write('{"kind": "book", "mid": 0.6')  # no newline, no close brace

    records = list(replay(path))
    assert len(records) == 1
    assert records[0]["mid"] == 0.5
