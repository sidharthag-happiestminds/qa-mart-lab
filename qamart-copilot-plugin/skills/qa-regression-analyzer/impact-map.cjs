#!/usr/bin/env node
// Maps changed files to QA Mart flows, scores risk, picks the specs and suites to run, and lists
// acceptance criteria with no test. Zero dependencies. Run from the repository root.
//   node impact-map.cjs                    changes in the working tree (staged, unstaged, untracked) vs HEAD
//   node impact-map.cjs --base origin/main changes on this branch
//   node impact-map.cjs --files app/public/checkout.html,pages/LoginPage.ts
//   add --json for machine-readable output, --all-gaps to list gaps for every story
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const root = path.resolve(opt('--root') || process.cwd());
const base = opt('--base') || 'HEAD';

const AREAS = {
  auth: { label: 'Sign in', stories: ['US-104'], risk: 3, ui: true, re: /\/api\/login|\/login\b|signIn|LoginPage|api\.login|signedInPage|Sign in|locked/i },
  products: { label: 'Product list and search', stories: ['US-103'], risk: 2, ui: true, re: /\/api\/products|ProductsPage|product-grid|Add to cart|listitem/i },
  stock: { label: 'Stock limits', stories: ['US-103'], risk: 3, ui: true, re: /inventory|stock|Out of stock/i },
  cart: { label: 'Cart', stories: ['US-101', 'US-103'], risk: 3, ui: true, re: /\/cart\b|CartPage|cart-subtotal|cart-count|qm_cart|saveCart/i },
  coupons: { label: 'Coupons and pricing', stories: ['US-101'], risk: 3, ui: true, re: /coupon|SAVE10|FLAT100|WELCOME50|SUMMER25|discount|validateCoupon/i },
  checkout: { label: 'Checkout and order placement', stories: ['US-106', 'US-105'], risk: 4, ui: true, re: /checkout|Place order|placeOrder|shipping|confirmation|fullName|mobile|\bpin\b/i },
  orders: { label: 'Order history and order security', stories: ['US-102', 'US-105'], risk: 4, ui: true, re: /\/api\/orders|\/orders\b|Order history|orderId|Bearer|token/i },
};
const ALL = Object.keys(AREAS);
const RISK_NAME = ['None', 'Low', 'Medium', 'High', 'Critical'];
const PAGE_AREA = { Login: ['auth'], Products: ['products', 'stock'], Cart: ['cart'], Checkout: ['checkout', 'coupons'], Confirmation: ['checkout'], Orders: ['orders'] };
const STORY_AREA = Object.fromEntries(Object.values(AREAS).flatMap((a) => a.stories).map((s) => [s, ALL.filter((k) => AREAS[k].stories.includes(s))]));

const git = (gitArgs) => {
  const r = spawnSync('git', gitArgs, { cwd: root, encoding: 'utf8', timeout: 15000, windowsHide: true });
  return r.status === 0 ? r.stdout : '';
};

function changedFiles() {
  const list = opt('--files');
  if (list) return list.split(',').map((f) => f.trim().replace(/\\/g, '/')).filter(Boolean);
  const tracked = git(['diff', '--name-only', base]).split(/\r?\n/);
  const untracked = base === 'HEAD' ? git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/) : [];
  return [...new Set([...tracked, ...untracked].filter(Boolean))];
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

const specs = walk(path.join(root, 'tests')).map((abs) => {
  const rel = path.relative(root, abs).split(path.sep).join('/');
  const text = fs.readFileSync(abs, 'utf8');
  const storyIds = [...new Set(text.match(/US-\d{3}/g) || [])];
  const areas = new Set(ALL.filter((k) => AREAS[k].re.test(text)));
  storyIds.forEach((s) => (STORY_AREA[s] || []).forEach((a) => areas.add(a)));
  const project = rel.includes('/seeded/') ? 'seeded' : rel.includes('/legacy/') ? 'legacy' : rel.endsWith('trace-demo.spec.ts') ? 'demo' : 'chromium';
  const covered = new Set([...text.matchAll(/(US-\d{3})\s+AC(\d+)/g)].map((m) => `${m[1]} AC${m[2]}`));
  return { rel, areas: [...areas], project, covered };
});

function classify(file) {
  // Returns { areas, weight, kind }. weight: 3 business logic, 2 UI or test infrastructure, 1 docs/styles.
  if (file === 'app/server.js') {
    const diff = opt('--files') ? '' : git(['diff', base, '--', 'app/server.js']);
    const changed = diff.split(/\r?\n/).filter((l) => /^[+-][^+-]/.test(l)).join('\n');
    const hit = ALL.filter((k) => AREAS[k].re.test(changed));
    return { areas: hit.length ? hit : ALL, weight: 3, kind: 'API and business rules' };
  }
  if (file === 'app/public/app.js') return { areas: ALL, weight: 2, kind: 'front-end logic for every page' };
  const html = file.match(/^app\/public\/(\w+)\.html$/);
  if (html) {
    const map = { login: ['auth'], products: ['products', 'stock', 'cart'], cart: ['cart'], checkout: ['checkout', 'coupons'], confirmation: ['checkout'], orders: ['orders'] };
    return { areas: map[html[1]] || ALL, weight: 2, kind: 'page markup' };
  }
  if (file === 'app/public/styles.css') return { areas: ALL, weight: 1, kind: 'styles' };
  if (/^(tests\/fixtures\.ts|tests\/test-data\.ts|playwright\.config\.ts|package\.json|tsconfig\.json)$/.test(file)) return { areas: ALL, weight: 2, kind: 'test infrastructure' };
  const page = file.match(/^pages\/(\w+)Page\.ts$/);
  if (page) return { areas: PAGE_AREA[page[1]] || ALL, weight: 2, kind: 'Page Object' };
  const story = file.match(/^docs\/stories\/(US-\d{3})/);
  if (story) return { areas: STORY_AREA[story[1]] || [], weight: 1, kind: 'story change' };
  if (file === 'docs/api/openapi.yaml') return { areas: ALL, weight: 1, kind: 'API contract' };
  const spec = specs.find((s) => s.rel === file);
  if (spec) return { areas: spec.areas, weight: 1, kind: 'spec', spec: spec.rel };
  return { areas: [], weight: 0, kind: 'not mapped to a QA Mart flow' };
}

