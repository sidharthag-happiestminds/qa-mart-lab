# qamart-copilot-plugin-sidharthag

An installable GitHub Copilot agent plugin that makes any tester productive on **QA Mart** in minutes. It adds house rules, slash commands, playbooks, two agents, live tools and safety guardrails on top of the existing `qa-mart-lab` Playwright + TypeScript framework. It does not change the framework.

> AI drafts. Testers decide.

## 1. What is inside (all 6 component types, 2+ of each)

| Type | Component | File | What it does |
|---|---|---|---|
| Custom instructions | QA Mart QA guidelines | [instructions/qa-guidelines.instructions.md](instructions/qa-guidelines.instructions.md), loaded from `com.github.copilot/rules/` | Risk-based priorities, naming, defect logging, regression tiers |
| Custom instructions | Playwright agent rules | [instructions/playwright-agent-rules.instructions.md](instructions/playwright-agent-rules.instructions.md), loaded from `com.github.copilot/rules/` | Locator order, web-first assertions, test data, POM rules |
| Prompt file | `/generate-playwright-tests` | [prompts/generate-playwright-tests.prompt.md](prompts/generate-playwright-tests.prompt.md), loaded from `com.github.copilot/commands/` | Story or flow to test cases, Page Objects, data and specs, positive and negative |
| Prompt file | `/review-playwright-tests` | [prompts/review-playwright-tests.prompt.md](prompts/review-playwright-tests.prompt.md), loaded from `com.github.copilot/commands/` | Flaky patterns, selectors, assertions, refactoring, Keep/Fix/Kill |
| Skill | `playwright-test-generator` | [skills/playwright-test-generator/](skills/playwright-test-generator/SKILL.md) | Step-by-step method plus [worked examples](skills/playwright-test-generator/examples.md) |
| Skill | `qa-regression-analyzer` | [skills/qa-regression-analyzer/](skills/qa-regression-analyzer/SKILL.md) | Changed files to impacted flows, risk score, suites to run, coverage gaps; ships [impact-map.cjs](skills/qa-regression-analyzer/impact-map.cjs) |
| Custom agent | QA Test Generator | [com.github.copilot/agents/qa-test-generator.agent.md](com.github.copilot/agents/qa-test-generator.agent.md) | Reads stories, writes tests and Page Objects, runs them; hands off to QA Review |
| Custom agent | QA Review | [com.github.copilot/agents/qa-review.agent.md](com.github.copilot/agents/qa-review.agent.md) | Read-only reviewer (no `edit` tool); hands off fixes to the generator |
| MCP server | `qamart-api` | [mcp/qamart-api-server.cjs](mcp/qamart-api-server.cjs) | 13 tools over auth, user, product, coupon and order APIs (zero dependencies) |
| MCP server | `github` | [mcp.json](mcp.json) | GitHub's remote MCP server, read-only: repos, issues, pull requests, branches |
| Hook | `pre-execution.js` | [hooks/pre-execution.js](hooks/pre-execution.js) | Blocks dangerous commands, secret exposure, edits outside scope or to `app/`, and `test.only` |
| Hook | `post-execution.js` | [hooks/post-execution.js](hooks/post-execution.js) | Scans edited specs and Page Objects, runs lint and typecheck, logs actions, writes a session summary |

The Agent Plugins 1.0 manifest is [plugin.json](plugin.json). VS Code discovers portable skills and MCP servers from the standard `skills/` and `mcp.json` paths, and discovers agents, commands, rules and hooks under `com.github.copilot/`. The manifest's `extensions["com.github.copilot"]` path settings select the command, agent and rule folders.

## 2. Folder structure

