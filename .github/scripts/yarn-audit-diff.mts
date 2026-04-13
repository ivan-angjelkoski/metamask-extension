import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { IncomingWebhook } from '@slack/webhook';
import {
  AUDIT_BASELINE_FILE,
  AUDIT_CURRENT_FILE,
  AUDIT_DETAILS_FILE,
  AUDIT_NATIVE_FILE,
  BLOCKING_SEVERITIES,
  type ParsedAdvisory,
  extractNativeBlocks,
  formatAdvisoryTree,
  githubAnnotate,
  stripAnsi,
  writeStepSummary,
} from './shared/audit-utils.mts';
import { ghApi } from './shared/gh-api.mts';
import { getGitHubToken } from './shared/github-token.mts';

// ---------------------------------------------------------------------------
// Pipeline contract
// ---------------------------------------------------------------------------
// This script is step 2 of the audit pipeline:
//   1. yarn-audit-and-triage.mts  → writes AUDIT_CURRENT_FILE & AUDIT_DETAILS_FILE
//   2. yarn-audit-diff.mts (this) → reads both, compares current vs baseline
//
// Runs on both PRs (blocks merge) and push-to-main (sends Slack alert).
// The workflow only invokes this script when a real baseline was downloaded
// from a completed push-to-main run. The `finally` block appends the details
// file (written by step 1) to the step summary after the diff verdict.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readAdvisories(filePath: string): ParsedAdvisory[] | null {
  try {
    const text = readFileSync(filePath, 'utf8').trim();
    if (!text || text === '[]') {
      return [];
    }
    return JSON.parse(text) as ParsedAdvisory[];
  } catch {
    return null;
  }
}

function sevLabel(a: ParsedAdvisory): string {
  return (a.effectiveSeverity ?? 'unknown').toUpperCase();
}

// ---------------------------------------------------------------------------
// GitHub issue creation (push-to-main only)
// ---------------------------------------------------------------------------

/**
 * Create (or find existing) tracking issue for new advisories detected on
 * push-to-main.  Uses a content-hash in the title so the same set of
 * advisories never opens a duplicate issue.
 */
