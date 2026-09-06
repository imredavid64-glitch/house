// House - route + hook registrations. All logic lives in house_lib.js.
// Note: each handler scope is isolated, so we require() the lib inside handlers.

// ---------------------------------------------------------------------------
// Custom API routes
// ---------------------------------------------------------------------------

// uid retriever helper: write one middleware for admin-only routes
function adminOnly(e) {
  const H = require(__hooks + "/house_lib.js");
  if (!H.isAdminRequest(e)) {
    throw new ForbiddenError("Admin only");
  }
  return e.next();
}

// ---- invite keys (admin) ----
routerAdd("GET", "/api/house/invites", function (e) {
  const H = require(__hooks + "/house_lib.js");
  if (!H.isAdminRequest(e)) throw new ForbiddenError("Admin only");
  const records = e.app.findRecordsByFilter("invite_keys", "", "-created", 500, 0);
  const out = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    out.push({
      id: r.id,
      key_code: r.get("key_code"),
      is_used: r.getBool("is_used"),
      used_by: r.get("used_by"),
      used_at: r.get("used_at"),
      expires_at: r.get("expires_at"),
      created_at: r.get("created"),
    });
  }
  return e.json(200, out);
}, new Middleware(adminOnly));

routerAdd("POST", "/api/house/invites", function (e) {
  const H = require(__hooks + "/house_lib.js");
  const body = e.requestInfo().body;
  const count = body ? Math.floor(Number(body.count)) || 1 : 1;
  if (count < 1 || count > 100) throw new BadRequestError("count must be between 1 and 100");
  const codes = H.generateInviteKeys(e.app, count, e.auth ? e.auth.id : "");
  return e.json(200, { keys: codes });
}, new Middleware(adminOnly));

// ---- registration with invite key (guest only) ----
routerAdd("POST", "/api/house/register", function (e) {
  const H = require(__hooks + "/house_lib.js");
  const user = H.registerWithKey(e.app, e.requestInfo().body);
  return $apis.recordAuthResponse(e, user, "email");
}, $apis.requireGuestOnly());

// ---- storage overview (auth) ----
routerAdd("GET", "/api/house/storage", function (e) {
  const H = require(__hooks + "/house_lib.js");
  const state = H.cachedStorage(e.app);
  const limit = H.storageLimit(e.app);
  const used = state.bytes || 0;
  const largest = e.app.findRecordsByFilter("storage_files", "", "-stored_size", 15, 0);
  const biggest = [];
  for (let i = 0; i < largest.length; i++) {
    biggest.push({
      id: largest[i].id,
      original_name: largest[i].get("original_name"),
      original_size: largest[i].get("original_size"),
      stored_size: largest[i].get("stored_size"),
      algorithm: largest[i].get("algorithm"),
      source: largest[i].get("source"),
      owner: largest[i].get("owner"),
      record_id: largest[i].get("record_id"),
      mime_type: largest[i].get("mime_type"),
      created_at: largest[i].get("created"),
    });
  }
  return e.json(200, {
    limit_bytes: limit,
    used_bytes: used,
    free_bytes: Math.max(0, limit - used),
    percent: Math.round((used / limit) * 10000) / 100,
    breakdown: state.breakdown || {},
    readonly: used >= limit,
    files_count: state.files || 0,
    largest: biggest,
    updated_at: state.updated_at,
  });
}, $apis.requireAuth());

// ---- news (auth) ----
routerAdd("GET", "/api/house/news", function (e) {
  const H = require(__hooks + "/house_lib.js");
  const category = e.request.url.query().get("category") || "tech";
  const allowed = ["gaming", "anime", "tech", "minecraft", "roblox", "smash"];
  if (allowed.indexOf(category) < 0) throw new BadRequestError("Invalid category");
  const items = e.app.findRecordsByFilter("news_items", "category = {:c}", "-created", 60, 0, { c: category });
  const out = [];
  for (let i = 0; i < items.length; i++) {
    out.push({
      id: items[i].id,
      category: items[i].get("category"),
      title: items[i].get("title"),
      summary: items[i].get("summary"),
      url: items[i].get("url"),
      thumbnail_url: items[i].get("thumbnail_url"),
      source_name: items[i].get("source_name"),
      metadata: items[i].get("metadata"),
      published_at: items[i].get("published_at"),
    });
  }
  // if stale, refresh async (fire and forget via refresh in background below)
  const lastFetch = H.setting(e.app, "news_fetched_at", null);
  if (category === "roblox") {
    return e.json(200, { category: category, items: out, games: H.robloxGames(e.app) });
  }
  return e.json(200, { category: category, items: out, lastFetch: lastFetch });
}, $apis.requireAuth());

