#!/usr/bin/env node
// Starts QA Mart on a spare port, drives the plugin's qamart-api MCP server over stdio and checks every tool.
// Auth and order checks need QA_PASS in the environment; without it they are skipped, not failed.
// Usage: node qamart-copilot-plugin/scripts/mcp-smoke.cjs        (SMOKE_PORT to change the port, default 3198)
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');

const PLUGIN = path.resolve(__dirname, '..');
const REPO = path.resolve(PLUGIN, '..');
const SERVER = path.join(PLUGIN, 'mcp', 'qamart-api-server.cjs');
const PORT = process.env.SMOKE_PORT || '3198';
const HAS_PASS = !!process.env.QA_PASS;
const EXPECTED = ['qamart_health', 'auth_login', 'auth_negative_matrix', 'users_list_test_accounts', 'user_profile', 'products_list', 'products_get',
  'coupons_validate', 'orders_list_for_user', 'orders_place', 'orders_security_probe', 'orders_list_all', 'orders_reset'];

function startServer(extraEnv) {
  const proc = spawn(process.execPath, [SERVER], { cwd: REPO, env: { ...process.env, QAMART_URL: `http://127.0.0.1:${PORT}`, ...extraEnv }, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  const nonProtocol = [];
  readline.createInterface({ input: proc.stdout }).on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { nonProtocol.push(line); return; }
    if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  let nextId = 1;
  const request = (method, params) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const call = async (name, args = {}) => {
    const res = await request('tools/call', { name, arguments: args });
    if (!res.result) return { protocolError: res.error };
    const txt = res.result.content[0].text;
    let data; try { data = JSON.parse(txt); } catch { data = txt; }
    return { data, isError: !!res.result.isError };
  };
  return { proc, request, call, nonProtocol };
}

let failed = 0;
const check = (label, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  ${JSON.stringify(detail)}`}`); if (!ok) failed++; };
const skip = (label) => console.log(`skip ${label} (set QA_PASS to run)`);
const show = (label, value) => { if (process.argv.includes('--verbose')) console.log(`     ${label}: ${JSON.stringify(value)}`); };

const app = spawn(process.execPath, ['app/server.js'], { cwd: REPO, env: { ...process.env, PORT }, stdio: 'ignore' });
const mcp = startServer({});
const remote = startServer({ QAMART_URL: 'https://qamart.example.com' });
const readonly = startServer({ QAMART_MCP_READONLY: '1' });

async function waitForApp() {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`QA Mart did not start on port ${PORT}`);
}

(async () => {
  await waitForApp();
  const init = await mcp.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
  check('initialize returns serverInfo qamart-api', init.result && init.result.serverInfo.name === 'qamart-api', init);
  mcp.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await mcp.request('tools/list', {});
  const tools = list.result.tools;
  check(`tools/list has all ${EXPECTED.length} tools`, EXPECTED.every((n) => tools.some((t) => t.name === n)), tools.map((t) => t.name));
  check('read tools are annotated readOnlyHint', tools.filter((t) => /^(qamart_health|products_|users_|coupons_)/.test(t.name)).every((t) => t.annotations && t.annotations.readOnlyHint === true));
  check('orders_reset is annotated destructiveHint', tools.find((t) => t.name === 'orders_reset').annotations.destructiveHint === true);

  const health = await mcp.call('qamart_health');
  check('qamart_health', health.data.status === 'ok', health); show('qamart_health', health.data);
  const productsRes = await mcp.call('products_list');
  check('products_list returns 6 products with stock', Array.isArray(productsRes.data) && productsRes.data.length === 6 && productsRes.data.every((p) => typeof p.stock === 'number'), productsRes);
  const lamp = await mcp.call('products_get', { query: 'desk lamp' });
  check('products_get finds Desk Lamp by name', lamp.data.id === 'p4', lamp); show('products_get', lamp.data);
  const flat = await mcp.call('coupons_validate', { code: 'FLAT100', subtotal: 500 });
  check('coupons_validate FLAT100 at 500 returns an HTTP status (422 = planted bug B1)', typeof flat.data.httpStatus === 'number', flat); show('coupons_validate', flat.data);
  const accounts = await mcp.call('users_list_test_accounts');
  check('users_list_test_accounts lists 3 accounts without passwords', accounts.data.length === 3 && !JSON.stringify(accounts.data).toLowerCase().includes('password'), accounts);

  if (HAS_PASS) {
    const login = await mcp.call('auth_login', { email: 'asha@qamart.test' });
    check('auth_login signs in and never returns the token', login.data.signedIn === true && !('token' in login.data), login); show('auth_login', login.data);
    const matrix = await mcp.call('auth_negative_matrix');
    check('auth_negative_matrix: every row matches US-104', Array.isArray(matrix.data) && matrix.data.every((r) => r.pass), matrix.data);
    show('auth_negative_matrix', matrix.data);
    const profile = await mcp.call('user_profile', { email: 'ravi@qamart.test' });
    check('user_profile gives the expected header greeting', profile.data.expectedGreeting === 'Hi, Ravi', profile);
    await mcp.call('orders_reset');
    const order = await mcp.call('orders_place', { email: 'ravi@qamart.test', items: [{ id: 'p2', qty: 2 }] });
    check('orders_place creates QM-10001 for ₹498', order.data.httpStatus === 201 && order.data.orderId === 'QM-10001' && order.data.total === 498, order);
    const mine = await mcp.call('orders_list_for_user', { email: 'ravi@qamart.test' });
    check('orders_list_for_user shows the order', mine.data.orders.length === 1 && mine.data.orders[0].orderId === 'QM-10001', mine);
    const probe = await mcp.call('orders_security_probe');
    check('orders_security_probe reports expected versus actual (fails = planted bug B3)', Array.isArray(probe.data) && probe.data.length === 2, probe);
    show('orders_security_probe', probe.data);
    await mcp.call('orders_reset');
  } else {
    ['auth_login', 'auth_negative_matrix', 'user_profile', 'orders_place', 'orders_list_for_user', 'orders_security_probe'].forEach(skip);
    const noPass = await mcp.call('auth_login');
    check('auth_login without QA_PASS explains how to set it', noPass.isError && /QA_PASS is not set/.test(noPass.data), noPass);
  }

  const all = await mcp.call('orders_list_all');
  check('orders_list_all', Array.isArray(all.data.orders), all);

  await remote.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
  const blocked = await remote.call('products_list');
  check('guardrail: non-local QAMART_URL is refused', blocked.isError && /only talks to a local QA Mart/.test(blocked.data), blocked);
  await readonly.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
  const ro = await readonly.call('orders_reset');
  check('guardrail: QAMART_MCP_READONLY=1 disables orders_reset', ro.isError && /READONLY/.test(ro.data), ro);

  const unknown = await mcp.request('tools/call', { name: 'nope', arguments: {} });
  check('unknown tool is a protocol error', unknown.error && unknown.error.code === -32602, unknown);
  check('stdout carries protocol messages only', mcp.nonProtocol.length === 0, mcp.nonProtocol);

  console.log(failed ? `\n${failed} check(s) failed` : '\nAll MCP checks passed');
})().catch((e) => { console.error(e); failed = 1; }).finally(() => {
  [app, mcp.proc, remote.proc, readonly.proc].forEach((p) => p.kill());
  process.exit(failed ? 1 : 0);
});
