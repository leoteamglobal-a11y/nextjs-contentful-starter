"""Append-only JSONL journal.

Everything the bot sees and every decision it makes lands here. Two reasons:

1. You cannot backtest a strategy you did not record. Phase 2 (paper
   trading) replays these files.
2. When something goes wrong at 3am, the journal is the only account of what
   the bot believed at the time.

One file per stream per UTC day. Writes are flushed immediately — a crash
should never cost you the line that explains the crash.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from types import TracebackType
from typing import Any, Iterator


class Journal:
    def __init__(self, directory: Path, stream: str) -> None:
        self.directory = Path(directory)
        self.stream = stream
        self.directory.mkdir(parents=True, exist_ok=True)
        self._handle = None
        self._day: str | None = None

    def _file_for(self, day: str) -> Path:
        return self.directory / f"{self.stream}-{day}.jsonl"

    def _rotate_if_needed(self, day: str) -> None:
        if self._day == day and self._handle is not None:
            return
        if self._handle is not None:
            self._handle.close()
        self._handle = self._file_for(day).open("a", encoding="utf-8")
        self._day = day

    def write(self, kind: str, payload: dict[str, Any]) -> None:
        now = datetime.now(timezone.utc)
        self._rotate_if_needed(now.strftime("%Y-%m-%d"))
        record = {"ts": now.isoformat(), "kind": kind, **payload}
        assert self._handle is not None
        self._handle.write(json.dumps(record, separators=(",", ":")) + "\n")
        self._handle.flush()

    def close(self) -> None:
        if self._handle is not None:
            self._handle.close()
            self._handle = None
            self._day = None

    def __enter__(self) -> "Journal":
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()


def replay(path: Path, kind: str | None = None) -> Iterator[dict[str, Any]]:
    """Read a journal back, skipping any line truncated by a hard kill."""
    with Path(path).open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if kind is None or record.get("kind") == kind:
                yield record
