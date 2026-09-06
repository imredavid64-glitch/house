// House shared server logic. This module is required() by house.pb.js.
// Avoid module-level mutable state (shared registry across pooled VMs).

// ---------------------------------------------------------------------------
// generic helpers
// ---------------------------------------------------------------------------

function nowISO() {
  return new Date().toISOString();
}

function daysAgoISO(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function safeJson(v, fallback) {
  if (v === null || v === undefined) return fallback || {};
  try {
    if (typeof v === "object") return v;
    return JSON.parse(v);
  } catch (e) {
    return fallback || {};
  }
}

function setting(app, key, fallback) {
  try {
    const rec = app.findFirstRecordByFilter("app_settings", "key = {:key}", { key: key });
    const v = rec.get("value");
    if (v === null || v === undefined || v === "") return fallback;
    return v;
  } catch (e) {
    return fallback;
  }
}

function setSetting(app, key, value) {
  let rec;
  try {
    rec = app.findFirstRecordByFilter("app_settings", "key = {:key}", { key: key });
  } catch (e) {
    rec = new Record(app.findCollectionByNameOrId("app_settings"));
    rec.set("key", key);
  }
  rec.set("value", value);
  app.save(rec);
}

function notify(app, userId, type, title, body, link) {
  try {
    const rec = new Record(app.findCollectionByNameOrId("notifications"));
    rec.set("user", userId);
    rec.set("type", type || "generic");
    rec.set("title", title || "");
    rec.set("body", body || "");
    rec.set("link", link || "");
    rec.set("is_read", false);
    app.save(rec);
  } catch (e) {
    app.logger().error("notify failed", "error", e);
  }
}

function isAdminRequest(e) {
  return e.hasSuperuserAuth() || (e.auth && e.auth.get("role") === "admin");
}

function newAdminMiddleware() {
  return new Middleware(function (e) {
    if (!isAdminRequest(e)) {
      throw new ForbiddenError("Admin only");
    }
    return e.next();
  });
}

// ---------------------------------------------------------------------------
// storage accounting (enforced against the 10GB budget)
// ---------------------------------------------------------------------------

const COLLECTION_CATEGORY = {
  messages: "chat",
  posts: "post",
  users: "avatar",
};

function collectionCategory(app, collectionId) {
  if (COLLECTION_CATEGORY[collectionId]) return COLLECTION_CATEGORY[collectionId];
  try {
    const c = app.findCollectionByNameOrId(collectionId);
    return COLLECTION_CATEGORY[c.name] || "other";
  } catch (e) {
    return "other";
  }
}

function scanStorage(app) {
  const fsys = app.newFilesystem();
  try {
    const items = fsys.list("");
    let total = 0;
    const breakdown = { chat: 0, post: 0, avatar: 0, other: 0 };
    for (let i = 0; i < items.length; i++) {
      const f = items[i];
      total += f.size;
      const parts = String(f.name).split("/");
      const cid = parts[0] || "";
      const cat = collectionCategory(app, cid);
      breakdown[cat] = (breakdown[cat] || 0) + f.size;
    }
    return { bytes: total, breakdown: breakdown, files: items.length, updated_at: nowISO() };
  } finally {
    fsys.close();
  }
}

function cachedStorage(app) {
  let cache = setting(app, "storage_used_bytes", null);
  if (cache && typeof cache === "object" && cache.bytes !== undefined) {
    return cache;
  }
  const fresh = scanStorage(app);
  setSetting(app, "storage_used_bytes", fresh);
  return fresh;
}

function storageLimit(app) {
  return Number(setting(app, "storage_limit_bytes", 10737418240)) || 10737418240;
}

function refreshStorageCache(app) {
  try {
    const fresh = scanStorage(app);
    setSetting(app, "storage_used_bytes", fresh);
    return fresh;
  } catch (e) {
    return cachedStorage(app);
  }
}

function pendingUploadSize(app, record, e) {
  // Sum the sizes of files currently being uploaded for this request.
  let total = 0;
  try {
    const fields = record.collection().fields;
    const list = fields.items ? fields.items() : fields.fields();
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (f.type !== "file") continue;
      let files = [];
      try {
        files = e.findUploadedFiles(f.name) || [];
      } catch (err) {
        files = [];
      }
      for (let j = 0; j < files.length; j++) {
        total += files[j].size;
      }
    }
  } catch (err) {
    // best-effort; if we can't count, do not block
  }
  return total;
}

