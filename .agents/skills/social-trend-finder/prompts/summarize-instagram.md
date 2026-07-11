# Instagram Summary

Use the `instagram.reels` array (already ranked by velocity, highest first, and
capped at 2 reels per creator so no single account dominates). Show up to 5.

For each reel:
- The creator `@owner` and a short gloss of the `caption` (linked to `url`).
- Show `like_count`, `comments_count`, and `play_count` if present.
- `velocity` = weighted engagement (likes + comments×3) per hour, recency-decayed
  — it reflects what's **accelerating now**, not lifetime totals.
- `norm` (0–100) compares reels against each other in this list.

Then write a 2-sentence **Take**:
1. What the format/hook pattern signals about audience behaviour right now.
2. One specific reel idea the team should produce this week.
