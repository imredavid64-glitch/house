// Integration tests for the House Supabase backend.
// Run: node --test tests/supabase.test.mjs
// Requires nothing for public tests; set SUPABASE_SERVICE_KEY to run the full
// suite (register->login, RLS writes, triggers, votes, and cleanup).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const URL =
  process.env.SUPABASE_URL || "https://mvacjabgynoabpsekejl.supabase.co";
const ANON =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12YWNqYWJneW5vYWJwc2VrZWpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NDY2MTAsImV4cCI6MjEwNzIyMjYxMH0.E4e9uSEYQEnFCLjuk8X3tUsswQnbMu3-DpwjfwsZ2mI";
const SERVICE = process.env.SUPABASE_SERVICE_KEY || "";
const FN = `${URL}/functions/v1/house`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "imredavid64@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "HouseAdmin1234!";
const CRON_SECRET = process.env.CRON_SECRET || "";

const hasService = SERVICE.length > 0;

async function signIn(email, password) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`login ${email} failed: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function fn(path, token, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(FN + path, { ...opts, headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}

async function rest(table, token, opts = {}) {
  const res = await fetch(`${URL}/rest/v1/${table}`, {
    ...opts,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}

function svc(method, path, body) {
  return fetch(`${URL}${path}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const state = {
  adminToken: "",
  adminId: "",
  userToken: "",
  userId: "",
  inviteKeyId: "",
  inviteKey: "",
  msgId: "",
  postId: "",
};

before(async () => {
  state.adminToken = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  const me = await rest("profiles", state.adminToken, {
    method: "GET",
    headers: { Prefer: "" },
  });
  const row = (me.json || []).find((p) => p.email === ADMIN_EMAIL);
  state.adminId = row?.id || "";
});

// ---------------------------------------------------------------------------
// public / guard tests (no service key needed)
// ---------------------------------------------------------------------------
test("register validates required fields", async () => {
  const r = await fn("/api/house/register", null, { method: "POST", body: "{}" });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /required/i);
});

test("auth is required on protected routes", async () => {
  for (const p of ["/api/house/invites", "/api/house/settings", "/api/house/storage", "/api/house/news?category=tech"]) {
    const r = await fn(p, null, { method: "GET" });
    assert.equal(r.status, 401, `${p} should be 401`);
  }
});

test("cron route rejects a wrong secret", async () => {
  const r = await fn("/api/house/cron/news", null, {
    method: "POST",
    headers: { "x-cron-secret": "definitely-wrong" },
    body: "{}",
  });
  assert.equal(r.status, 403);
});

test("cron route accepts the correct secret", { skip: !CRON_SECRET }, async () => {
  const r = await fn("/api/house/cron/storage", null, {
    method: "POST",
    headers: { "x-cron-secret": CRON_SECRET },
    body: "{}",
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
});

// ---------------------------------------------------------------------------
// admin surface
// ---------------------------------------------------------------------------
test("admin can read settings", async () => {
  const r = await fn("/api/house/settings", state.adminToken, { method: "GET" });
  assert.equal(r.status, 200);
  assert.ok("storage_limit_bytes" in r.json);
});

test("admin can read storage overview", async () => {
  const r = await fn("/api/house/storage", state.adminToken, { method: "GET" });
  assert.equal(r.status, 200);
  assert.equal(typeof r.json.limit_bytes, "number");
  assert.equal(typeof r.json.used_bytes, "number");
});

test("admin can list invites", async () => {
  const r = await fn("/api/house/invites", state.adminToken, { method: "GET" });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json));
});

test("news returns an items array", async () => {
  const r = await fn("/api/house/news?category=tech", state.adminToken, { method: "GET" });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.items));
});

test("gaming endpoints respond", async () => {
  const mc = await fn("/api/house/minecraft/status", state.adminToken, { method: "GET" });
  assert.equal(mc.status, 200);
  const rb = await fn("/api/house/roblox", state.adminToken, { method: "GET" });
  assert.equal(rb.status, 200);
  assert.ok(Array.isArray(rb.json.online));
  const sm = await fn("/api/house/smash", state.adminToken, { method: "GET" });
  assert.equal(sm.status, 200);
  assert.ok(Array.isArray(sm.json.rankings));
});

// ---------------------------------------------------------------------------
// full flow (requires service key for invite creation + cleanup)
// ---------------------------------------------------------------------------
test("invite -> register -> login -> non-admin blocked", { skip: !hasService }, async () => {
  const gen = await fn("/api/house/invites", state.adminToken, {
    method: "POST",
    body: JSON.stringify({ count: 1 }),
  });
  assert.equal(gen.status, 200);
  state.inviteKey = gen.json.keys[0];
  assert.match(state.inviteKey, /^HOUSE-/);

  const uname = "e2e_" + Date.now().toString(36);
  const email = `${uname}@example.com`;
  const reg = await fn("/api/house/register", null, {
    method: "POST",
    body: JSON.stringify({ key: state.inviteKey, username: uname, email, password: "testpass123" }),
  });
  assert.equal(reg.status, 200, reg.text);
  state.userId = reg.json.record.id;

  state.userToken = await signIn(email, "testpass123");
  assert.ok(state.userToken.length > 20);

  const blocked = await fn("/api/house/invites", state.userToken, { method: "GET" });
  assert.equal(blocked.status, 403);
});