```
qamart-copilot-plugin/
├── plugin.json                         manifest + component registry
├── mcp.json                            servers loaded by the plugin (qamart-api, github)
├── instructions/
│   ├── qa-guidelines.instructions.md
│   └── playwright-agent-rules.instructions.md
├── prompts/
│   ├── generate-playwright-tests.prompt.md
│   └── review-playwright-tests.prompt.md
├── skills/
│   ├── playwright-test-generator/  SKILL.md, examples.md
│   └── qa-regression-analyzer/     SKILL.md, examples.md, impact-map.cjs
├── com.github.copilot/
│   ├── agents/    qa-test-generator.agent.md, qa-review.agent.md
│   ├── commands/  generate-playwright-tests.md, review-playwright-tests.md
│   ├── rules/     qa-guidelines.instructions.md, playwright-agent-rules.instructions.md
│   └── hooks/     hooks.json
├── hooks/
│   ├── pre-execution.js
│   ├── post-execution.js
│   └── lib/event.js                    shared parsing for both harnesses
├── mcp/
│   ├── qamart-api-server.cjs
│   ├── github-mcp.json                 standalone config (.vscode/mcp.json format)
│   └── qamart-api-mcp.json             standalone config (.vscode/mcp.json format)
├── scripts/
│   ├── install.cjs                     one-command install / uninstall
│   ├── validate-plugin.cjs             structure, schema, secrets
│   ├── test-hooks.cjs                  34 hook scenarios
│   └── mcp-smoke.cjs                   drives the MCP server against a live app
└── demo/DEMO.md                        recorded demo with real outputs
```

Changes made to the existing repository (all additive): `pages/LoginPage.ts`, `pages/ProductsPage.ts`, `tests/lab/us-104-sign-in.spec.ts` (demo output), `plugin:*` scripts in `package.json`, a marketplace entry in `.claude-plugin/marketplace.json`, an `enabledPlugins` entry in `.github/copilot/settings.json`, and `.vscode/settings.json` in `.gitignore`.

## 3. Install

Prerequisites: Node.js 20+ and VS Code with GitHub Copilot Chat. This clone is nested under the `qamart` folder. If VS Code is opened at `qamart`, run the installer with `--workspace ..`; if it is opened directly at `qa-mart-lab`, use the default command.

```bash
npm install
npx playwright install chromium
npm run plugin:install -- --workspace ..
```
When `qa-mart-lab` itself is the opened folder, use `npm run plugin:install` instead. Then run **Developer: Reload Window**.

`plugin:install` validates the plugin and merges these settings into `.vscode/settings.json` in the selected workspace (it holds an absolute plugin path):

| Setting | Why |
|---|---|
| `chat.plugins.enabled` | Turns on agent plugins (experimental) |
| `chat.pluginLocations` | Registers this folder: skills, agents, hooks, MCP servers |
| `chat.instructionsFilesLocations` | Loads the requested top-level instruction files |
| `chat.promptFilesLocations` | Loads the requested top-level prompt files |
| `chat.useAgentSkills` | Enables skills |

If your VS Code reads plugin locations from user settings only, run `node qamart-copilot-plugin/scripts/install.cjs --print` and paste the output into **Preferences: Open User Settings (JSON)**. To remove: `node qamart-copilot-plugin/scripts/install.cjs --uninstall`.

**Marketplace install (inside a Copilot CLI session, or any client that reads `.claude-plugin/marketplace.json`):**
```
/plugin marketplace add happiestmindslabsu2/qa-mart-lab
/plugin install qamart-copilot-plugin-sidharthag@qa-mart-lab
```
The repository's `.github/copilot/settings.json` recommends `qamart-copilot-plugin-sidharthag@qa-mart-lab` to anyone who opens it.

### Verify the install
1. Run **Developer: Reload Window** after changing the local plugin location.
2. Extensions view, search `@agentPlugins`: `qamart-copilot-plugin-sidharthag` is under Installed. In Copilot Chat, `/plugin list` shows the separate slash-command plugin inventory.
3. Chat > **Open Customizations**: 2 instructions, 2 prompts, 2 skills, 2 agents, hooks.
4. **MCP: List Servers**: `qamart-api` and `github` are running. **Configure Tools** shows 13 `qamart-api` tools.
5. Type `/` in Chat: `generate-playwright-tests` and `review-playwright-tests` appear.
6. Disable the plugin in `@agentPlugins`: skills, agents, hooks and servers disappear. Enable: they return.

