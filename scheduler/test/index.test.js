import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { JOBS, dispatch } from '../src/index.js';

const env = { GH_TOKEN: 't', GH_REPO: 'o/r', GH_REF: 'main' };
const reply = (status, body = '') => ({ status, text: async () => body });

test('crons in wrangler.toml match the JOBS map', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const crons = JSON.parse(toml.match(/crons = (\[.*\])/)[1]);
  assert.deepEqual(crons.sort(), Object.keys(JOBS).sort());
});

test('dispatches the right workflow on main', async () => {
  const calls = [];
  await dispatch('post.yml', env, async (url, init) => { calls.push({ url, init }); return reply(204); });
  assert.equal(calls[0].url, 'https://api.github.com/repos/o/r/actions/workflows/post.yml/dispatches');
  assert.equal(JSON.parse(calls[0].init.body).ref, 'main');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer t');
});

test('retries server errors, then succeeds', async () => {
  let n = 0;
  const r = await dispatch('deals.yml', env, async () => (++n < 2 ? reply(502) : reply(204)));
  assert.equal(r.attempt, 2);
});

test('does not retry a bad token', async () => {
  let n = 0;
  await assert.rejects(dispatch('post.yml', env, async () => { n++; return reply(401, 'Bad credentials'); }), /401/);
  assert.equal(n, 1);
});

test('missing secret fails loudly', async () => {
  await assert.rejects(dispatch('post.yml', { GH_REPO: 'o/r' }, async () => reply(204)), /GH_TOKEN/);
});

test('public URL returns 404', async () => {
  assert.equal((await worker.fetch()).status, 404);
});

test('trims whitespace around the token', async () => {
  let auth;
  await dispatch('post.yml', { ...env, GH_TOKEN: '  t\n' }, async (url, init) => { auth = init.headers.Authorization; return reply(204); });
  assert.equal(auth, 'Bearer t');
});
