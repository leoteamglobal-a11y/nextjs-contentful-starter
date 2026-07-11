# TikTok Summary

**Rising hashtags** — use `tiktok.hashtags` (popular hashtags, ranked by views,
deduplicated across countries). Show up to 6:
- `#<hashtag>` with `view_count` and `video_count`.
- `rank` is TikTok's own popularity rank; `rank_diff` shows movement (a positive
  jump = climbing fast). `norm` (0–100) compares hashtags in this list.

**Trending sounds** — use `tiktok.sounds` if present (best-effort; may be empty
on some runs). Show up to 5:
- Sound title, artist/author if present, and video count + region.
- If `tiktok.sounds` is empty, write "No sound data this run." — do not invent.

Then write a 2-sentence **Take**:
1. What the hashtags/sounds signal about culture or audience interest right now.
2. One specific, actionable recommendation for the team this week.