// ---- news refresh (auth; refreshes if stale) ----
routerAdd("POST", "/api/house/news/refresh", function (e) {
  const H = require(__hooks + "/house_lib.js");
  const force = (e.requestInfo().query && e.requestInfo().query.force) === "1";
  const last = H.setting(e.app, "news_fetched_at", null);
  const ttlMin = Number(H.setting(e.app, "news_ttl_minutes", 30)) || 30;
  const stale = !last || (Date.now() - new Date(last).getTime()) > ttlMin * 60000;
  if (!stale && !force) {
    return e.json(200, { refreshed: false, message: "News is fresh. Try again later or use the Force button." });
  }
  H.refreshAllNews(e.app);
  H.setSetting(e.app, "news_fetched_at", new Date().toISOString());
  return e.json(200, { refreshed: true });
}, $apis.requireAuth());

// ---- minecraft status (auth) ----
routerAdd("GET", "/api/house/minecraft/status", function (e) {
  const H = require(__hooks + "/house_lib.js");
  return e.json(200, H.mcStatus(e.app));
}, $apis.requireAuth());

// ---- roblox games + friend presence (auth) ----
routerAdd("GET", "/api/house/roblox", function (e) {
  const H = require(__hooks + "/house_lib.js");
  const games = H.robloxGames(e.app);
  // friends with roblox ids set
  const users = e.app.findRecordsByFilter("users", "roblox_id > 0", "username", 500, 0);
  const ids = [];
  const nameMap = {};
  for (let i = 0; i < users.length; i++) {
    const rid = Number(users[i].get("roblox_id"));
    if (rid <= 0) continue;
    ids.push(rid);
    nameMap[String(rid)] = users[i].get("username") || "Unknown";
  }
  const presence = H.robloxPresence(e.app, ids);
  const online = presence.online.map(function (p) {
    return {
      username: nameMap[String(p.userId)],
      lastLocation: p.lastLocation || "",
      gameId: p.gameId || 0,
      placeId: p.placeId || 0,
      lastOnline: p.lastOnline || "",
    };
  });
  return e.json(200, { games: games, online: online });
}, $apis.requireAuth());

// ---- smash rankings (auth) ----
routerAdd("GET", "/api/house/smash", function (e) {
  const H = require(__hooks + "/house_lib.js");
  return e.json(200, { rankings: H.smashRankings(e.app) });
}, $apis.requireAuth());

// ---- log a smash match (auth) ----
routerAdd("POST", "/api/house/smash/matches", function (e) {
  const H = require(__hooks + "/house_lib.js");
  const body = e.requestInfo().body;
  const player1 = body ? body.player1 : null;
  const player2 = body ? body.player2 : null;
  const winner = body ? body.winner : null;
  if (!player1 || !player2 || !winner) throw new BadRequestError("player1, player2 and winner are required");
  if (player1 === player2) throw new BadRequestError("A match needs two different players");
  if (winner !== player1 && winner !== player2) throw new BadRequestError("winner must be player1 or player2");
  const rec = new Record(e.app.findCollectionByNameOrId("smash_matches"));
  rec.set("player1", player1);
  rec.set("player2", player2);
  rec.set("winner", winner);
  rec.set("character1", body.character1 || "");
  rec.set("character2", body.character2 || "");
  rec.set("stage", body.stage || "");
  rec.set("is_ranked", body.is_ranked === true);
  rec.set("created_by", e.auth.id);
  e.app.save(rec);
  return e.json(200, { success: true, id: rec.id });
}, $apis.requireAuth());

// ---- deletion proposals (auth) ----
routerAdd("GET", "/api/house/deletion/proposals", function (e) {
  const H = require(__hooks + "/house_lib.js");
  const records = e.app.findRecordsByFilter("deletion_proposals", "", "-created", 200, 0);
  const out = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    out.push({
      id: r.id,
      title: r.get("title"),
      description: r.get("description"),
      proposed_by: r.get("proposed_by"),
      type: r.get("type"),
      criteria: r.get("criteria"),
      estimated_freed_space: r.get("estimated_freed_space"),
      status: r.get("status"),
      votes_yes: r.get("votes_yes"),
      votes_no: r.get("votes_no"),
      voting_ends_at: r.get("voting_ends_at"),
      executed_at: r.get("executed_at"),
      freed_space: r.get("freed_space"),
      created_at: r.get("created"),
    });
  }
  return e.json(200, { proposals: out });
}, $apis.requireAuth());

routerAdd("POST", "/api/house/deletion/proposals", function (e) {
  const H = require(__hooks + "/house_lib.js");
  const prop = H.createProposal(e.app, e.auth, e.requestInfo().body);
  return e.json(200, { success: true, id: prop.id });
}, $apis.requireAuth());

