// GitHubStore against a fake GitHub contents API (same request/response shapes, no network).
import assert from "node:assert/strict";
import { test } from "node:test";

import { GitHubStore } from "../js/github-store.js";
import { ops } from "../js/rules.js";

function fakeGitHub() {
  const repo = { file: null, sha: 0, puts: 0 };
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
  const fetchImpl = async (url, opts = {}) => {
    assert.match(opts.headers.Authorization, /^Bearer tok$/);
    if (!opts.method) {
      if (!repo.file) return { ok: false, status: 404 };
      return { ok: true, status: 200, json: async () => ({ content: b64(repo.file), sha: `s${repo.sha}` }) };
    }
    repo.puts++;
    const body = JSON.parse(opts.body);
    const current = repo.file ? `s${repo.sha}` : undefined;
    if (body.sha !== current) return { ok: false, status: 409 };
    repo.file = Buffer.from(body.content, "base64").toString("utf8");
    repo.sha++;
    return { ok: true, status: 200, json: async () => ({ content: { sha: `s${repo.sha}` } }) };
  };
  return { repo, fetchImpl };
}

const make = (fetchImpl) =>
  new GitHubStore({ owner: "o", repo: "r", path: "data.json", token: "tok", fetchImpl });

test("first save creates the file; Vietnamese text survives the round trip", async () => {
  const { repo, fetchImpl } = fakeGitHub();
  const store = make(fetchImpl);
  await store.load();
  await store.apply(ops.skip("eny", "2026-11-19", "đi đám cưới 🎉"));
  const again = make(fetchImpl);
  await again.load();
  assert.equal(again.view().people.eny.days["2026-11-19"].skip, "đi đám cưới 🎉");
  assert.equal(repo.puts, 1);
});

test("the other phone saved in between: reload and keep both edits", async () => {
  const { fetchImpl } = fakeGitHub();
  const anyPhone = make(fetchImpl);
  const enyPhone = make(fetchImpl);
  await anyPhone.load();
  await enyPhone.load();
  await enyPhone.apply(ops.tick("eny", "2026-11-19", "doc", true));
  await anyPhone.apply(ops.tick("any", "2026-11-19", "tap", true)); // stale sha → 409 → retry
  const check = make(fetchImpl);
  await check.load();
  const days = (p) => check.view().people[p].days["2026-11-19"].ticks;
  assert.deepEqual([days("any"), days("eny")], [["tap"], ["doc"]]);
});

test("edits made quickly are all saved, in order, and shown before they are saved", async () => {
  const { fetchImpl } = fakeGitHub();
  const store = make(fetchImpl);
  await store.load();
  store.apply(ops.tick("any", "2026-11-19", "tap", true));
  const last = store.apply(ops.tick("any", "2026-11-19", "doc", true));
  assert.deepEqual(store.view().people.any.days["2026-11-19"].ticks, ["tap", "doc"]);
  await last;
  const check = make(fetchImpl);
  await check.load();
  assert.deepEqual(check.view().people.any.days["2026-11-19"].ticks, ["tap", "doc"]);
});

test("an edit made from the 'saved' callback (a reward) is saved too", async () => {
  const { fetchImpl } = fakeGitHub();
  const store = make(fetchImpl);
  await store.load();
  let rewarded = false;
  store.onStatus = (status) => {
    if (status === "saved" && !rewarded) {
      rewarded = true;
      store.apply(ops.reward(7, "2026-11-19"));
    }
  };
  await store.apply(ops.tick("any", "2026-11-19", "tap", true));
  while (store.saving) await store.saving;
  const check = make(fetchImpl);
  await check.load();
  assert.equal(check.view().rewards[7], "2026-11-19");
});

test("a bad token is reported", async () => {
  const store = make(async () => ({ ok: false, status: 401 }));
  await assert.rejects(() => store.load(), /Mã truy cập sai/);
});