test("RLS: user reads channels and inserts a message", { skip: !hasService }, async () => {
  const ch = await rest("channels?select=id,name&order=name", state.userToken, {
    method: "GET",
    headers: { Prefer: "" },
  });
  assert.equal(ch.status, 200);
  assert.ok(ch.json.length >= 9);
  const general = ch.json.find((c) => c.name === "general") || ch.json[0];

  const ins = await rest("messages", state.userToken, {
    method: "POST",
    body: JSON.stringify({
      channel: general.id,
      user: state.userId,
      content: "e2e hello",
      mentions: [state.adminId],
    }),
  });
  assert.equal(ins.status, 201, ins.text);
  state.msgId = ins.json[0].id;
  assert.ok(state.msgId);
});

test("mention trigger notifies the admin", { skip: !hasService }, async () => {
  const n = await rest(
    `notifications?select=type,title,user&user=eq.${state.adminId}&order=created.desc&limit=5`,
    state.adminToken,
    { method: "GET", headers: { Prefer: "" } },
  );
  assert.equal(n.status, 200);
  assert.ok(n.json.some((x) => x.type === "mention" && x.user === state.adminId));
});

test("comment trigger increments comment_count", { skip: !hasService }, async () => {
  const ch = await rest("spaces?select=id&limit=1", state.adminToken, {
    method: "GET",
    headers: { Prefer: "" },
  });
  const space = ch.json[0].id;
  const post = await rest("posts", state.adminToken, {
    method: "POST",
    body: JSON.stringify({ space, user: state.adminId, title: "e2e post", type: "text", content: "x" }),
  });
  assert.equal(post.status, 201, post.text);
  state.postId = post.json[0].id;

  const c = await rest("comments", state.adminToken, {
    method: "POST",
    body: JSON.stringify({ post: state.postId, user: state.adminId, content: "e2e comment" }),
  });
  assert.equal(c.status, 201, c.text);

  const after = await rest(`posts?select=comment_count&id=eq.${state.postId}`, state.adminToken, {
    method: "GET",
    headers: { Prefer: "" },
  });
  assert.equal(after.json[0].comment_count, 1);
});

test("voting updates counts and toggles", { skip: !hasService }, async () => {
  const up = await fn(`/api/house/posts/${state.postId}/vote`, state.adminToken, {
    method: "POST",
    body: JSON.stringify({ value: 1 }),
  });
  assert.equal(up.status, 200);
  assert.equal(up.json.upvotes, 1);

  const clear = await fn(`/api/house/posts/${state.postId}/vote`, state.adminToken, {
    method: "POST",
    body: JSON.stringify({ value: 0 }),
  });
  assert.equal(clear.json.upvotes, 0);
});

test("poll create + vote", { skip: !hasService }, async () => {
  const create = await fn(`/api/house/posts/${state.postId}/poll`, state.adminToken, {
    method: "POST",
    body: JSON.stringify({ options: ["A", "B"] }),
  });
  assert.equal(create.status, 200);
  assert.equal(create.json.created, true);

  const vote = await fn(`/api/house/posts/${state.postId}/poll`, state.adminToken, {
    method: "POST",
    body: JSON.stringify({ option_index: 1 }),
  });
  assert.equal(vote.status, 200);
  assert.equal(vote.json.poll.chosen, 1);
  assert.equal(vote.json.poll.total, 1);
});

test("message reaction toggles", { skip: !hasService }, async () => {
  const add = await fn(`/api/house/messages/${state.msgId}/reaction`, state.adminToken, {
    method: "POST",
    body: JSON.stringify({ emoji: "ok" }),
  });
  assert.equal(add.status, 200);
  assert.ok(Array.isArray(add.json.reactions["ok"]));

  const remove = await fn(`/api/house/messages/${state.msgId}/reaction`, state.adminToken, {
    method: "POST",
    body: JSON.stringify({ emoji: "ok" }),
  });
  assert.equal(remove.json.reactions["ok"], undefined);
});

test("smash match recorded + ranked", { skip: !hasService }, async () => {
  const m = await fn("/api/house/smash/matches", state.adminToken, {
    method: "POST",
    body: JSON.stringify({
      player1: state.adminId,
      player2: state.userId,
      winner: state.adminId,
      is_ranked: true,
    }),
  });
  assert.equal(m.status, 200);
  assert.ok(m.json.id);
  state.matchId = m.json.id;

  const r = await fn("/api/house/smash", state.adminToken, { method: "GET" });
  assert.ok(r.json.rankings.some((x) => x.user_id === state.adminId));
});

// ---------------------------------------------------------------------------
// cleanup
// ---------------------------------------------------------------------------
after(async () => {
  if (!hasService) return;
  try {
    if (state.msgId) await svc("DELETE", `/rest/v1/messages?id=eq.${state.msgId}`);
    if (state.matchId) await svc("DELETE", `/rest/v1/smash_matches?id=eq.${state.matchId}`);
    if (state.postId) await svc("DELETE", `/rest/v1/posts?id=eq.${state.postId}`);
    if (state.adminId) {
      await svc("DELETE", `/rest/v1/notifications?user=eq.${state.adminId}&type=eq.mention`);
    }
    if (state.inviteKey) {
      const r = await svc("GET", `/rest/v1/invite_keys?key_code=eq.${encodeURIComponent(state.inviteKey)}&select=id`);
      const rows = await r.json();
      if (rows[0]?.id) await svc("DELETE", `/rest/v1/invite_keys?id=eq.${rows[0].id}`);
    }
    if (state.userId) await svc("DELETE", `/auth/v1/admin/users/${state.userId}`);
  } catch (e) {
    console.error("cleanup error:", e.message);
  }
});