function storyCriteria() {
  const dir = path.join(root, 'docs', 'stories');
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const name of fs.readdirSync(dir).filter((n) => /^US-\d{3}.*\.md$/.test(n))) {
    const id = name.slice(0, 6);
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    const section = (text.split(/^## Acceptance criteria\s*$/m)[1] || '').split(/^## /m)[0];
    out[id] = [...section.matchAll(/^(\d+)\.\s+(.+)$/gm)].map((m) => ({ ac: `${id} AC${m[1]}`, text: m[2].trim() }));
  }
  return out;
}

const files = changedFiles();
const changes = files.map((f) => ({ file: f, ...classify(f) }));
const impact = {};
for (const c of changes) {
  for (const a of c.areas) {
    const score = AREAS[a].risk * c.weight;
    if (!impact[a] || impact[a].score < score) impact[a] = { area: a, label: AREAS[a].label, stories: AREAS[a].stories, score, risk: RISK_NAME[Math.min(4, Math.ceil(score / 3))], because: [] };
    impact[a].because.push(`${c.file} (${c.kind})`);
  }
}
const impacted = Object.values(impact).sort((x, y) => y.score - x.score);
const impactedAreas = new Set(impacted.map((i) => i.area));

const changedSpecs = changes.filter((c) => c.spec).map((c) => c.spec);
const toRun = specs.filter((s) => s.project === 'chromium' && (s.areas.some((a) => impactedAreas.has(a)) || changedSpecs.includes(s.rel))).map((s) => s.rel);
const seededHit = specs.filter((s) => s.project === 'seeded' && s.areas.some((a) => impactedAreas.has(a))).map((s) => s.rel);

const suites = [{ tier: 'Smoke', command: 'npx playwright test tests/tour/smoke.spec.ts', why: 'always' }];
if (toRun.length) suites.push({ tier: 'Targeted', command: `npx playwright test ${toRun.join(' ')}`, why: 'specs that cover the impacted flows' });
if (toRun.length && impacted.some((i) => AREAS[i.area].ui)) suites.push({ tier: 'Targeted v2', command: `npx playwright test ${toRun.join(' ')} --project=ui-v2`, why: 'UI flows must pass on the v2 redesign' });
if (changes.some((c) => c.file === 'app/server.js') && seededHit.length) suites.push({ tier: 'Known defects', command: 'npm run test:seeded', why: 'server logic changed; check whether a planted bug was fixed or a new one appeared' });
if (changedSpecs.length) suites.push({ tier: 'Flakiness', command: `npx playwright test ${changedSpecs.join(' ')} --repeat-each=3`, why: 'new or changed specs must be stable' });
if (impacted.some((i) => i.score >= 9) || changes.some((c) => c.kind === 'test infrastructure')) {
  suites.push({ tier: 'Full', command: 'npm test', why: 'critical-risk or infrastructure change' });
  suites.push({ tier: 'Full v2', command: 'npm run test:v2', why: 'same change on the v2 redesign' });
}

const criteria = storyCriteria();
const coveredAll = new Set(specs.flatMap((s) => [...s.covered]));
const storiesForGaps = args.includes('--all-gaps') || !impacted.length ? Object.keys(criteria) : [...new Set(impacted.flatMap((i) => i.stories))];
const gaps = storiesForGaps.sort().flatMap((id) => (criteria[id] || []).filter((c) => !coveredAll.has(c.ac)));

const result = { base: opt('--files') ? 'explicit file list' : base, changes, impacted, specsToRun: toRun, suites, coverageGaps: gaps };

if (args.includes('--json')) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else {
  const lines = [`# Regression impact (${result.base})`, ''];
  lines.push('## Changed files', ...(changes.length ? changes.map((c) => `- ${c.file}: ${c.kind}${c.areas.length ? ` -> ${c.areas.join(', ')}` : ''}`) : ['- none']), '');
  lines.push('## Impacted flows', '| Flow | Stories | Risk | Score | Because |', '|---|---|---|---|---|');
  impacted.forEach((i) => lines.push(`| ${i.label} | ${i.stories.join(', ')} | ${i.risk} | ${i.score} | ${[...new Set(i.because)].join('; ')} |`));
  if (!impacted.length) lines.push('| none | | | | |');
  lines.push('', '## Recommended suites', ...suites.map((s) => `- **${s.tier}**: \`${s.command}\` (${s.why})`), '');
  lines.push(`## Coverage gaps (acceptance criteria with no "US-xxx ACn" test title${storiesForGaps.length === Object.keys(criteria).length ? ', all stories' : ''})`);
  lines.push(...(gaps.length ? gaps.map((g) => `- ${g.ac}: ${g.text}`) : ['- none']), '');
  process.stdout.write(lines.join('\n'));
}