routerAdd("POST", "/api/house/deletion/proposals/{id}/vote", function (e) {
  const H = require(__hooks + "/house_lib.js");
  const id = e.request.pathValue("id");
  const body = e.requestInfo().body;
  const value = body ? Number(body.choice) : 0;
  let result;
  try {
    result = H.voteOnProposal(e.app, e.auth, id, value);
  } catch (err) {
    throw new BadRequestError(String(err));
  }
  return e.json(200, { success: true, votes: result });
}, $apis.requireAuth());

routerAdd("POST", "/api/house/deletion/proposals/{id}/execute", function (e) {
  const H = require(__hooks + "/house_lib.js");
  const id = e.request.pathValue("id");
  let prop;
  try {
    prop = e.app.findRecordById("deletion_proposals", id);
  } catch (err) {
    throw new NotFoundError("Proposal not found");
  }
  if (prop.get("status") !== "approved") throw new BadRequestError("Only approved proposals can be executed");
  const freed = H.executeProposal(e.app, prop, e.auth.id);
  return e.json(200, { success: true, freed: freed });
}, new Middleware(adminOnly));

// ---- settings (admin) ----
routerAdd("GET", "/api/house/settings", function (e) {
  const H = require(__hooks + "/house_lib.js");
  const keys = ["storage_limit_bytes", "vote_window_hours", "vote_approval_pct", "vote_min_voters",
    "auto_propose_at_bytes", "news_ttl_minutes", "mc_server_host", "roblox_watchlist"];
  const out = {};
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = H.setting(e.app, keys[i], null);
  }
  return e.json(200, out);
}, new Middleware(adminOnly));

routerAdd("POST", "/api/house/settings", function (e) {
  const H = require(__hooks + "/house_lib.js");
  const body = e.requestInfo().body;
  const keys = ["storage_limit_bytes", "vote_window_hours", "vote_approval_pct", "vote_min_voters",
    "auto_propose_at_bytes", "news_ttl_minutes", "mc_server_host", "roblox_watchlist"];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = body ? body[k] : undefined;
    if (v !== undefined && v !== null && v !== "") {
      H.setSetting(e.app, k, v);
    }
  }
  return e.json(200, { success: true });
}, new Middleware(adminOnly));

// ---------------------------------------------------------------------------
// Storage quota enforcement hooks (before record save, using actual upload sizes)
// ---------------------------------------------------------------------------

function quotaHook(e) {
  const H = require(__hooks + "/house_lib.js");
  H.checkQuotaBeforeSave(e.app, e.record, e);
  return e.next();
}

onRecordCreateRequest(quotaHook, "messages");
onRecordCreateRequest(quotaHook, "posts");
onRecordUpdateRequest(quotaHook, "messages");
onRecordUpdateRequest(quotaHook, "posts");
onRecordUpdateRequest(quotaHook, "users");

// after successful saves, refresh the cached storage usage
function refreshAfterSave(e) {
  const H = require(__hooks + "/house_lib.js");
  H.refreshStorageCache(e.app);
  return e.next();
}

onRecordAfterCreateSuccess(refreshAfterSave, "messages", "posts", "users");
onRecordAfterUpdateSuccess(refreshAfterSave, "messages", "posts", "users");
onRecordAfterDeleteSuccess(refreshAfterSave, "messages", "posts", "users");

// notify mentioned users in chat messages
onRecordAfterCreateSuccess(function (e) {
  const H = require(__hooks + "/house_lib.js");
  const mentions = e.record.get("mentions") || [];
  if (!mentions.length) return e.next();
  for (let i = 0; i < mentions.length; i++) {
    if (mentions[i] === e.record.get("user")) continue;
    H.notify(e.app, mentions[i], "mention", "You were mentioned",
      "You were mentioned in #" + (e.record.get("channel") || "chat") + ".", "/#/chat/" + e.record.get("channel"));
  }
  return e.next();
}, "messages");

// ---------------------------------------------------------------------------
// Background jobs
// ---------------------------------------------------------------------------

onBootstrap(function (e) {
  e.next();
  const H = require(__hooks + "/house_lib.js");

  // refresh news feeds every 20 minutes
  cronAdd("house-news", "*/20 * * * *", function () {
    try {
      H.refreshAllNews($app);
      H.setSetting($app, "news_fetched_at", new Date().toISOString());
    } catch (err) {
      $app.logger().error("cron news failed: " + String(err));
    }
  });

  // manage deletion proposal lifecycle every 15 minutes
  cronAdd("house-deletions", "*/15 * * * *", function () {
    try {
      H.processExpiredProposals($app);
    } catch (err) {
      $app.logger().error("cron deletions failed: " + String(err));
    }
  });

  // storage watchdog every 6 hours -> recompute + auto-propose cleanup
  cronAdd("house-storage", "0 */6 * * *", function () {
    try {
      H.refreshStorageCache($app);
      H.autoPropose($app);
    } catch (err) {
      $app.logger().error("cron storage failed: " + String(err));
    }
  });
});