function enforceStorageQuotaMiddleware() {
  return new Middleware(function (e) {
    const res = e.next();
    if (res && res.then) {
      return res.then(function (result) {
        return result;
      });
    }
    return res;
  });
}

// quota check before creating/updating records with files
function checkQuotaBeforeSave(app, record, e) {
  let hasFileField = false;
  try {
    const fields = record.collection().fields;
    const list = fields.items ? fields.items() : [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].type === "file") {
        hasFileField = true;
        break;
      }
    }
  } catch (err) {
    hasFileField = false;
  }
  if (!hasFileField) return;

  const pending = pendingUploadSize(app, record, e);
  if (pending <= 0) return;

  const state = (typeof cachedStorage === "function") ? cachedStorage(app) : { bytes: 0 };
  const used = state.bytes || 0;
  const limit = storageLimit(app);
  if (used + pending > limit) {
    const usedGb = (used / 1073741824).toFixed(2);
    const mb = Math.round(pending / 1048576);
    throw new BadRequestError(
      "Storage limit reached (" + usedGb + " GB / 10 GB). This upload (" + mb + " MB) was blocked. Free space from the Storage page first.",
      { storage: { used_bytes: used, limit_bytes: limit, blocked_bytes: pending } }
    );
  }
}

// ---------------------------------------------------------------------------
// invite-key registration
// ---------------------------------------------------------------------------

function generateInviteKeys(app, count, adminId) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const rec = new Record(app.findCollectionByNameOrId("invite_keys"));
    const code = "HOUSE-" + $security.randomString(4, false, true, true) + "-" + $security.randomString(4, false, true, true) + "-" + $security.randomString(4, false, true, true);
    rec.set("key_code", code);
    rec.set("created_by", adminId);
    rec.set("is_used", false);
    app.save(rec);
    out.push(code);
  }
  return out;
}

function registerWithKey(app, body) {
  const key = body.get ? body.get("key") : body.key;
  const username = body.get ? body.get("username") : body.username;
  const email = body.get ? body.get("email") : body.email;
  const password = body.get ? body.get("password") : body.password;

  if (!key || !username || !email || !password) {
    throw new BadRequestError("key, username, email and password are required");
  }
  if (String(username).length < 2) {
    throw new BadRequestError("Username must be at least 2 characters");
  }
  if (String(password).length < 6) {
    throw new BadRequestError("Password must be at least 6 characters");
  }

  let keyRec;
  try {
    keyRec = app.findFirstRecordByData("invite_keys", "key_code", String(key).trim());
  } catch (err) {
    throw new BadRequestError("Invalid invite key");
  }

  if (keyRec.getBool("is_used")) {
    throw new BadRequestError("This invite key has already been used");
  }
  const expires = keyRec.getDateTime("expires_at");
  if (expires && !expires.isZero() && expires.unix() * 1000 < Date.now()) {
    throw new BadRequestError("This invite key has expired");
  }

  // check uniqueness of username / email
  const dupUser = app.findRecordsByFilter("users", "username = {:u}", "-created", 1, 0, { u: username });
  if (dupUser.length > 0) throw new BadRequestError("Username is already taken");
  const dupEmail = app.findRecordsByFilter("users", "email = {:e}", "-created", 1, 0, { e: email });
  if (dupEmail.length > 0) throw new BadRequestError("Email is already registered");

  const user = new Record(app.findCollectionByNameOrId("users"));
  user.set("email", email);
  user.set("username", username);
  user.set("password", password);
  user.set("role", "member");
  user.set("karma", 0);
  user.set("last_active", nowISO());
  app.save(user);

  keyRec.set("used_by", user.id);
  keyRec.set("used_at", nowISO());
  keyRec.set("is_used", true);
  app.save(keyRec);

  notify(app, user.id, "welcome", "Welcome to House!!",
    "You're in. Grab a seat in #general, check the gaming feed for what to play, and settle the Smash debate once and for all.", "/#/chat/general");

  return user;
}

