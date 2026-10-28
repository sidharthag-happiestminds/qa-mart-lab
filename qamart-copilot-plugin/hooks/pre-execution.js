#!/usr/bin/env node
// Guardrail hook for the QA Mart plugin. Wired to userPromptSubmitted and preToolUse in
// com.github.copilot/hooks/hooks.json. Reads one event on stdin, prints one JSON decision on stdout.
// '{}' means allow. Both harness output shapes are printed so the same script works in Copilot and Local.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const h = require('./lib/event.js');

const DANGEROUS_COMMANDS = [
  { id: 'rm-recursive', re: /\brm\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*\s+|--recursive\s+)/, why: 'Recursive delete' },
  { id: 'remove-item-recurse', re: /\b(?:Remove-Item|ri|rmdir|rd|del|erase)\b[^\n|;]*\s(?:-Recurse|\/s)\b/i, why: 'Recursive delete' },
  { id: 'git-force-push', re: /\bgit\s+push\b[^\n|;]*(?:\s--force(?:-with-lease)?\b|\s-f\b|\s\+\S)/, why: 'Force push rewrites shared history' },
  { id: 'git-reset-hard', re: /\bgit\s+reset\s+[^\n|;]*--hard\b/, why: 'Discards local work' },
  { id: 'git-clean', re: /\bgit\s+clean\s+-[a-zA-Z]*f/, why: 'Deletes untracked files' },
  { id: 'git-branch-delete', re: /\bgit\s+branch\s+[^\n|;]*-D\b/, why: 'Force-deletes a branch' },
  { id: 'git-no-verify', re: /\bgit\s+(?:commit|push)\b[^\n|;]*--no-verify\b/, why: 'Bypasses repository checks' },
  { id: 'pipe-to-shell', re: /\b(?:curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n]*\|\s*(?:sh|bash|zsh|pwsh|powershell|iex|Invoke-Expression)\b/i, why: 'Runs remote code' },
  { id: 'publish', re: /\b(?:npm|pnpm|yarn)\s+publish\b/, why: 'Publishes a package' },
  { id: 'disk-format', re: /\b(?:mkfs(?:\.\w+)?|format\s+[a-zA-Z]:|diskpart|dd\s+if=)/i, why: 'Destroys a disk' },
  { id: 'system-power', re: /\b(?:shutdown|reboot|Stop-Computer|Restart-Computer)\b/i, why: 'Stops the machine' },
  { id: 'world-writable', re: /\bchmod\s+(?:-R\s+)?0?777\b/, why: 'Makes files world-writable' },
  { id: 'kill-all-node', re: /\b(?:taskkill\s+[^\n]*\/im\s+node|killall\s+node|pkill\s+node|Stop-Process\s+[^\n]*-Name\s+node)\b/i, why: 'Kills every Node process, including VS Code helpers' },
];

const SECRET_COMMANDS = [
  { id: 'print-env', re: /^\s*(?:env|printenv|set|Get-ChildItem\s+env:|gci\s+env:|dir\s+env:)\s*$/im, why: 'Prints every environment variable' },
  { id: 'echo-secret-var', re: /(?:\$\{?|\$env:|%)\w*(?:TOKEN|SECRET|PASSWORD|PASS|API_?KEY|_KEY|_PAT)\b/i, why: 'Reads a secret environment variable' },
  { id: 'read-secret-file', re: /\b(?:cat|type|more|less|head|tail|gc|Get-Content|Select-String|grep)\b[^\n|;]*(?:\.env\b(?!\.example)|id_rsa|\.pem\b|playwright[\\/]\.auth|storage-?state)/i, why: 'Reads a secret file' },
];

// Shell writes that land in app/: redirects, Set-Content/Out-File, sed -i, cp/mv targets.
const SHELL_WRITE_TO_APP = /(?:>{1,2}\s*|\b(?:Set-Content|Add-Content|Out-File|tee|sed\s+-i|cp|copy|mv|move|Move-Item|Copy-Item)\b[^\n|;]*\s)["']?(?:\.[\\/])?app[\\/]/i;

const PROTECTED_DIRS = ['app', '.git', 'node_modules'];

function respond(kind, decision, rule, reason, extra = {}) {
  if (decision === 'allow') return process.stdout.write('{}');
  if (kind === 'prompt') {
    return process.stdout.write(JSON.stringify({
      decision: 'block', reason,
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: reason },
      ...extra,
    }));
  }
  process.stdout.write(JSON.stringify({
    permissionDecision: decision, permissionDecisionReason: reason,
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason },
  }));
}

