#!/usr/bin/env node
// QA Mart API MCP server: stdio, newline-delimited JSON-RPC, zero dependencies (Node 20+).
// Tools cover the auth, user, product, coupon and order APIs in docs/api/openapi.yaml.
// Environment (nothing is hard-coded):
//   QAMART_URL               app base URL, default http://127.0.0.1:3000
//   QA_USER                  default shopper email, default asha@qamart.test (a public lab account)
//   QA_PASS                  lab password; required by tools that sign in. Never returned to the model.
//   QAMART_MCP_READONLY=1    disable tools that change app state
//   QAMART_MCP_ALLOW_REMOTE=1 allow a non-localhost QAMART_URL (off by default so credentials stay local)
// stdout carries protocol messages only; logs go to stderr.
'use strict';
const readline = require('node:readline');

const BASE = (process.env.QAMART_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const DEFAULT_USER = process.env.QA_USER || 'asha@qamart.test';
const READONLY = process.env.QAMART_MCP_READONLY === '1';
const PROTOCOL = '2024-11-05';
const LAB_ACCOUNTS = [
  { email: 'asha@qamart.test', role: 'standard shopper, first order still available' },
  { email: 'ravi@qamart.test', role: 'returning shopper' },
  { email: 'locked@qamart.test', role: 'locked account (sign-in returns 423)' },
];

const log = (...a) => console.error('[qamart-api-mcp]', ...a);
const tokens = new Map();

function assertLocalTarget() {
  const host = new URL(BASE).hostname;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host) && process.env.QAMART_MCP_ALLOW_REMOTE !== '1') {
    throw new Error(`QAMART_URL points at ${host}. This server only talks to a local QA Mart unless QAMART_MCP_ALLOW_REMOTE=1.`);
  }
}

function password() {
  const p = process.env.QA_PASS;
  if (!p) throw new Error('QA_PASS is not set. Set it in the environment that starts VS Code (see qamart-copilot-plugin/README.md, MCP setup).');
  return p;
}