// ---------------------------------------------------------------------------
// news aggregation
// ---------------------------------------------------------------------------

function upsertNews(app, category, item) {
  try {
    // dedupe by url
    const existing = app.findFirstRecordByFilter(
      "news_items",
      "category = {:category} && url = {:url}",
      { category: category, url: item.url }
    );
    existing.set("title", item.title);
    if (item.summary) existing.set("summary", item.summary);
    if (item.thumbnail_url) existing.set("thumbnail_url", item.thumbnail_url);
    existing.set("source_name", item.source_name || category);
    if (item.metadata) existing.set("metadata", item.metadata);
    if (item.published_at) existing.set("published_at", item.published_at);
    existing.set("fetched_at", nowISO());
    existing.set("expires_at", daysAgoISO(14));
    app.save(existing);
    return;
  } catch (err) {
    // not found -> create
  }
  const rec = new Record(app.findCollectionByNameOrId("news_items"));
  rec.set("category", category);
  rec.set("title", item.title);
  rec.set("summary", item.summary || "");
  rec.set("url", item.url || "");
  rec.set("thumbnail_url", item.thumbnail_url || "");
  rec.set("source_name", item.source_name || category);
  rec.set("metadata", item.metadata || {});
  rec.set("published_at", item.published_at || nowISO());
  rec.set("fetched_at", nowISO());
  rec.set("expires_at", daysAgoISO(14));
  app.save(rec);
}

function capCategory(app, category, max) {
  try {
    const records = app.findRecordsByFilter("news_items", "category = {:category}", "-created", 500, 0, { category: category });
    if (records.length > max) {
      for (let i = max; i < records.length; i++) {
        app.delete(records[i]);
      }
    }
  } catch (e) {}
}

function fetchHackerNews(app) {
  try {
    const res = $http.send({ url: "https://hacker-news.firebaseio.com/v0/topstories.json?print=pretty", timeout: 20 });
    if (res.statusCode !== 200) return;
    const ids = res.json || [];
    let count = 0;
    for (let i = 0; i < Math.min(ids.length, 15) && count < 8; i++) {
      let item;
      try {
        const r2 = $http.send({ url: "https://hacker-news.firebaseio.com/v0/item/" + ids[i] + ".json?print=pretty", timeout: 20 });
        if (r2.statusCode === 200) item = r2.json;
      } catch (e) {
        continue;
      }
      if (!item || !item.title) continue;
      upsertNews(app, "tech", {
        title: item.title,
        summary: (item.text || "").substring(0, 400),
        url: item.url || ("https://news.ycombinator.com/item?id=" + item.id),
        thumbnail_url: "",
        source_name: "Hacker News",
        published_at: new Date(item.time * 1000).toISOString(),
        metadata: { hn_id: item.id, score: item.score, by: item.by },
      });
      count++;
    }
  } catch (e) {
    app.logger().error("HN fetch failed", "error", e);
  }
}

function fetchReddit(app, subreddit, category, sourceName) {
  try {
    const res = $http.send({
      url: "https://www.reddit.com/r/" + subreddit + "/hot.json?limit=12&raw_json=1",
      headers: { "user-agent": "house-friend-app/1.0" },
      timeout: 20,
    });
    if (res.statusCode !== 200 || !res.json || !res.json.data) return;
    const children = res.json.data.children || [];
    let count = 0;
    for (let i = 0; i < children.length && count < 8; i++) {
      const d = children[i].data;
      if (!d || d.stickied || d.over_18 || !d.title) continue;
      let thumb = d.thumbnail;
      if (typeof thumb !== "string" || thumb.indexOf("http") !== 0) thumb = "";
      upsertNews(app, category, {
        title: d.title,
        summary: (d.selftext || "").substring(0, 400),
        url: "https://www.reddit.com" + (d.permalink || ""),
        thumbnail_url: thumb,
        source_name: sourceName,
        published_at: new Date(d.created_utc * 1000).toISOString(),
        metadata: { subreddit: subreddit, score: d.score, comments: d.num_comments },
      });
      count++;
    }
  } catch (e) {
    app.logger().error("Reddit fetch failed " + subreddit, "error", e);
  }
}

