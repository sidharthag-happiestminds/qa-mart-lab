#!/usr/bin/env node
// Feedback and audit hook for the QA Mart plugin.
//   postToolUse (default): scan edited specs/Page Objects, run the repo lint and a scoped typecheck,
//                          and hand findings back to the agent as additionalContext. Logs every tool call.
//   --summary-hook        : sessionEnd. Writes reports/copilot-hooks/execution-summary.md, prints {}.
//   --summary             : CLI. Prints the summary of the current session to stdout.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const h = require('./lib/event.js');

const RULES = [
  { id: 'no-test-only', severity: 'error', re: /\b(?:test|describe|it)\.only\s*\(/, msg: 'Remove .only; it skips every other test in CI.' },
  { id: 'no-page-pause', severity: 'error', re: /\bpage\.pause\s*\(/, msg: 'Remove page.pause(); it hangs headless runs.' },
  { id: 'weak-assertion', severity: 'warn', re: /\.(?:toBeTruthy|toBeDefined|toBeFalsy)\(\)|toBeGreaterThan\(\s*0\s*\)/, msg: 'Assert the exact value, status or text the story expects.' },
  { id: 'no-console-log', severity: 'warn', re: /\bconsole\.log\s*\(/, msg: 'Use test.step or test.info().annotations instead of console.log.' },
  { id: 'no-skip-without-reason', severity: 'warn', re: /\btest\.(?:skip|fixme)\(\s*\)/, msg: 'Give skip/fixme a condition and a reason with a bug id.' },
  // Fallbacks used only when the repo has no scripts/lint-specs.cjs.
  { id: 'no-hard-wait', severity: 'error', fallback: true, re: /waitForTimeout\(/, msg: 'Use a web-first assertion instead of waitForTimeout.' },
  { id: 'no-xpath', severity: 'error', fallback: true, re: /['"`]\s*(?:xpath=)?\/\/|xpath=/, msg: 'Use getByRole/getByLabel/getByTestId instead of XPath.' },
  { id: 'no-positional-selector', severity: 'error', fallback: true, re: /nth-child|\.nth\(/, msg: 'Do not select by position.' },
  { id: 'no-hardcoded-url', severity: 'error', fallback: true, re: /https?:\/\/localhost:\d+/, msg: 'Use baseURL with a relative path.' },
];

const isTarget = (rel) => /\.spec\.ts$/.test(rel) || /^pages\/.+\.ts$/.test(rel) || /^tests\/.+\.ts$/.test(rel);

function fileFindings(root, rel, hasRepoLint) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return [];
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    for (const r of RULES) {
      if (r.fallback && hasRepoLint) continue;
      if (r.re.test(line)) out.push({ file: rel, line: i + 1, rule: r.id, severity: r.severity, msg: r.msg });
    }
  });
  const text = lines.join('\n');
  if (/^pages\//.test(rel) && /\bexpect\s*\(/.test(text)) {
    const line = lines.findIndex((l) => /\bexpect\s*\(/.test(l)) + 1;
    out.push({ file: rel, line, rule: 'no-expect-in-page-object', severity: 'error', msg: 'Page Objects expose actions and locators; assertions belong in the spec.' });
  }
  if (/\.spec\.ts$/.test(rel)) {
    if (/\b(?:test|describe)\s*\(/.test(text) && !/US-\d{3}/.test(text)) {
      out.push({ file: rel, line: 1, rule: 'story-id', severity: 'warn', msg: 'Put the story id and AC (for example "US-104 AC2") in the describe or test title.' });
    }
    const usesFixture = /async\s*\(\s*\{[^}]*\b(?:api|signedInPage)\b[^}]*\}/.test(text);
    if (usesFixture && /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*['"]@playwright\/test['"]/.test(text)) {
      out.push({ file: rel, line: 1, rule: 'fixtures-import', severity: 'error', msg: 'Import test and expect from tests/fixtures.ts when you use the api or signedInPage fixtures.' });
    }
  }
  return out;
}

function run(root, args) {
  return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 60000, windowsHide: true });
}

function postToolUse(event) {
  const root = h.workspaceRoot(event);
  const tool = h.toolName(event);
  const isEdit = h.EDIT_TOOL.test(tool) && !/^read|view/i.test(tool);
  const files = isEdit
    ? [...new Set(h.filePaths(h.toolArgs(event)).map((p) => h.rel(root, p)))].filter((r) => !r.startsWith('..') && isTarget(r))
    : [];

  if (!files.length) {
    h.logAction(root, { hook: 'post-execution', kind: 'tool', tool, edited: isEdit });
    return process.stdout.write('{}');
  }

  const lintPath = path.join(root, 'scripts', 'lint-specs.cjs');
  const hasRepoLint = fs.existsSync(lintPath);
  const findings = files.flatMap((f) => fileFindings(root, f, hasRepoLint));
  const sections = [];

  const existing = files.filter((f) => fs.existsSync(path.join(root, f)));
  if (hasRepoLint && existing.length) {
    const lint = run(root, [lintPath, ...existing]);
    if (lint.status !== 0) {
      const lintLines = lint.stdout.split(/\r?\n/).filter((l) => /:\d+\s{2}\S/.test(l));
      lintLines.forEach((l) => {
        const m = l.match(/^(.+?):(\d+)\s+(\S+)\s+(.*)$/);
        if (m) findings.push({ file: m[1].split(path.sep).join('/'), line: Number(m[2]), rule: m[3], severity: 'error', msg: m[4] });
      });
    }
  }

  const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  if (process.env.QAMART_HOOK_TYPECHECK !== '0' && fs.existsSync(tsc) && fs.existsSync(path.join(root, 'tsconfig.json'))) {
    const types = run(root, [tsc, '--noEmit', '--pretty', 'false', '-p', root]);
    if (types.status !== 0) {
      const ours = types.stdout.split(/\r?\n/).filter((l) => existing.some((f) => l.replace(/\\/g, '/').startsWith(f)));
      if (ours.length) sections.push(`typecheck:\n${ours.slice(0, 20).join('\n')}`);
    }
  }

  const errors = findings.filter((f) => f.severity === 'error').length + (sections.length ? 1 : 0);
  h.logAction(root, {
    hook: 'post-execution', kind: 'tool', tool, edited: true, files,
    findings: findings.map(({ file, line, rule, severity }) => ({ file, line, rule, severity })), typecheckFailed: sections.length > 0,
  });

  if (!findings.length && !sections.length) return process.stdout.write('{}');

  const table = findings.map((f) => `- ${f.file}:${f.line} [${f.severity}] ${f.rule}: ${f.msg}`).join('\n');
  const additionalContext = [
    `QA Mart standards check on ${files.join(', ')}: ${findings.length} finding(s)${sections.length ? ' and typecheck errors' : ''}.`,
    table, ...sections,
    errors ? 'Fix the errors before continuing. Do not weaken assertions or edit app/ to make a check pass.' : 'Warnings only: fix them unless the story says otherwise.',
  ].filter(Boolean).join('\n\n').slice(0, 6000);
  process.stdout.write(JSON.stringify({ additionalContext, hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } }));
}

function readLog(root) {
  const file = path.join(h.logDir(root), 'actions.jsonl');
  if (!fs.existsSync(file)) return [];
  const all = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const lastMarker = all.map((e) => e.kind).lastIndexOf('summary');
  return all.slice(lastMarker + 1);
}

function buildSummary(entries) {
  const pre = entries.filter((e) => e.hook === 'pre-execution');
  const post = entries.filter((e) => e.hook === 'post-execution');
  const blocked = pre.filter((e) => e.decision === 'deny' || e.decision === 'block');
  const asked = pre.filter((e) => e.decision === 'ask');
  const tools = {};
  for (const e of pre.filter((x) => x.kind === 'tool')) tools[e.tool] = (tools[e.tool] || 0) + 1;
  const edited = [...new Set(post.flatMap((e) => e.files || []))];
  const findings = post.flatMap((e) => e.findings || []);
  const byRule = {};
  for (const f of findings) byRule[f.rule] = (byRule[f.rule] || 0) + 1;
  const range = entries.length ? `${entries[0].ts} to ${entries[entries.length - 1].ts}` : 'no activity';

  return [
    '# QA Mart plugin execution summary', '',
    `Window: ${range}`, '',
    '| Metric | Count |', '|---|---|',
    `| Prompts checked | ${pre.filter((e) => e.kind === 'prompt').length} |`,
    `| Tool calls checked | ${pre.filter((e) => e.kind === 'tool').length} |`,
    `| Blocked | ${blocked.length} |`,
    `| Needed confirmation | ${asked.length} |`,
    `| Test files edited | ${edited.length} |`,
    `| Standards findings | ${findings.length} |`,
    `| Typecheck failures | ${post.filter((e) => e.typecheckFailed).length} |`, '',
    '## Tool calls', ...(Object.keys(tools).length ? Object.entries(tools).map(([t, n]) => `- ${t}: ${n}`) : ['- none']), '',
    '## Blocked or confirmed actions', ...([...blocked, ...asked].length ? [...blocked, ...asked].map((e) => `- ${e.ts} ${e.decision} ${e.tool || 'prompt'} (${e.rule})${e.files && e.files.length ? ` ${e.files.join(', ')}` : ''}`) : ['- none']), '',
    '## Edited test files', ...(edited.length ? edited.map((f) => `- ${f}`) : ['- none']), '',
    '## Findings by rule', ...(Object.keys(byRule).length ? Object.entries(byRule).map(([r, n]) => `- ${r}: ${n}`) : ['- none']), '',
  ].join('\n');
}

function main() {
  if (process.argv.includes('--summary')) {
    const root = path.resolve(process.cwd());
    return process.stdout.write(buildSummary(readLog(root)));
  }
  const event = h.readEvent();
  if (event._unparseable) return process.stdout.write('{}');
  if (process.argv.includes('--summary-hook')) {
    const root = h.workspaceRoot(event);
    const summary = buildSummary(readLog(root));
    try {
      fs.mkdirSync(h.logDir(root), { recursive: true });
      fs.writeFileSync(path.join(h.logDir(root), 'execution-summary.md'), summary);
    } catch (err) { process.stderr.write(`[qamart-hooks] could not write summary: ${err.message}\n`); }
    h.logAction(root, { hook: 'post-execution', kind: 'summary', reason: event.reason || event.hook_event_name || 'sessionEnd' });
    return process.stdout.write('{}');
  }
  postToolUse(event);
}

main();