function maybeCreateIssue(
  advisories: ParsedAdvisory[],
  blockingAdvisories: ParsedAdvisory[],
  treeText: string,
): string | null {
  if (
    process.env.GITHUB_EVENT_NAME !== 'push' ||
    advisories.length === 0
  ) {
    return null;
  }

  const full = process.env.GITHUB_REPOSITORY;
  if (!full) {
    githubAnnotate('warning', 'GITHUB_REPOSITORY not set — skipping issue creation.');
    return;
  }
  const [owner, repo] = full.split('/');
  if (!owner || !repo) return;

  let token: string;
  try {
    token = getGitHubToken();
  } catch {
    githubAnnotate('warning', 'No GitHub token available — skipping issue creation.');
    return null;
  }

  // Deterministic hash so we don't open duplicates for the same advisory set.
  const contentKey = createHash('sha256')
    .update(
      JSON.stringify(
        advisories
          .map((a) => a.id)
          .filter((id): id is number => id !== null)
          .sort((a, b) => a - b),
      ),
    )
    .digest('hex')
    .slice(0, 10);

  const title = `Yarn Audit: new advisories on main (${contentKey})`;

  // Search for existing issue with same title.
  try {
    const q = `repo:${owner}/${repo} type:issue in:title "${title}"`;
    const raw = ghApi(
      `/search/issues?q=${encodeURIComponent(q)}`,
      undefined,
      token,
    );
    const json = JSON.parse(raw) as {
      items?: Array<{ number?: number; title?: string }>;
    };
    const match = json.items?.find((item) => item.title === title);
    if (typeof match?.number === 'number') {
      const url = `https://github.com/${owner}/${repo}/issues/${match.number}`;
      githubAnnotate('notice', `Tracking issue already exists: ${url}`);
      return url;
    }
  } catch {
    // Search failed — proceed to create (worst case: a duplicate).
  }

  const runId = process.env.GITHUB_RUN_ID ?? '';
  const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${runId}`;
  const branch = process.env.BRANCH ?? 'main';
  const blockingCount = blockingAdvisories.length;

  const bodyLines: string[] = [
    `**${advisories.length}** new advisor${advisories.length === 1 ? 'y' : 'ies'} detected on push to \`${branch}\` (${blockingCount} release-blocking).`,
    '',
    `CI run: ${runUrl}`,
    '',
  ];

  if (blockingAdvisories.length > 0) {
    bodyLines.push('## Release-blocking (production, moderate+)');
    bodyLines.push('');
    for (const a of blockingAdvisories) {
      bodyLines.push(`- **${a.moduleName}** (${a.effectiveSeverity}) — ${a.title}`);
      bodyLines.push(`  ${a.url}`);
    }
    bodyLines.push('');
  }

  const informational = advisories.filter((a) => !blockingAdvisories.includes(a));
  if (informational.length > 0) {
    bodyLines.push('## Informational (dev-only or low severity)');
    bodyLines.push('');
    for (const a of informational) {
      const scope = a.affectsProduction ? 'production' : 'dev-only';
      bodyLines.push(`- **${a.moduleName}** (${a.effectiveSeverity}, ${scope}) — ${a.title}`);
      bodyLines.push(`  ${a.url}`);
    }
    bodyLines.push('');
  }

  bodyLines.push('<details><summary>Native audit tree</summary>');
  bodyLines.push('');
  bodyLines.push('```');
  bodyLines.push(treeText);
  bodyLines.push('```');
  bodyLines.push('</details>');

  try {
    const raw = ghApi(
      `/repos/${owner}/${repo}/issues`,
      { method: 'POST', body: { title, body: bodyLines.join('\n') } },
      token,
    );
    const json = JSON.parse(raw) as { number?: number };
    if (typeof json.number === 'number') {
      const url = `https://github.com/${owner}/${repo}/issues/${json.number}`;
      githubAnnotate('notice', `Created tracking issue: ${url}`);
      return url;
    }
  } catch (error) {
    githubAnnotate(
      'warning',
      `Failed to create tracking issue: ${String(error)}`,
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Slack notification (push-to-main only)
// ---------------------------------------------------------------------------

async function postSlackNotification(
  advisories: ParsedAdvisory[],
  blockingAdvisories: ParsedAdvisory[],
  treeText: string,
  issueUrl: string | null,
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('SLACK_WEBHOOK_URL not set — skipping Slack notification.');
    return;
  }
  if (process.env.GITHUB_EVENT_NAME !== 'push') {
    return;
  }

  const repo = process.env.GITHUB_REPOSITORY ?? 'MetaMask/metamask-extension';
  const runId = process.env.GITHUB_RUN_ID ?? '';
  const branch = process.env.BRANCH ?? 'main';
  const runUrl = `https://github.com/${repo}/actions/runs/${runId}`;
  const count = advisories.length;
  const noun = count === 1 ? 'advisory' : 'advisories';
  const blockingCount = blockingAdvisories.length;

  let policyText: string;
  if (blockingCount > 0) {
    const blockNoun = blockingCount === 1 ? 'advisory' : 'advisories';
    policyText =
      `${blockingCount} of ${count} ${count === 1 ? 'is' : 'are'} release-blocking (production, moderate+). ` +
      `PRs will continue to merge, but releases will be blocked until we resolve ${blockingCount === 1 ? 'this' : 'these'} ${blockNoun}.`;
  } else {
    policyText =
      `None are release-blocking (all dev-only or low severity). ` +
      `PRs and releases are not affected, but these should still be tracked.`;
  }

  const webhook = new IncomingWebhook(webhookUrl);
  await webhook.send({
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `:warning: *Yarn Audit: ${count} new ${noun}*` +
            ` just hit branch \`${branch}\`` +
            ` on \`${repo}\`\n\n` +
            policyText,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\`\`\`\n${treeText}\n\`\`\``,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: advisories
            .map((a) => {
              const isBlocking = blockingAdvisories.includes(a);
              const tag = isBlocking ? ':red_circle: *RELEASE-BLOCKING*' : ':large_blue_circle: informational';
              const scope = a.affectsProduction ? 'production' : 'dev-only';
              return `• ${a.url}\n   ◦ ${a.moduleName} — ${a.title}\n   ◦ ${tag} · ${scope} · ${a.effectiveSeverity}`;
            })
            .join('\n'),
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `<${runUrl}|View CI Run>${issueUrl ? ` · <${issueUrl}|Tracking Issue>` : ''}`,
          },
        ],
      },
    ],
  });
  console.log('Slack notification sent.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const current = readAdvisories(AUDIT_CURRENT_FILE);
  if (!current) {
    console.error(
      `Could not read current advisories from: ${AUDIT_CURRENT_FILE}`,
    );
    process.exitCode = 1;
    return;
  }

  const baseline = readAdvisories(AUDIT_BASELINE_FILE);
  if (!baseline || baseline.length === 0) {
    // Should not happen — the workflow only runs this step when the baseline
    // was successfully downloaded. Log a warning and pass through.
    console.log(
      '::warning::Baseline file is empty or missing; nothing to diff.',
    );
    writeStepSummary(`\n> **Audit diff:** Baseline empty — skipping diff.\n`);
    return;
  }

  // ------------------------------------------------------------------
  // Diff: advisories present in current but not in baseline (by GHSA ID)
  // ------------------------------------------------------------------
  const isPush = process.env.GITHUB_EVENT_NAME === 'push';
  const baselineIds = new Set(
    baseline.map((a) => a.id).filter((id): id is number => id !== null),
  );

  // All advisories whose ID is new (not in the baseline).
  const allNewAdvisories = current.filter(
    (a) => a.id !== null && !baselineIds.has(a.id as number),
  );

  // Subset that would block a release: production + moderate+.
  const blockingAdvisories = allNewAdvisories.filter(
    (a) =>
      a.affectsProduction && BLOCKING_SEVERITIES.has(a.effectiveSeverity),
  );

  // On push-to-main we report ALL new advisories (Slack, summary, issue).
  // On PRs we only fail for the blocking subset.
  const newAdvisories = isPush ? allNewAdvisories : blockingAdvisories;

  if (newAdvisories.length === 0) {
    console.log(
      `No new advisories. Current: ${current.length}, baseline: ${baseline.length}.`,
    );
    writeStepSummary(`\n### yarn audit: **passed** — no new advisories\n`);
    return;
  }

  // New advisories found.
  console.log(
    `Found ${newAdvisories.length} new advisory/advisories not in baseline` +
      (isPush && blockingAdvisories.length !== newAdvisories.length
        ? ` (${blockingAdvisories.length} release-blocking).`
        : '.'),
  );
  for (const a of newAdvisories) {
    const level = blockingAdvisories.includes(a) ? 'error' : 'warning';
    console.log(
      `::${level}::New advisory [${sevLabel(a)}]: ${a.moduleName} — ${a.title} (${a.url})`,
    );
  }

  // Prefer the real native tree output (written by triage step) so that
  // Dependents, Tree Versions, etc. match `yarn npm audit` exactly.
  // Strip ANSI color codes — the output may contain them depending on the
  // CI runner's terminal capabilities.
  let treeText: string;
  if (existsSync(AUDIT_NATIVE_FILE)) {
    const native = readFileSync(AUDIT_NATIVE_FILE, 'utf8');
    const newIds = new Set(
      newAdvisories.map((a) => a.id).filter((id): id is number => id !== null),
    );
    const blocks = extractNativeBlocks(native, newIds).map(stripAnsi);
    treeText =
      blocks.length > 0
        ? blocks.join('\n')
        : newAdvisories.map(formatAdvisoryTree).join('\n\n');
  } else {
    treeText = newAdvisories.map(formatAdvisoryTree).join('\n\n');
  }

  const diffSummaryLines = [
    '',
    `### yarn audit: ${isPush ? '**new advisories on main**' : '**FAILED**'} — ${newAdvisories.length} new advisor${newAdvisories.length === 1 ? 'y' : 'ies'}`,
    '',
    isPush
      ? `${newAdvisories.length} new advisor${newAdvisories.length === 1 ? 'y' : 'ies'} detected on push to main (${blockingAdvisories.length} release-blocking).`
      : 'Your dependency changes introduced new vulnerabilities. If a newer version of the package is available, upgrade to it.',
    '',
    '```',
    treeText,
    '```',
    '',
    'Run `yarn audit` locally to reproduce.',
    '',
  ];
  writeStepSummary(diffSummaryLines.join('\n'));

  // On push-to-main, create a GitHub tracking issue (before Slack so we can link it).
  const issueUrl = maybeCreateIssue(newAdvisories, blockingAdvisories, treeText);

  // On push-to-main, send a Slack notification so the team knows immediately.
  await postSlackNotification(newAdvisories, blockingAdvisories, treeText, issueUrl);

  // On PRs, fail the step only when there are release-blocking advisories.
  // On push-to-main, the step always succeeds (baseline must be uploaded).
  if (!isPush && blockingAdvisories.length > 0) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  // Append the full advisory details written by yarn-audit-and-triage.mts,
  // so they appear after the diff verdict in the step summary.
  try {
    const details = readFileSync(AUDIT_DETAILS_FILE, 'utf8');
    writeStepSummary(`\n${details}`);
  } catch {
    // File may not exist (e.g. triage step failed before writing it).
  }
}