function fetchJikan(app) {
  try {
    const res = $http.send({ url: "https://api.jikan.moe/v4/top/anime?filter=airing&limit=10", timeout: 20 });
    if (res.statusCode !== 200 || !res.json || !res.json.data) return;
    const items = res.json.data || [];
    for (let i = 0; i < items.length && i < 8; i++) {
      const d = items[i];
      if (!d || !d.title) continue;
      let aired = "";
      if (d.aired && d.aired.from) aired = d.aired.from;
      upsertNews(app, "anime", {
        title: d.title,
        summary: (d.synopsis || "").substring(0, 400),
        url: d.url || "",
        thumbnail_url: (d.images && d.images.jpg && d.images.jpg.small_image_url) || "",
        source_name: "MyAnimeList",
        published_at: aired || nowISO(),
        metadata: { score: d.score, episodes: d.episodes, type: d.type },
      });
    }
  } catch (e) {
    app.logger().error("Jikan fetch failed", "error", e);
  }
}

function fetchMinecraft(app) {
  try {
    const res = $http.send({ url: "https://launchermeta.mojang.com/mc/game/version_manifest.json", timeout: 20 });
    if (res.statusCode !== 200 || !res.json || !res.json.versions) return;
    const versions = res.json.versions || [];
    const latest = versions[0];
    if (!latest) return;
    upsertNews(app, "minecraft", {
      title: "Minecraft " + latest.id + " version available",
      summary: "Latest Minecraft version checked by Mojang: " + latest.id + " (" + latest.type + ", released " + (latest.releaseTime || "").substring(0, 10) + ").",
      url: "https://www.minecraft.net/en-us/version-history",
      thumbnail_url: "",
      source_name: "Mojang",
      published_at: latest.releaseTime || nowISO(),
      metadata: { version: latest.id, type: latest.type },
    });
  } catch (e) {
    app.logger().error("Mojang fetch failed", "error", e);
  }
}

function refreshAllNews(app) {
  fetchHackerNews(app);
  fetchReddit(app, "games", "gaming", "r/games");
  fetchReddit(app, "smashbros", "smash", "r/smashbros");
  fetchJikan(app);
  fetchMinecraft(app);
  capCategory(app, "tech", 40);
  capCategory(app, "gaming", 40);
  capCategory(app, "smash", 40);
  capCategory(app, "anime", 40);
  capCategory(app, "minecraft", 40);
}

// ---------------------------------------------------------------------------
// minecraft / roblox / smash
// ---------------------------------------------------------------------------

function mcStatus(app) {
  const host = setting(app, "mc_server_host", "");
  if (!host) {
    return { configured: false, status: "unknown", message: "No Minecraft server configured. Admin can set 'mc_server_host' in settings." };
  }
  try {
    const res = $http.send({ url: "https://api.mcsrvstat.us/3/" + encodeURIComponent(host), timeout: 15 });
    let data = res.json || {};
    if (res.statusCode !== 200 || data.online === undefined) {
      return { configured: true, host: host, status: "unknown", message: "Could not reach status API." };
    }
    const out = {
      configured: true,
      host: host,
      status: data.online ? "online" : "offline",
      player_count: data.players ? data.players.online : 0,
      max_players: data.players ? data.players.max : 0,
      version: data.version,
      motd: (Array.isArray(data.motd) ? data.motd.join(" ").trim() : (data.motd || "").trim()),
      players: (data.players && data.players.list) ? data.players.list : [],
      last_checked_at: nowISO(),
    };
    // cache into mc_status (keep single row: upsert by id "main")
    try {
      const row = app.findFirstRecordByFilter("mc_status", "server_name = {:n}", { n: "main" });
      row.set("host", host);
      row.set("status", out.status);
      row.set("player_count", out.player_count);
      row.set("max_players", out.max_players);
      row.set("version", out.version);
      row.set("motd", out.motd);
      row.set("players", out.players);
      app.save(row);
    } catch (err) {
      const row = new Record(app.findCollectionByNameOrId("mc_status"));
      row.set("server_name", "main");
      row.set("host", host);
      row.set("status", out.status);
      row.set("player_count", out.player_count);
      row.set("max_players", out.max_players);
      row.set("version", out.version);
      row.set("motd", out.motd);
      row.set("players", out.players);
      app.save(row);
    }
    return out;
  } catch (e) {
    return { configured: true, host: host, status: "unknown", message: "Status check failed: " + e.message };
  }
}

