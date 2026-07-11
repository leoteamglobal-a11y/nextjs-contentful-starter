# YouTube Summary

Two ranked lists, both capped at 2 videos per channel:

**Shorts / Reels** — use `youtube.shorts` (videos ≤ 60 seconds). Show up to 5:
- `title` (linked to `url`), `channel`, and `views` (plus `likes` if present).

**Long-form** — use `youtube.long`. Show up to 3:
- `title` (linked to `url`), `channel`, `views`, and `duration` in minutes.

For both, `velocity` = weighted engagement (views + likes×3 + comments×5) per
hour since upload, recency-decayed — it reflects what's **accelerating**, not
just lifetime view totals. `norm` (0–100) compares videos within each list.

Then write a 2-sentence **Take**:
1. What the format/topic split signals (e.g. short-form hook styles vs.
   long-form deep dives the audience is watching).
2. One specific, produceable video idea for the team this week.
