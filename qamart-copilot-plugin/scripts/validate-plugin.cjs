#!/usr/bin/env node
// Static checks for the plugin: manifest against the Agent Plugins 1.0 schema rules, every registered
// component present and well-formed, scripts parse, MCP and hook configs valid, no secrets.
// Usage: node qamart-copilot-plugin/scripts/validate-plugin.cjs
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { SECRET_PATTERNS } = require('../hooks/lib/event.js');

const PLUGIN = path.resolve(__dirname, '..');
const REPO = path.resolve(PLUGIN, '..');
let failed = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : `\n     ${detail}`}`);
  if (!ok) failed++;
};
const readJson = (rel) => {
  try { return JSON.parse(fs.readFileSync(path.join(PLUGIN, rel), 'utf8')); } catch (err) { check(`${rel} is valid JSON`, false, err.message); return null; }
};
const frontmatter = (rel) => {
  const text = fs.readFileSync(path.join(PLUGIN, rel), 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '');
  }
  return { data: out, body: text.slice(m[0].length).trim() };
};

// ---- manifest ----
const manifest = readJson('plugin.json');
if (!manifest) process.exit(1);
const ALLOWED = ['$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions'];
check('plugin.json $schema is Agent Plugins 1.0.0', manifest.$schema === 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
check('plugin.json name is lowercase kebab-case', /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(manifest.name || '') && manifest.name.length <= 64, manifest.name);
check('plugin.json has only schema properties', Object.keys(manifest).every((k) => ALLOWED.includes(k)), Object.keys(manifest).filter((k) => !ALLOWED.includes(k)).join(', '));
check('plugin.json version is semver', /^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(manifest.version || ''), manifest.version);
check('plugin.json display name includes SidharthaG', manifest.name === 'qamart-copilot-plugin-sidharthag', manifest.name);

const reg = (manifest.extensions || {})['com.github.copilot'] || {};
const copilotRoot = path.join(PLUGIN, 'com.github.copilot');
const componentDirs = (component, fallback) => {
  const config = reg[component];
  const configured = Array.isArray(config) ? config : Array.isArray(config && config.paths) ? config.paths : [];
  const dirs = [...(!config || !config.exclusive ? [fallback] : []), ...configured];
  return [...new Set(dirs.map((d) => path.resolve(copilotRoot, d)))];
};
const filesIn = (dirs, match) => dirs.flatMap((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory()
  ? fs.readdirSync(dir).filter((name) => match.test(name)).map((name) => path.join(dir, name)) : []);
const relPlugin = (file) => path.relative(PLUGIN, file).split(path.sep).join('/');

for (const component of ['commands', 'agents', 'rules']) {
  const cfg = reg[component];
  check(`plugin.json configures Copilot ${component} discovery`, !!cfg && cfg.exclusive === true && Array.isArray(cfg.paths) && cfg.paths.length > 0, JSON.stringify(cfg));
  for (const p of cfg && cfg.paths || []) check(`Copilot ${component} path exists: ${p}`, fs.existsSync(path.join(copilotRoot, p)));
}

const commandFiles = filesIn(componentDirs('commands', 'commands'), /\.md$/i);
const agentFiles = filesIn(componentDirs('agents', 'agents'), /\.md$/i);
const ruleFiles = filesIn(componentDirs('rules', 'rules'), /\.(?:mdc|instructions\.md)$/i);
const skillDirs = fs.readdirSync(path.join(PLUGIN, 'skills')).map((n) => path.join(PLUGIN, 'skills', n)).filter((p) => fs.statSync(p).isDirectory());
const instructionSources = fs.readdirSync(path.join(PLUGIN, 'instructions')).filter((n) => n.endsWith('.instructions.md'));
const promptSources = fs.readdirSync(path.join(PLUGIN, 'prompts')).filter((n) => n.endsWith('.prompt.md'));
check('at least 2 instructions at requested paths and VS Code rule paths', instructionSources.length >= 2 && ruleFiles.length >= 2, `${instructionSources.length} source, ${ruleFiles.length} registered`);
check('at least 2 prompt files at requested paths and VS Code command paths', promptSources.length >= 2 && commandFiles.length >= 2, `${promptSources.length} source, ${commandFiles.length} registered`);
check('at least 2 skills', skillDirs.length >= 2, `${skillDirs.length}`);
check('at least 2 custom agents', agentFiles.length >= 2, `${agentFiles.length}`);

for (const file of ruleFiles) {
  const fm = frontmatter(relPlugin(file));
  check(`${relPlugin(file)}: rule has name and description`, !!fm && !!fm.data.name && !!fm.data.description);
}
const agentNames = [];
for (const file of agentFiles) {
  const fm = frontmatter(relPlugin(file));
  check(`${relPlugin(file)}: agent has name, description, tools`, !!fm && !!fm.data.name && !!fm.data.description && /^tools:/m.test(fs.readFileSync(file, 'utf8')));
  if (fm) agentNames.push(fm.data.name);
}
for (const file of commandFiles) {
  const fm = frontmatter(relPlugin(file));
  check(`${relPlugin(file)}: slash command has description and known agent`, !!fm && !!fm.data.description && agentNames.includes(fm.data.agent), fm && fm.data.agent);
}
for (const dir of skillDirs) {
  const skillName = path.basename(dir);
  const file = `skills/${skillName}/SKILL.md`;
  const ok = fs.existsSync(path.join(PLUGIN, file));
  const fm = ok && frontmatter(file);
  check(`${file}: name matches folder and has a description`, !!fm && fm.data.name === skillName && (fm.data.description || '').length >= 40, fm && fm.data.name);
  check(`skills/${skillName}/examples.md exists`, fs.existsSync(path.join(PLUGIN, 'skills', skillName, 'examples.md')));
  if (fm) {
    for (const link of fm.body.matchAll(/\]\(\.\/([^)]+)\)/g)) check(`${file}: link ./${link[1]} resolves`, fs.existsSync(path.join(PLUGIN, 'skills', skillName, link[1])));
  }
}
// ---- hooks ----
const hooks = readJson('com.github.copilot/hooks/hooks.json');
if (hooks) {
  check('hooks.json version is 1', hooks.version === 1);
  const events = Object.keys(hooks.hooks || {});
  check('hooks.json has preToolUse and postToolUse', events.includes('preToolUse') && events.includes('postToolUse'), events.join(', '));
  for (const [event, entries] of Object.entries(hooks.hooks || {})) {
    for (const e of entries) {
      const m = String(e.command || '').match(/\$\{PLUGIN_ROOT\}\/([^"\s]+)/);
      check(`hook ${event} runs a script inside the plugin`, e.type === 'command' && !!m && fs.existsSync(path.join(PLUGIN, m[1])), e.command);
      check(`hook ${event} has a timeout`, Number(e.timeoutSec) > 0);
    }
  }
}
// ---- MCP ----
const mcp = readJson('mcp.json');
if (mcp) {
  const servers = Object.entries(mcp.mcpServers || {});
  check('mcp.json declares at least 2 servers', servers.length >= 2, servers.map(([n]) => n).join(', '));
  for (const [name, s] of servers) {
    if (s.command) {
      const local = (s.args || []).map((a) => String(a).match(/^\$\{PLUGIN_ROOT\}\/(.+)$/)).filter(Boolean);
      check(`mcp server ${name}: stdio script uses \${PLUGIN_ROOT} and exists`, local.length > 0 && local.every((m) => fs.existsSync(path.join(PLUGIN, m[1]))));
    } else {
      check(`mcp server ${name}: remote server uses https`, /^https:\/\//.test(s.url || ''), s.url);
    }
    check(`mcp server ${name}: no credentials in config`, !/authorization|token|password|secret/i.test(JSON.stringify(s.headers || {})) && !Object.entries(s.env || {}).some(([k, v]) => /TOKEN|PASS|SECRET|KEY/i.test(k) && v && !/^\$\{/.test(v)));
  }
}
for (const rel of ['mcp/github-mcp.json', 'mcp/qamart-api-mcp.json']) {
  const cfg = readJson(rel);
  check(`${rel} declares servers`, !!cfg && Object.keys(cfg.servers || cfg.mcpServers || {}).length > 0);
}
// ---- scripts parse ----
const scripts = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (/\.(c?js)$/.test(name)) scripts.push(full);
  }
})(PLUGIN);
for (const file of scripts) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  check(`node --check ${path.relative(PLUGIN, file).split(path.sep).join('/')}`, r.status === 0, r.stderr.trim());
}
// ---- secrets ----
const leaks = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { walk(full); continue; }
    const text = fs.readFileSync(full, 'utf8');
    for (const s of SECRET_PATTERNS) if (s.re.test(text)) leaks.push(`${path.relative(PLUGIN, full)} (${s.id})`);
  }
})(PLUGIN);
check('no secrets in plugin files', leaks.length === 0, leaks.join(', '));
// ---- marketplace ----
const market = path.join(REPO, '.claude-plugin', 'marketplace.json');
if (fs.existsSync(market)) {
  const entry = (JSON.parse(fs.readFileSync(market, 'utf8')).plugins || []).find((p) => p.name === manifest.name);
  check('marketplace.json lists the plugin with a valid source', !!entry && fs.existsSync(path.resolve(REPO, entry.source)));
}

console.log(failed ? `\n${failed} check(s) failed` : '\nPlugin is valid');
process.exit(failed ? 1 : 0);