function robloxGames(app) {
  const watch = setting(app, "roblox_watchlist", []);
  const ids = Array.isArray(watch) ? watch : [];
  if (!ids.length) {
    return { configured: false, games: [], message: "Admin can set 'roblox_watchlist' (array of universe ids) in settings." };
  }
  try {
    const res = $http.send({ url: "https://games.roblox.com/v1/games?universeIds=" + ids.join("%2C"), headers: { "accept": "application/json" }, timeout: 20 });
    let data = (res.statusCode === 200 && res.json) ? res.json : {};
    const games = (data.data || []).map(function (g) {
      return {
        universe_id: g.id,
        name: g.name,
        description: (g.description || "").substring(0, 300),
        playing_count: g.playing,
        creator: (g.creator && g.creator.name) || "",
        thumbnail_url: "",
      };
    });
    // thumbnails
    try {
      const t = $http.send({ url: "https://thumbnails.roblox.com/v1/games/icons?universeIds=" + ids.join("%2C") + "&size=512x512&format=Png&isCircular=false", headers: { "accept": "application/json" }, timeout: 20 });
      if (t.statusCode === 200 && t.json && t.json.data) {
        for (let i = 0; i < games.length; i++) {
          const tdata = t.json.data[i];
          if (tdata && tdata.imageUrl) games[i].thumbnail_url = tdata.imageUrl;
        }
      }
    } catch (e) {}
    // persist
    for (let i = 0; i < games.length; i++) {
      try {
        const row = app.findFirstRecordByFilter("roblox_games", "universe_id = {:id}", { id: games[i].universe_id });
        row.set("name", games[i].name);
        row.set("description", games[i].description);
        row.set("thumbnail_url", games[i].thumbnail_url);
        row.set("playing_count", games[i].playing_count);
        row.set("creator", games[i].creator);
        row.set("last_updated_at", nowISO());
        app.save(row);
      } catch (err) {
        const row = new Record(app.findCollectionByNameOrId("roblox_games"));
        row.set("universe_id", games[i].universe_id);
        row.set("name", games[i].name);
        row.set("description", games[i].description);
        row.set("thumbnail_url", games[i].thumbnail_url);
        row.set("playing_count", games[i].playing_count);
        row.set("creator", games[i].creator);
        row.set("last_updated_at", nowISO());
        app.save(row);
      }
    }
    return { configured: true, games: games };
  } catch (e) {
    return { configured: true, games: [], message: e.message };
  }
}

function robloxPresence(app, userIds) {
  if (!userIds.length) return { online: [] };
  try {
    const res = $http.send({
      url: "https://presence.roblox.com/v1/presence/users",
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify({ userIds: userIds }),
      timeout: 15,
    });
    const data = (res.statusCode === 200 && res.json) ? res.json.data || [] : [];
    return { online: data };
  } catch (e) {
    return { online: [] };
  }
}

function smashRankings(app) {
  // replay all ranked matches to compute Elo ratings
  const matches = app.findRecordsByFilter("smash_matches", "is_ranked = true", "created", 2000, 0);
  const ratings = {};
  const games = {};
  function getId(userId) { return userId; }
  function rating(player) {
    if (!ratings[player]) ratings[player] = 1200;
    return ratings[player];
  }
  function applyMatch(w, l) {
    const rw = rating(w);
    const rl = rating(l);
    const ew = 1 / (1 + Math.pow(10, (rl - rw) / 400));
    const el = 1 - ew;
    const K = 32;
    ratings[getId(w)] = rw + K * (1 - ew);
    ratings[getId(l)] = rl + K * (0 - el);
    games[getId(w)] = (games[getId(w)] || 0) + 1;
    games[getId(l)] = (games[getId(l)] || 0) + 1;
  }
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const p1 = m.get("player1");
    const p2 = m.get("player2");
    const w = m.get("winner");
    if (!w) continue;
    if (w === p1 && p2 !== p1) applyMatch(p1, p2);
    else if (w === p2 && p1 !== p2) applyMatch(p2, p1);
  }
  // load usernames
  const ids = Object.keys(ratings);
  const nameMap = {};
  if (ids.length) {
    const users = app.findRecordsByIds("users", ids);
    for (let i = 0; i < users.length; i++) {
      nameMap[users[i].id] = users[i].get("username") || "Unknown";
    }
  }
  const arr = [];
  for (const k in ratings) {
    arr.push({ user_id: k, username: nameMap[k] || "Unknown", rating: Math.round(ratings[k]), games: games[k] || 0 });
  }
  arr.sort(function (a, b) { return b.rating - a.rating; });
  for (let i = 0; i < arr.length; i++) arr[i].rank = i + 1;
  return arr;
}

