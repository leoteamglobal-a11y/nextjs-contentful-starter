# Reddit Summary

Use the `reddit.posts` array (already ranked by velocity, highest first, and
capped at 3 posts per author so no one account dominates). Show up to 5.

For each post:
- `r/<subreddit>` — the post `title` (linked to `permalink`).
- Show `score` (net upvotes) and `num_comments`.
- `velocity` = weighted engagement (upvotes + comments×3) per hour, recency-decayed.
  A high velocity means the thread is **heating up now**, not just old and big.
- `norm` is a 0–100 score for comparing this post against the other Reddit posts.

Then write a 2-sentence **Take**:
1. What the conversation signals about how the audience is talking right now
   (problems, desires, language they use).
2. One specific content or product action for the team this week.