async function http(method, route, { body, token } = {}) {
  assertLocalTarget();
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(BASE + route, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
  } catch (err) {
    throw new Error(`QA Mart is not reachable at ${BASE}. Start it with "npm start". (${err.message})`);
  }
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function signIn(email) {
  const r = await http('POST', '/api/login', { body: { email, password: password() } });
  if (r.status === 200) tokens.set(email.trim().toLowerCase(), r.data.token);
  return r;
}

async function tokenFor(email) {
  const key = email.trim().toLowerCase();
  if (tokens.has(key)) return tokens.get(key);
  const r = await signIn(email);
  if (r.status !== 200) throw new Error(`Sign-in for ${email} failed with ${r.status}: ${r.data.error || 'no message'}`);
  return tokens.get(key);
}

function guardWrite() {
  if (READONLY) throw new Error('QAMART_MCP_READONLY=1: tools that change app state are disabled.');
}

async function productsWithStock() {
  const [p, s] = await Promise.all([http('GET', '/api/products'), http('GET', '/api/inventory')]);
  return (p.data.products || []).map((x) => ({ ...x, stock: (s.data.stock || {})[x.id] }));
}

const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
const emailProp = { type: 'string', description: 'Lab account email. Defaults to QA_USER.' };

const TOOLS = [
  {
    name: 'qamart_health', description: 'Check that the QA Mart app is running and which URL this server targets.',
    annotations: READ, inputSchema: { type: 'object', properties: {} },
    run: async () => text({ url: BASE, readOnly: READONLY, ...(await http('GET', '/api/health')).data }),
  },
  // ---- Authentication APIs ----
  {
    name: 'auth_login', description: 'Sign in a lab account with the QA_PASS password (POST /api/login). Returns status and profile; the token is kept inside the server and never returned.',
    annotations: READ, inputSchema: { type: 'object', properties: { email: emailProp } },
    run: async (a) => {
      const email = a.email || DEFAULT_USER;
      const r = await signIn(email);
      return text({ httpStatus: r.status, email: r.data.email, name: r.data.name, signedIn: r.status === 200, error: r.data.error });
    },
  },
  {
    name: 'auth_negative_matrix', description: 'Run the US-104 sign-in matrix against the API: wrong password, unknown user, locked account, empty body, mixed-case email with spaces. Returns expected versus actual status for each row.',
    annotations: READ, inputSchema: { type: 'object', properties: {} },
    run: async () => {
      const pass = password();
      const rows = [
        { case: 'valid credentials', body: { email: DEFAULT_USER, password: pass }, expected: 200 },
        { case: 'wrong password', body: { email: DEFAULT_USER, password: `${pass}-wrong` }, expected: 401 },
        { case: 'unknown user', body: { email: 'nobody@qamart.test', password: pass }, expected: 401 },
        { case: 'locked account', body: { email: 'locked@qamart.test', password: pass }, expected: 423 },
        { case: 'empty email and password', body: { email: '', password: '' }, expected: 401 },
        { case: 'email upper case with spaces (AC5)', body: { email: `  ${DEFAULT_USER.toUpperCase()}  `, password: pass }, expected: 200 },
      ];
      const out = [];
      for (const row of rows) {
        const r = await http('POST', '/api/login', { body: row.body });
        out.push({ case: row.case, expected: row.expected, actual: r.status, pass: r.status === row.expected, message: r.data.error || null });
      }
      return text(out);
    },
  },
  // ---- User APIs ----
  {
    name: 'users_list_test_accounts', description: 'List the lab accounts and what each is for. Emails only; passwords come from QA_PASS.',
    annotations: READ, inputSchema: { type: 'object', properties: {} },
    run: async () => text(LAB_ACCOUNTS),
  },
  {
    name: 'user_profile', description: 'Sign in a lab account and return its profile (email, display name, greeting the header should show).',
    annotations: READ, inputSchema: { type: 'object', properties: { email: emailProp } },
    run: async (a) => {
      const r = await signIn(a.email || DEFAULT_USER);
      if (r.status !== 200) return { ...text({ httpStatus: r.status, error: r.data.error }), isError: true };
      return text({ email: r.data.email, name: r.data.name, expectedGreeting: `Hi, ${String(r.data.name).split(' ')[0]}` });
    },
  },
  // ---- Product APIs ----
  {
    name: 'products_list', description: 'List products with price (rupees) and the per-order stock limit (GET /api/products and /api/inventory).',
    annotations: READ, inputSchema: { type: 'object', properties: {} },
    run: async () => text(await productsWithStock()),
  },
  {
    name: 'products_get', description: 'Find one product by id (p1..p6) or by name, case-insensitive.',
    annotations: READ, inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } },
    run: async (a) => {
      const q = String(a.query).trim().toLowerCase();
      const all = await productsWithStock();
      const hit = all.find((p) => p.id === q || p.name.toLowerCase() === q) || all.find((p) => p.name.toLowerCase().includes(q));
      return hit ? text(hit) : { ...text(`No product matches "${a.query}".`), isError: true };
    },
  },
  {
    name: 'coupons_validate', description: 'Validate a coupon for a subtotal in rupees (POST /api/coupons/validate). Returns the HTTP status and response.',
    annotations: READ, inputSchema: { type: 'object', required: ['code', 'subtotal'], properties: { code: { type: 'string' }, subtotal: { type: 'number' }, email: emailProp } },
    run: async (a) => {
      const r = await http('POST', '/api/coupons/validate', { body: { code: a.code, subtotal: a.subtotal, email: a.email || DEFAULT_USER } });
      return text({ httpStatus: r.status, ...r.data });
    },
  },
  // ---- Order APIs ----
  {
    name: 'orders_list_for_user', description: 'Order history of one lab account, newest first (GET /api/orders with its token).',
    annotations: READ, inputSchema: { type: 'object', properties: { email: emailProp } },
    run: async (a) => {
      const r = await http('GET', '/api/orders', { token: await tokenFor(a.email || DEFAULT_USER) });
      return text({ httpStatus: r.status, ...r.data });
    },
  },
  {
    name: 'orders_place', description: 'Sign in and place an order (POST /api/orders). Items are { id, qty }. Changes app state.',
    annotations: WRITE,
    inputSchema: { type: 'object', required: ['items'], properties: { email: emailProp, coupon: { type: 'string' }, items: { type: 'array', minItems: 1, items: { type: 'object', required: ['id', 'qty'], properties: { id: { type: 'string' }, qty: { type: 'integer', minimum: 1 } } } } } },
    run: async (a) => {
      guardWrite();
      const email = a.email || DEFAULT_USER;
      const r = await http('POST', '/api/orders', { body: { email, items: a.items, coupon: a.coupon }, token: await tokenFor(email) });
      return text({ httpStatus: r.status, ...r.data });
    },
  },
  {
    name: 'orders_security_probe', description: 'US-105 check: place a one-item order with no token and with another shopper\'s token. Both should be rejected (401 and 403). Changes app state if the app is vulnerable.',
    annotations: WRITE, inputSchema: { type: 'object', properties: {} },
    run: async () => {
      guardWrite();
      const items = [{ id: 'p2', qty: 1 }];
      const noToken = await http('POST', '/api/orders', { body: { email: 'asha@qamart.test', items } });
      const wrongToken = await http('POST', '/api/orders', { body: { email: 'asha@qamart.test', items }, token: await tokenFor('ravi@qamart.test') });
      return text([
        { case: 'no token', expected: 401, actual: noToken.status, pass: noToken.status === 401 },
        { case: "ravi's token for asha's order", expected: 403, actual: wrongToken.status, pass: wrongToken.status === 403 },
      ]);
    },
  },
  {
    name: 'orders_list_all', description: 'Every order since the last reset (GET /api/test/orders, test-control API).',
    annotations: READ, inputSchema: { type: 'object', properties: {} },
    run: async () => text((await http('GET', '/api/test/orders')).data),
  },
  {
    name: 'orders_reset', description: 'Delete all orders and restart numbering at QM-10001 (POST /api/test/reset). Destructive for any test running in parallel.',
    annotations: DESTRUCTIVE, inputSchema: { type: 'object', properties: {} },
    run: async () => { guardWrite(); tokens.clear(); return text((await http('POST', '/api/test/reset')).data); },
  },
];

function send(msg) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n'); }

async function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;
  try {
    if (method === 'initialize') {
      return send({ id, result: { protocolVersion: (params && params.protocolVersion) || PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'qamart-api', version: '1.0.0' } } });
    }
    if (method === 'ping') return send({ id, result: {} });
    if (method === 'tools/list') {
      return send({ id, result: { tools: TOOLS.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })) } });
    }
    if (method === 'tools/call') {
      const tool = TOOLS.find((t) => t.name === (params && params.name));
      if (!tool) return send({ id, error: { code: -32602, message: `Unknown tool: ${params && params.name}` } });
      try {
        return send({ id, result: await tool.run((params && params.arguments) || {}) });
      } catch (err) {
        return send({ id, result: { content: [{ type: 'text', text: err.message }], isError: true } });
      }
    }
    if (isRequest) return send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (err) {
    log(err);
    if (isRequest) send({ id, error: { code: -32603, message: err.message } });
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ id: null, error: { code: -32700, message: 'Parse error' } }); }
  handle(msg);
});
rl.on('close', () => process.exit(0));
log(`ready, app at ${BASE}, readOnly=${READONLY}, QA_PASS ${process.env.QA_PASS ? 'set' : 'not set'}`);
