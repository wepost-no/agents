/**
 * The review comment. The harness ends its reply with one fenced json report
 * (the OUTPUT part of reviewHarnessPrompt) and the comment is rendered from it
 * here, so every review has the same shape however the model phrases its work.
 * A finding is built from the pieces Codex's reviews use on the same PRs, title
 * first so a list of findings scans by its claims: a P0/P1/P2 badge with a
 * one-line title, the permalink GitHub embeds as a code snippet, one paragraph.
 */

export type Priority = 'P0' | 'P1' | 'P2';

export interface ReviewFinding {
  priority: Priority;
  title: string;
  path?: string;
  line?: number;
  endLine?: number;
  body: string;
}

export interface ReviewReport {
  findings: ReviewFinding[];
  /** Mechanical edits the harness left in the working tree for cloud to push. */
  fixes: string[];
  /** One line per verification step, run or not, with its result. */
  checks: string[];
}

const PRIORITY_STYLE: Record<Priority, { emoji: string; badgeColor: string }> = {
  P0: { emoji: '🔴', badgeColor: 'red' },
  P1: { emoji: '🟠', badgeColor: 'orange' },
  P2: { emoji: '🟡', badgeColor: 'yellow' },
};

/**
 * The report in the LAST ```json block of the harness reply (an earlier block
 * may be an example it quoted), findings sorted P0 first. Undefined when there
 * is no such block or it isn't a report: that output is narration, not a review.
 */
export function parseReviewReport(output: string): ReviewReport | undefined {
  const blocks = [...output.matchAll(/```json[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/gi)];
  const json = blocks.at(-1)?.[1];
  if (!json) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return undefined;
  }
  const raw = value as { findings?: unknown; fixes?: unknown; checks?: unknown } | null;
  if (!raw || !Array.isArray(raw.findings)) return undefined;
  const findings = raw.findings
    .map(readFinding)
    .filter((finding): finding is ReviewFinding => finding !== undefined)
    // Stable sort: equal priorities keep the harness's own order.
    .sort((a, b) => a.priority.localeCompare(b.priority));
  return { findings, fixes: readLines(raw.fixes), checks: readLines(raw.checks) };
}

/** One finding, or undefined without a valid priority and title. A P3 or nit is
 *  dropped, not shown as P2: the prompt keeps those off the PR. */
function readFinding(value: unknown): ReviewFinding | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const f = value as Record<string, unknown>;
  const priority = readText(f.priority).toUpperCase();
  const title = readText(f.title);
  if (!/^P[012]$/.test(priority) || !title) return undefined;
  const path = readText(f.path).replace(/^\.?\/+/, '');
  return {
    priority: priority as Priority,
    title,
    ...(path ? { path, ...readLineRange(f.line, f.endLine) } : {}),
    body: typeof f.body === 'string' ? f.body.trim() : '',
  };
}

/** A string field on one line, or '' when it isn't a string. */
function readText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function readLines(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : [];
}

function readLineRange(line: unknown, endLine: unknown): { line?: number; endLine?: number } {
  const start = positiveInteger(line);
  if (!start) return {};
  const end = positiveInteger(endLine);
  return end && end > start ? { line: start, endLine: end } : { line: start };
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

/**
 * The PR comment. Verdict first, so the heading alone says whether there is
 * anything to act on; then the findings, any mechanical fixes, and the checks
 * folded into a <details> nobody has to scroll past. `sha` is the reviewed
 * commit; without one, a location falls back to plain `path:line`. `reviewer`
 * is the model that reviewed, since a Claude and a Codex deployment post as the
 * same bot.
 */
export function renderReview(
  report: ReviewReport,
  pr: { owner: string; repo: string; sha?: string; reviewer?: string },
  ready = false,
): string {
  const sha = pr.sha && /^[0-9a-f]{7,40}$/i.test(pr.sha) ? pr.sha : undefined;
  const counts = (['P0', 'P1', 'P2'] as const)
    .map((priority) => ({ priority, count: report.findings.filter((f) => f.priority === priority).length }))
    .filter(({ count }) => count > 0)
    .map(({ priority, count }) => `${PRIORITY_STYLE[priority].emoji} ${count} ${priority}`);
  const lines = [`### ${counts.length ? counts.join(' · ') : '✅ No issues found'}`];
  const byline = [
    ...(sha ? [`**Reviewed commit:** \`${sha.slice(0, 10)}\``] : []),
    ...(pr.reviewer ? [`**Reviewer:** \`${pr.reviewer}\``] : []),
  ];
  if (byline.length) lines.push('', byline.join(' · '));
  report.findings.forEach((finding, i) => {
    lines.push('', ...(i > 0 ? ['---', ''] : []), ...renderFinding(finding, pr, sha));
  });
  if (report.fixes.length) {
    lines.push('', '🔧 **Mechanical fixes:**', ...report.fixes.map((fix) => `- ${fix}`));
  }
  if (report.checks.length) {
    lines.push('', '<details><summary>Checks run</summary>', '', ...report.checks.map((check) => `- ${check}`), '', '</details>');
  }
  if (ready) lines.push('', ':white_check_mark: This PR is ready for your review.');
  return lines.join('\n');
}

function renderFinding(
  finding: ReviewFinding,
  pr: { owner: string; repo: string },
  sha: string | undefined,
): string[] {
  const { priority, title, path, line, endLine, body } = finding;
  const badge = `![${priority} Badge](https://img.shields.io/badge/${priority}-${PRIORITY_STYLE[priority].badgeColor}?style=flat)`;
  let location: string | undefined;
  if (path && sha) {
    // A same-repo blob permalink on its own line is what GitHub embeds as a snippet.
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const range = line ? `#L${line}${endLine ? `-L${endLine}` : ''}` : '';
    location = `https://github.com/${pr.owner}/${pr.repo}/blob/${sha}/${encoded}${range}`;
  } else if (path) {
    location = `\`${path}${line ? `:${line}` : ''}\``;
  }
  return [
    `**<sub><sub>${badge}</sub></sub>  ${title}**`,
    ...(location ? ['', location] : []),
    ...(body ? ['', body] : []),
  ];
}
