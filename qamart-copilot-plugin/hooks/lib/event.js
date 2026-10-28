// Shared helpers for the QA Mart plugin hooks. Handles both harness shapes:
// Copilot (toolName/toolArgs, camelCase) and Local/VS Code (tool_name/tool_input, snake_case).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');

const EDIT_TOOL = /edit|create|write|replace|patch|insert|delete|rename|move/i;
const READ_TOOL = /read|view|open|cat|get_file/i;
const SHELL_TOOL = /bash|shell|terminal|powershell|pwsh|exec|run_command|run_task/i;
const PATH_KEY = /^(path|paths|filepath|file_path|filePaths|file|uri|target|destination|new_path|old_path)$/i;
const CONTENT_KEY = /^(content|newString|new_string|new_str|file_text|text|newContent|new_content|code|input|patch)$/i;
const PATCH_HEADER = /^\*\*\* (?:Add|Update|Delete|Move to) File:[ \t]*([^\r\n]+)/gm;

// Real token formats only; fixtures build fake tokens at runtime so this repo never holds one.
const SECRET_PATTERNS = [
  { id: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/ },
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'openai-key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { id: 'assigned-secret', re: /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*['"][^'"\s]{16,}['"]/i },
];

const SECRET_FILE = /(^|[\\/])(\.env(\.[\w-]+)?|id_rsa|id_ed25519|[^\\/]+\.pem|[^\\/]+\.key|[^\\/]+\.pfx|\.npmrc|storage-?state[^\\/]*\.json)$|(^|[\\/])playwright[\\/]\.auth([\\/]|$)/i;
const SECRET_FILE_ALLOWED = /\.env\.(example|sample|template)$/i;

function readEvent() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { return {}; }
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { return { _unparseable: true }; }
}

const toolName = (event) => String(event.toolName ?? event.tool_name ?? '');

function toolArgs(event) {
  let args = event.toolArgs ?? event.tool_input ?? {};
  if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = { input: args }; } }
  return args && typeof args === 'object' ? args : {};
}

function filePaths(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => filePaths(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (PATH_KEY.test(k) && typeof v === 'string') out.push(v.replace(/^file:\/\/\/?/, process.platform === 'win32' ? '' : '/'));
      else if (PATH_KEY.test(k) && Array.isArray(v)) v.filter((x) => typeof x === 'string').forEach((x) => out.push(x));
      else filePaths(v, out);
    }
  } else if (typeof value === 'string') {
    for (const m of value.matchAll(PATCH_HEADER)) out.push(m[1].trim());
  }
  return out;
}

// New text the tool would write. Old text (oldString) is ignored so removing a bad line is never blocked.
function newContent(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => newContent(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (CONTENT_KEY.test(k) && typeof v === 'string') out.push(k === 'patch' || k === 'input' ? addedPatchLines(v) : v);
      else if (typeof v === 'object') newContent(v, out);
    }
  }
  return out;
}

function addedPatchLines(text) {
  if (!/^\*\*\* Begin Patch|^@@|^\+\+\+ /m.test(text)) return text;
  return text.split(/\r?\n/).filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
}

function commandText(args) {
  const c = args.command ?? args.cmd ?? args.script ?? args.commandLine;
  return typeof c === 'string' ? c : '';
}

const workspaceRoot = (event) => path.resolve(event.cwd || process.cwd());
const norm = (p) => (process.platform === 'linux' ? p : p.toLowerCase());

function isInside(parent, child) {
  const r = path.relative(norm(parent), norm(child));
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}

const rel = (root, p) => path.relative(root, path.resolve(root, p)).split(path.sep).join('/');

function findSecret(text) {
  for (const s of SECRET_PATTERNS) if (s.re.test(text)) return s.id;
  return null;
}

function logDir(root) {
  return process.env.QAMART_HOOK_LOG_DIR || path.join(root, 'reports', 'copilot-hooks');
}

// One JSON line per action. Never pass raw arguments, file contents or command text here.
function logAction(root, entry) {
  try {
    const dir = logDir(root);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'actions.jsonl'), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  } catch (err) {
    process.stderr.write(`[qamart-hooks] could not write log: ${err.message}\n`);
  }
}

module.exports = {
  PLUGIN_ROOT, EDIT_TOOL, READ_TOOL, SHELL_TOOL, SECRET_PATTERNS, SECRET_FILE, SECRET_FILE_ALLOWED,
  readEvent, toolName, toolArgs, filePaths, newContent, commandText, workspaceRoot, isInside, rel, norm, findSecret, logDir, logAction,
};