## 4. MCP setup

### qamart-api (local, stdio)
Reads configuration only from environment variables. Nothing secret is in any file.

| Variable | Default | Purpose |
|---|---|---|
| `QAMART_URL` | `http://127.0.0.1:3000` | App under test. Start it with `npm start` |
| `QA_USER` | `asha@qamart.test` | Default lab account for tools that sign in |
| `QA_PASS` | none (required for sign-in tools) | Lab password from the repository README. Never returned to the model |
| `QAMART_MCP_READONLY` | unset | `1` disables `orders_place`, `orders_security_probe`, `orders_reset` |
| `QAMART_MCP_ALLOW_REMOTE` | unset | `1` allows a non-localhost `QAMART_URL`. Off so credentials never leave the machine |

Set them in the shell that launches VS Code, then start VS Code from it:
```powershell
# Windows PowerShell
$env:QA_PASS = 'Test@1234'; code .
```
```bash
# macOS / Linux
export QA_PASS='Test@1234'; code .
```

Tools: `qamart_health`, `auth_login`, `auth_negative_matrix`, `users_list_test_accounts`, `user_profile`, `products_list`, `products_get`, `coupons_validate`, `orders_list_for_user`, `orders_place`, `orders_security_probe`, `orders_list_all`, `orders_reset`. Read tools carry `readOnlyHint`, `orders_reset` carries `destructiveHint`, so the client asks before running it. Sign-in tokens stay inside the server.

### github (remote, HTTP)
Uses `https://api.githubcopilot.com/mcp/` with your existing GitHub sign-in in VS Code (OAuth), so no token is stored. Headers limit it to the `context,repos,issues,pull_requests` toolsets in **read-only** mode. Remove `X-MCP-Readonly` in `mcp.json` if your team wants agents to open issues.

Without OAuth (for example a CI runner), use the `github-local` entry in [mcp/github-mcp.json](mcp/github-mcp.json): it runs `ghcr.io/github/github-mcp-server` in Docker and passes `GITHUB_PERSONAL_ACCESS_TOKEN` through from the environment (`-e NAME` with no value). Use a fine-grained token with read access to this repository only.

The two files in `mcp/` use the `.vscode/mcp.json` format, so a team that does not use plugins can copy either into `.vscode/mcp.json`.

## 5. Hooks and guardrails

Wired in [com.github.copilot/hooks/hooks.json](com.github.copilot/hooks/hooks.json):

| Event | Script | Behavior |
|---|---|---|
| `userPromptSubmitted` | `pre-execution.js` | Blocks a prompt that contains a token or private key |
| `preToolUse` | `pre-execution.js` | **deny**: recursive deletes, force push, `reset --hard`, `clean -f`, `--no-verify`, `curl \| sh`, `npm publish`, disk/power commands; reading `.env`, keys, `playwright/.auth`, printing secret env vars; edits outside the repo or in `app/`, `.git/`, `node_modules/`, or the hook files themselves; new content with secrets; `test.only` in specs; `git commit` with a staged `test.only`. **ask**: `git push` |
| `postToolUse` | `post-execution.js` | After an edit to a spec, test file or Page Object: plugin rules (`.only`, `page.pause`, weak assertions, story id, assertions in Page Objects, fixtures import) + the repo's `scripts/lint-specs.cjs` + typecheck limited to edited files. Findings go back to the agent as `additionalContext` |
| `sessionEnd` | `post-execution.js --summary-hook` | Writes `reports/copilot-hooks/execution-summary.md` |