function stagedOnly(root, command) {
  if (!/\bgit\s+commit\b/.test(command)) return null;
  const all = /\s(?:-[a-zA-Z]*a[a-zA-Z]*|--all)\b/.test(command);
  const diff = spawnSync('git', ['diff', all ? 'HEAD' : '--cached', '-U0', '--', '*.ts', '*.js'], { cwd: root, encoding: 'utf8', timeout: 8000 });
  if (diff.status !== 0 || !diff.stdout) return null;
  let file = '';
  for (const line of diff.stdout.split(/\r?\n/)) {
    if (line.startsWith('+++ b/')) file = line.slice(6);
    else if (line.startsWith('+') && /\b(?:test|describe|it)\.only\s*\(/.test(line)) return file;
  }
  return null;
}

function checkShell(root, command) {
  for (const r of DANGEROUS_COMMANDS) if (r.re.test(command)) return { decision: 'deny', rule: r.id, reason: `${r.why}. Blocked by the QA Mart guardrail; run it yourself if you really mean it.` };
  for (const r of SECRET_COMMANDS) if (r.re.test(command)) return { decision: 'deny', rule: r.id, reason: `${r.why}. Secrets stay out of the chat. Reference the variable by name instead.` };
  if (SHELL_WRITE_TO_APP.test(command)) return { decision: 'deny', rule: 'shell-write-app', reason: 'app/ is read-only for agents. Keep the failing test and report the application bug with docs/templates/bug-report.md.' };
  const secret = h.findSecret(command);
  if (secret) return { decision: 'deny', rule: `secret-in-command:${secret}`, reason: `The command contains what looks like a ${secret}. Use an environment variable instead.` };
  const onlyFile = stagedOnly(root, command);
  if (onlyFile) return { decision: 'deny', rule: 'commit-test-only', reason: `${onlyFile} adds test.only/describe.only. Remove it before committing; CI would run a single test and report green.` };
  if (/\bgit\s+push\b/.test(command)) return { decision: 'ask', rule: 'git-push', reason: 'Pushing shares code with the team. Confirm the branch and remote first.' };
  return null;
}

function checkPaths(root, tool, args) {
  const isEdit = h.EDIT_TOOL.test(tool) && !/^read|view/i.test(tool);
  const isRead = !isEdit && h.READ_TOOL.test(tool);
  const files = [...new Set(h.filePaths(args))];

  for (const f of files) {
    const abs = path.resolve(root, f);
    if ((isEdit || isRead) && h.SECRET_FILE.test(abs) && !h.SECRET_FILE_ALLOWED.test(abs)) {
      return { decision: 'deny', rule: 'secret-file', reason: `${path.basename(abs)} can hold secrets and is off-limits to the agent. Ask a human for the value you need.`, files: [h.rel(root, f)] };
    }
    if (!isEdit) continue;
    if (!h.isInside(root, abs)) {
      return { decision: 'deny', rule: 'outside-repo', reason: `Edits are limited to the current repository (${root}). ${f} is outside it.`, files: [f] };
    }
    const top = h.rel(root, abs).split('/')[0];
    if (PROTECTED_DIRS.includes(top)) {
      const reason = top === 'app'
        ? 'app/ is read-only for agents. Keep the failing test and report the application bug with docs/templates/bug-report.md.'
        : `${top}/ is managed by tools, not by hand. Do not edit it.`;
      return { decision: 'deny', rule: `protected-${top.replace('.', '')}`, reason, files: [h.rel(root, abs)] };
    }
    const guardDirs = [path.join(h.PLUGIN_ROOT, 'hooks'), path.join(h.PLUGIN_ROOT, 'com.github.copilot', 'hooks')];
    if (process.env.QAMART_HOOK_ALLOW_SELF_EDIT !== '1' && guardDirs.some((d) => h.isInside(d, abs))) {
      return { decision: 'deny', rule: 'guardrail-self-edit', reason: 'The agent cannot change its own guardrails. A human edits hook files.', files: [h.rel(root, abs)] };
    }
  }

  if (isEdit) {
    const text = h.newContent(args).join('\n');
    const secret = h.findSecret(text);
    if (secret) return { decision: 'deny', rule: `secret-in-content:${secret}`, reason: `The new content contains what looks like a ${secret}. Read it from an environment variable instead.`, files: files.map((f) => h.rel(root, f)) };
    const specs = files.filter((f) => /\.(spec|test)\.[cm]?[jt]s$/.test(f));
    if (specs.length && /\b(?:test|describe|it)\.only\s*\(/.test(text)) {
      return { decision: 'deny', rule: 'test-only', reason: 'Do not add test.only/describe.only: it silently skips the rest of the suite. Run one test with `npx playwright test <file> -g "<title>"` instead.', files: specs.map((f) => h.rel(root, f)) };
    }
  }
  return { decision: 'allow', rule: null, files: files.map((f) => h.rel(root, f)) };
}

function main() {
  const event = h.readEvent();
  const root = h.workspaceRoot(event);
  if (event._unparseable) {
    process.stderr.write('[qamart-hooks] pre-execution: stdin was not JSON, allowing.\n');
    return respond('tool', 'allow');
  }

  if (typeof event.prompt === 'string' && !h.toolName(event)) {
    const secret = h.findSecret(event.prompt);
    h.logAction(root, { hook: 'pre-execution', kind: 'prompt', decision: secret ? 'block' : 'allow', rule: secret ? `secret-in-prompt:${secret}` : null, chars: event.prompt.length });
    if (secret) return respond('prompt', 'deny', secret, `Your message contains what looks like a ${secret}. Remove it, rotate the credential, and refer to it by environment variable name.`);
    return respond('prompt', 'allow');
  }

  const tool = h.toolName(event);
  const args = h.toolArgs(event);
  let result = null;
  const command = h.SHELL_TOOL.test(tool) ? h.commandText(args) : '';
  if (command) result = checkShell(root, command);
  if (!result) result = checkPaths(root, tool, args);

  h.logAction(root, {
    hook: 'pre-execution', kind: 'tool', tool, decision: result.decision, rule: result.rule,
    files: result.files, command: command ? command.trim().split(/\s+/).slice(0, 2).join(' ') : undefined,
  });
  respond('tool', result.decision, result.rule, result.reason);
}

main();
