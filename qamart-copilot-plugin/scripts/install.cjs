#!/usr/bin/env node
// One-command local install of the plugin into a VS Code workspace.
//   node qamart-copilot-plugin/scripts/install.cjs              validate, then merge settings into <repo>/.vscode/settings.json
//   node qamart-copilot-plugin/scripts/install.cjs --print      only print the settings to add (for user settings)
//   node qamart-copilot-plugin/scripts/install.cjs --uninstall  remove the settings this script added
//   --workspace <path>  target another workspace (default: the repository that contains this plugin)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PLUGIN = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const wsArg = args.indexOf('--workspace');
const WORKSPACE = path.resolve(wsArg >= 0 ? args[wsArg + 1] : path.join(PLUGIN, '..'));
const SETTINGS = path.join(WORKSPACE, '.vscode', 'settings.json');

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) { console.error(`Node 20 or newer is required (found ${process.versions.node}).`); process.exit(1); }

const relOrAbs = (p) => {
  const r = path.relative(WORKSPACE, p);
  return (r && !r.startsWith('..') && !path.isAbsolute(r) ? r : p).split(path.sep).join('/');
};
const pluginKey = PLUGIN.split(path.sep).join('/');
const wanted = {
  'chat.plugins.enabled': true,
  'chat.pluginLocations': { [pluginKey]: true },
  'chat.instructionsFilesLocations': { [relOrAbs(path.join(PLUGIN, 'instructions'))]: true },
  'chat.promptFilesLocations': { [relOrAbs(path.join(PLUGIN, 'prompts'))]: true },
  'chat.useAgentSkills': true,
};

if (args.includes('--print')) {
  console.log('Add to your VS Code settings (Preferences: Open User Settings (JSON)):\n');
  console.log(JSON.stringify({ ...wanted, 'chat.instructionsFilesLocations': { [pluginKey + '/instructions']: true }, 'chat.promptFilesLocations': { [pluginKey + '/prompts']: true } }, null, 2));
  process.exit(0);
}

let current = {};
if (fs.existsSync(SETTINGS)) {
  try {
    current = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  } catch {
    console.error(`${SETTINGS} has comments or is not plain JSON, so it was left untouched.`);
    console.error('Run with --print and paste the settings in by hand.');
    process.exit(1);
  }
}

if (args.includes('--uninstall')) {
  for (const [key, value] of Object.entries(wanted)) {
    if (value && typeof value === 'object') {
      for (const k of Object.keys(value)) if (current[key]) delete current[key][k];
      if (current[key] && !Object.keys(current[key]).length) delete current[key];
    }
  }
  fs.writeFileSync(SETTINGS, JSON.stringify(current, null, 2) + '\n');
  console.log(`Removed qamart-copilot-plugin-sidharthag locations from ${SETTINGS}. Reload VS Code.`);
  process.exit(0);
}

const validate = spawnSync(process.execPath, [path.join(__dirname, 'validate-plugin.cjs')], { encoding: 'utf8' });
if (validate.status !== 0) {
  console.error(validate.stdout + validate.stderr);
  console.error('Plugin validation failed; nothing was installed.');
  process.exit(1);
}
console.log('Plugin validated.');

for (const [key, value] of Object.entries(wanted)) {
  current[key] = value && typeof value === 'object' ? { ...(current[key] || {}), ...value } : value;
}
fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
fs.writeFileSync(SETTINGS, JSON.stringify(current, null, 2) + '\n');

console.log(`Updated ${SETTINGS}:`);
for (const key of Object.keys(wanted)) console.log(`  ${key}`);
console.log(`
Next:
  1. Reload VS Code (Developer: Reload Window).
  2. Extensions view, search @agentPlugins: qamart-copilot-plugin-sidharthag is listed as installed.
     If it is not, your VS Code only reads chat.pluginLocations from user settings:
     run "node qamart-copilot-plugin/scripts/install.cjs --print" and paste the result into user settings.
  3. Set QA_PASS (lab password, see README) in the environment that starts VS Code for the qamart-api MCP tools.
  4. Run "MCP: List Servers": qamart-api and github are listed.
  5. In Chat, type /generate-playwright-tests US-104 or pick the "QA Test Generator" agent.`);