- Both harness shapes are supported (Copilot `toolName/toolArgs`, Local `tool_name/tool_input`) and both output shapes are printed.
- Every decision is logged to `reports/copilot-hooks/actions.jsonl` (git-ignored): tool name, decision, rule, relative file paths. Never prompt text, file contents or full commands. Override the folder with `QAMART_HOOK_LOG_DIR`.
- `npm run plugin:summary` prints the summary of the current session.
- `QAMART_HOOK_TYPECHECK=0` skips the typecheck for faster edits.
- Limits: a hook sees tool calls, not what a shell script does internally. Treat the guardrails as a safety net next to code review, not a sandbox.

## 6. Usage

| Goal | In Copilot Chat |
|---|---|
| Generate tests for a story | `/generate-playwright-tests US-104` or agent **QA Test Generator**: "Write tests for US-106 field validation" |
| Review a test | `/review-playwright-tests tests/legacy/legacy-checkout.spec.ts` or agent **QA Review** |
| Review a pull request | Agent **QA Review**: "Review PR #12 in happiestmindslabsu2/qa-mart-lab" |
| Plan regression | "Use the qa-regression-analyzer skill for my branch against origin/main" |
| Probe the API | "Use the qamart-api tools to run the US-104 negative sign-in matrix" |

Command line equivalents: `npm run plugin:impact -- --base origin/main`, `npm run lint:specs`, `npm test`.

## 7. Validation checklist

| # | Check | Command | Expected |
|---|---|---|---|
| 1 | Manifest, registry, frontmatter, configs, scripts parse, no secrets | `npm run plugin:validate` | `Plugin is valid` (65 checks) |
| 2 | Guardrails and standards scan | `npm run plugin:test-hooks` | `All hook checks passed` (34 scenarios) |
| 3 | MCP server against a live app | Set `QA_PASS` to the QA Mart lab account password, then run `npm run plugin:mcp-smoke` | `All MCP checks passed` (20 checks; auth/order checks skipped without `QA_PASS`) |
| 4 | Framework checks | `npm run typecheck`, `npm run lint:specs`, `npm test`, `npm run test:v2` | Typecheck, lint and chromium pass. v2 includes one known legacy selector failure in `tests/legacy/legacy-checkout.spec.ts`; do not rewrite that review fixture |
| 5 | Demo spec on both designs | `npx playwright test tests/lab/us-104-sign-in.spec.ts --project=chromium --project=ui-v2` | 18 passed |
| 6 | Clean install | `npm run plugin:install`, reload, section 3 "Verify the install" | All components visible |
| 7 | No secrets in repo | `npm run plugin:validate` (secret scan) and `git grep -nE "gh[pousr]_[A-Za-z0-9]{36}"` | No matches |

`npm run plugin:check` runs 1 to 3 in one go.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| Plugin not listed | Confirm `.vscode/settings.json` is at the opened workspace root and has the absolute `chat.pluginLocations` entry; run **Developer: Reload Window**. Check `@agentPlugins` for `qamart-copilot-plugin-sidharthag` and `/plugin list` for the separate chat plugin inventory. |
| Instructions or prompts missing | Confirm the loaded copies exist in `com.github.copilot/rules/` and `com.github.copilot/commands/`; the top-level folders are also registered as workspace customizations. |
| `qamart-api` tools fail with "not reachable" | Run `npm start`, or set `QAMART_URL` |
| "QA_PASS is not set" | Set it in the environment that starts VS Code, then restart VS Code |
| `github` server asks to sign in | Accept the GitHub OAuth prompt; or use `github-local` with a token in the environment |
| Hook blocks something legitimate | Read the reason; run the command yourself. Rules are in `hooks/pre-execution.js` |
| Hooks run twice | A copy of the same hook also exists in `.github/hooks/`. Keep one |

## 9. Safety notes
- Plugin MCP servers and hooks run code on your machine without a trust prompt. Read them before enabling.
- No credentials are stored in this plugin. `QA_PASS` and GitHub tokens come from the environment, and the validator scans every file for token patterns.
- The QA Review agent has no edit tool. The generator cannot touch `app/`, and no agent can modify the guardrail hooks.