// ---------------------------------------------------------------------------
// deletion proposals
// ---------------------------------------------------------------------------

function olderThan(rec, cutoffISO) {
  try {
    return rec.getDateTime("created").unix() * 1000 < new Date(cutoffISO).getTime();
  } catch (e) {
    return String(rec.get("created")) < String(cutoffISO);
  }
}

function estimateFreed(app, type, criteria) {
  const c = safeJson(criteria, {});
  const ageDays = Number(c.ageDays) || 90;
  let total = 0;
  if (type === "old_files" || type === "old_messages") {
    const source = c.source || "chat";
    const entries = app.findRecordsByFilter("storage_files", "source = {:s}", "-created", 500, 0, { s: source });
    const cutoff = daysAgoISO(ageDays);
    for (let i = 0; i < entries.length; i++) {
      if (olderThan(entries[i], cutoff)) total += Number(entries[i].get("stored_size")) || 0;
    }
  } else if (type === "specific_files" && Array.isArray(c.ids)) {
    for (let i = 0; i < c.ids.length; i++) {
      const entries = app.findRecordsByFilter("storage_files", "record_id = {:id}", "-created", 1000, 0, { id: String(c.ids[i]) });
      for (let j = 0; j < entries.length; j++) total += Number(entries[j].get("stored_size")) || 0;
    }
  } else if (type === "old_posts") {
    const cutoff = daysAgoISO(ageDays);
    const entries = app.findRecordsByFilter("storage_files", "source = 'post'", "-created", 1000, 0);
    for (let i = 0; i < entries.length; i++) {
      if (olderThan(entries[i], cutoff)) total += Number(entries[i].get("stored_size")) || 0;
    }
  } else if (type === "clear_cache") {
    // news items have no file storage, but clearing frees DB + thumbnails
    try { total = app.countRecords("news_items", ""); } catch (e) {}
  }
  return total;
}

function createProposal(app, user, body) {
  const type = body.get ? body.get("type") : body.type;
  const title = body.get ? body.get("title") : body.title;
  const description = body.get ? body.get("description") : body.description;
  const criteria = body.get ? body.get("criteria") : body.criteria;
  const allowed = ["old_files", "old_posts", "old_messages", "specific_files", "clear_cache"];
  if (allowed.indexOf(type) < 0) throw new BadRequestError("Invalid proposal type");
  if (!title) throw new BadRequestError("title is required");

  const windowHours = Number(setting(app, "vote_window_hours", 72)) || 72;
  const estimate = estimateFreed(app, type, criteria) || 0;

  const rec = new Record(app.findCollectionByNameOrId("deletion_proposals"));
  rec.set("title", title);
  rec.set("description", description || "");
  rec.set("proposed_by", user.id);
  rec.set("type", type);
  rec.set("criteria", criteria || {});
  rec.set("estimated_freed_space", estimate);
  rec.set("status", "voting");
  rec.set("votes_yes", 0);
  rec.set("votes_no", 0);
  rec.set("voting_ends_at", new Date(Date.now() + windowHours * 3600000).toISOString());
  app.save(rec);
  return rec;
}

