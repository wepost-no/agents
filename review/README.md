<img src="./banner.png" alt="PR Reviewer">

Review Agent
==================

Instantly launch this agent on Agent Relay

[![Launch Agent](https://agentrelay.com/launch-agent_small.svg)](https://agentrelay.com/cloud/deploy?persona=https://github.com/AgentWorkforce/agents/blob/main/review/persona.ts)

A conservative PR reviewer that posts a multi-agent review when a PR opens.
It may auto-apply only lint, formatting, typo, import-order, and other
mechanical non-semantic fixes. Logic changes, safety-sensitive code, lifecycle
or termination paths, and test changes are suggestion/comment-only so a human
author owns them. Its review comment says when a PR is ready for your review,
and it can merge the PR if you approve.

## What a review looks like

One comment per review, rendered by code from a JSON report the agent ends its
run with, so every review has the same shape:

- **The heading is the verdict:** `🔴 1 P0 · 🟠 2 P1`, or `✅ No issues found`.
- **Findings, most severe first, at most five**, in the format Codex's reviews
  use: a P0/P1/P2 badge and a one-line title, a permalink GitHub shows as a code
  snippet, and one paragraph on what triggers it, what breaks, and the fix.
  - **P0** must fix before merge: breaks the build or a test, crashes or
    corrupts data on a common path, or opens a security hole.
  - **P1** should fix before merge: a real bug in a realistic scenario.
  - **P2** worth fixing, not blocking: needs unusual input or timing, or is a
    concrete performance or maintenance hazard.
- Any mechanical fixes it made, then the checks it ran, folded away.

It posts nothing when a run fails (that goes to the logs), or when a newer push
landed while it was reviewing (the run for that push reviews the new head).

## Cross-model review

No model reviews its own work. This reviewer runs twice, once per model family,
and the two split the PRs by who wrote the code:

| PR written by | Reviewed by |
| --- | --- |
| Claude (the "Generated with Claude Code" footer or a Claude co-author line) | [`review-codex`](../review-codex/) on Codex, `gpt-5.5` |
| Codex (a Codex task link or a `codex/` branch) | this reviewer on Claude, `claude-opus-4-8` |
| anything unmarked (a person) | this reviewer on Claude |

`REVIEWS_PRS_WRITTEN_BY` sets which PRs each one takes. Each review names the
model that wrote it, since both post as the same bot. Without the Codex
reviewer deployed, deploy this one with
`REVIEWS_PRS_WRITTEN_BY=claude,codex,other` so every PR is still reviewed.

## Resolving merge conflicts (opt-in)

Comment **`@relay fix conflicts`** on a PR and the agent resolves its merge
conflicts: cloud merges the base branch into the working tree, the agent
resolves the conflict markers (preserving both sides' intent, never weakening
tests or flipping safety defaults), verifies the merged tree against the repo's
CI command, and cloud finalizes and pushes the merge commit. A conflict that
needs human judgment is left in place and called out in a comment rather than
guessed at — so a risky half-merge is never pushed.

This never runs on its own; only an explicit directive comment triggers it, and
only from the PR author or a login in `APPROVERS` / `REVIEW_AUTHORS` (when those
are set). It is enabled by the `conflictResolve` capability in `persona.ts` and
depends on cloud support for the merge-in-tree + finalize-push flow.
