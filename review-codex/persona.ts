import { definePersona } from '@agentworkforce/persona-kit';
import claudeReviewer from '../review/persona.js';

/**
 * The Codex half of the cross-model review: the same reviewer as review/ (one
 * handler, prompt and comment format) run on Codex, for the PRs Claude wrote.
 * The Claude reviewer takes the rest, so no model grades its own work — see
 * REVIEWS_PRS_WRITTEN_BY and reviewedElsewhere in review/agent.ts.
 */
export default definePersona({
  ...claudeReviewer,
  id: 'pr-reviewer-codex',
  description: 'Codex review of the PRs Claude wrote, in the same P0/P1/P2 format as pr-reviewer: applies only lint/format/typo fixes, comments on logic or safety findings, and merges once you approve.',

  inputs: {
    ...claudeReviewer.inputs,
    REVIEWS_PRS_WRITTEN_BY: {
      description: 'Only review PRs whose code was written by these (comma-separated: claude, codex, other). claude,codex,other reviews every PR.',
      env: 'REVIEWS_PRS_WRITTEN_BY',
      default: 'claude'
    }
  },

  // useSubscription (from the Claude reviewer) runs this on the OpenAI
  // credential connected in Workspace Integrations: a ChatGPT sign-in
  // (harness source `oauth`) or an API key (`byok`).
  harness: 'codex',
  model: 'gpt-5.5',
  harnessSettings: {
    ...claudeReviewer.harnessSettings,
    // Daytona is the trust boundary for cloud fires. Codex's nested bubblewrap
    // sandbox needs user namespaces Daytona does not allow (same setting and
    // reason as cloud-team-implementer).
    dangerouslyBypassApprovalsAndSandbox: true
  }
});