function voteOnProposal(app, user, proposalId, value) {
  if (value !== 1 && value !== -1) throw new BadRequestError("value must be 1 or -1");
  let prop;
  try {
    prop = app.findRecordById("deletion_proposals", proposalId);
  } catch (e) {
    throw new NotFoundError("Proposal not found");
  }
  if (prop.get("status") !== "voting") throw new BadRequestError("Proposal is not open for voting");
  const endsAt = prop.getDateTime("voting_ends_at");
  if (endsAt && !endsAt.isZero() && endsAt.unix() * 1000 < Date.now()) throw new BadRequestError("Voting has ended");

  let vote;
  try {
    vote = app.findFirstRecordByFilter("deletion_votes", "proposal.id = {:p} && user.id = {:u}", { p: proposalId, u: user.id });
  } catch (e) {
    vote = new Record(app.findCollectionByNameOrId("deletion_votes"));
    vote.set("proposal", proposalId);
    vote.set("user", user.id);
  }
  vote.set("value", value);
  app.save(vote);

  // tally
  const yes = app.countRecords("deletion_votes", "proposal.id = {:p} && value = 1", { p: proposalId });
  const no = app.countRecords("deletion_votes", "proposal.id = {:p} && value = -1", { p: proposalId });
  prop.set("votes_yes", yes);
  prop.set("votes_no", no);
  app.save(prop);
  return { votes_yes: yes, votes_no: no };
}

function decideProposal(app, prop) {
  const yes = Number(prop.get("votes_yes")) || 0;
  const no = Number(prop.get("votes_no")) || 0;
  const pct = Number(setting(app, "vote_approval_pct", 60)) / 100;
  const minVoters = Number(setting(app, "vote_min_voters", 3));
  if (yes + no === 0) {
    prop.set("status", "expired");
    app.save(prop);
    return "expired";
  }
  const approval = yes / (yes + no);
  if (approval >= pct && yes >= minVoters) {
    prop.set("status", "approved");
    app.save(prop);
    return "approved";
  }
  prop.set("status", "rejected");
  app.save(prop);
  return "rejected";
}

function executeProposal(app, prop, executorId) {
  const type = prop.get("type");
  const c = safeJson(prop.get("criteria"), {});
  const ageDays = Number(c.ageDays) || 90;
  const cutoff = daysAgoISO(ageDays);
  let freed = 0;

  const logAction = function (action, targetId, targetType, sizeFreed) {
    try {
      const row = new Record(app.findCollectionByNameOrId("deletion_log"));
      row.set("proposal", prop.id);
      row.set("action", action);
      row.set("target_id", String(targetId));
      row.set("target_type", targetType);
      row.set("size_freed", sizeFreed || 0);
      row.set("executed_by", executorId);
      app.save(row);
    } catch (e) {}
  };

  if (type === "clear_cache") {
    const items = app.findRecordsByFilter("news_items", "expires_at < {:cutoff} || expires_at = ''", "-created", 500, 0, { cutoff: nowISO() });
    for (let i = 0; i < items.length; i++) {
      const sz = 512; // rough estimate
      app.delete(items[i]);
      freed += sz;
      logAction("cache_cleared", items[i].id, "news_item", sz);
    }
  } else if (type === "old_files" || type === "old_messages") {
    // delete chat messages older than cutoff (files cascade away)
    const source = c.source || "chat";
    if (source === "chat") {
      const msgs = app.findRecordsByFilter("messages", "created < {:cutoff}", "-created", 500, 0, { cutoff: cutoff });
      for (let i = 0; i < msgs.length; i++) {
        const sz = storedSizeForRecord(app, msgs[i].id);
        app.delete(msgs[i]);
        freed += sz;
        logAction("message_deleted", msgs[i].id, "message", sz);
      }
    }
  } else if (type === "old_posts") {
    const posts = app.findRecordsByFilter("posts", "created < {:cutoff}", "-created", 500, 0, { cutoff: cutoff });
    for (let i = 0; i < posts.length; i++) {
      const sz = storedSizeForRecord(app, posts[i].id);
      app.delete(posts[i]);
      freed += sz;
      logAction("post_deleted", posts[i].id, "post", sz);
    }
  } else if (type === "specific_files" && Array.isArray(c.ids)) {
    // ids here are record ids (message or post) to delete
    for (let i = 0; i < c.ids.length; i++) {
      const id = String(c.ids[i]);
      const sz = storedSizeForRecord(app, id);
      let target = null;
      try { target = app.findRecordById("messages", id); } catch (e) {}
      if (!target) { try { target = app.findRecordById("posts", id); } catch (e) {} }
      if (!target) continue;
      app.delete(target);
      freed += sz;
      logAction("file_deleted", id, target.collection().name, sz);
    }
  }

  // remove now-orphaned storage_files entries
  try {
    const orphaned = app.findRecordsByFilter("storage_files", "record_id ~ {:none}", "-created", 1000, 0, { none: "__none__" });
    for (let i = 0; i < orphaned.length; i++) app.delete(orphaned[i]);
  } catch (e) {}

  prop.set("status", "executed");
  prop.set("executed_at", nowISO());
  prop.set("executed_by", executorId);
  prop.set("freed_space", freed);
  app.save(prop);
  refreshStorageCache(app);
  return freed;
}

function storedSizeForRecord(app, recordId) {
  let total = 0;
  try {
    const entries = app.findRecordsByFilter("storage_files", "record_id = {:id}", "-created", 1000, 0, { id: recordId });
    for (let i = 0; i < entries.length; i++) total += Number(entries[i].get("stored_size")) || 0;
  } catch (e) {}
  return total;
}

function processExpiredProposals(app) {
  const props = app.findRecordsByFilter("deletion_proposals", "status = 'voting'", "-created", 500, 0);
  for (let i = 0; i < props.length; i++) {
    const endsAt = props[i].getDateTime("voting_ends_at");
    if (!endsAt || endsAt.isZero() || endsAt.unix() * 1000 >= Date.now()) continue;
    const verdict = decideProposal(app, props[i]);
    if (verdict === "approved") {
      executeProposal(app, props[i], props[i].get("proposed_by"));
    }
  }
}

function autoPropose(app) {
  const state = cachedStorage(app);
  const used = state.bytes || 0;
  const limit = storageLimit(app);
  const threshold = Number(setting(app, "auto_propose_at_bytes", 8589934592)) || 8589934592;
  if (used < threshold) return;
  // avoid duplicate active proposals of the same type
  let dup = false;
  try {
    app.findFirstRecordByFilter("deletion_proposals", "type = 'old_files' && status = 'voting'", {});
    dup = true;
  } catch (e) {}
  if (!dup) {
    try {
      const rec = new Record(app.findCollectionByNameOrId("deletion_proposals"));
      rec.set("title", "Automatic: clean up old chat files (auto-proposed)");
      rec.set("description", "Storage usage passed " + Math.round(used / 1073741824) + " GB / " + (limit / 1073741824) + " GB. Auto-proposed cleanup of chat file attachments older than 90 days.");
      rec.set("proposed_by", "");
      rec.set("type", "old_files");
      rec.set("criteria", { ageDays: 90, source: "chat" });
      rec.set("estimated_freed_space", estimateFreed(app, "old_files", { ageDays: 90, source: "chat" }));
      rec.set("status", "voting");
      rec.set("votes_yes", 0);
      rec.set("votes_no", 0);
      rec.set("voting_ends_at", new Date(Date.now() + 72 * 3600000).toISOString());
      app.save(rec);
    } catch (e) {}
  }
}

module.exports = {
  nowISO: nowISO,
  daysAgoISO: daysAgoISO,
  setting: setting,
  setSetting: setSetting,
  notify: notify,
  isAdminRequest: isAdminRequest,
  newAdminMiddleware: newAdminMiddleware,
  scanStorage: scanStorage,
  cachedStorage: cachedStorage,
  storageLimit: storageLimit,
  refreshStorageCache: refreshStorageCache,
  checkQuotaBeforeSave: checkQuotaBeforeSave,
  generateInviteKeys: generateInviteKeys,
  registerWithKey: registerWithKey,
  refreshAllNews: refreshAllNews,
  mcStatus: mcStatus,
  robloxGames: robloxGames,
  robloxPresence: robloxPresence,
  smashRankings: smashRankings,
  estimateFreed: estimateFreed,
  createProposal: createProposal,
  voteOnProposal: voteOnProposal,
  decideProposal: decideProposal,
  executeProposal: executeProposal,
  processExpiredProposals: processExpiredProposals,
  autoPropose: autoPropose,
  refreshNewsCategory: fetchReddit,
  setNewsTTL: null,
};