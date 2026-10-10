// House Edge Function — replaces PocketBase pb_hooks (house.pb.js + house_lib.js).
// One function, routed by path, mirroring the original /api/house/* surface.
// deno-lint-ignore-file no-explicit-any

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function err(status: number, message: string, data?: unknown) {
  return json(status, { message, data: data ?? {} });
}

function nowISO() {
  return new Date().toISOString();
}
function daysAgoISO(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

async function getUser(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle();
  return profile ? { ...data.user, profile } : { ...data.user, profile: null };
}

function isAdmin(user: any) {
  return !!(user && user.profile && user.profile.role === "admin");
}

async function setting(key: string, fallback: any) {
  const { data } = await admin.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (!data) return fallback;
  return data.value ?? fallback;
}

async function setSetting(key: string, value: any) {
  await admin.from("app_settings").upsert({ key, value }, { onConflict: "key" });
}

async function notify(userId: string | null, type: string, title: string, body: string, link: string) {
  if (!userId) return;
  try {
    await admin.from("notifications").insert({ user: userId, type, title, body, link, is_read: false });
  } catch (_e) {
    /* best effort */
  }
}

// ---------------------------------------------------------------------------
// storage accounting
// ---------------------------------------------------------------------------
async function storageState() {
  const { data } = await admin.from("storage_files").select("stored_size, source");
  let total = 0;
  const breakdown: Record<string, number> = { chat: 0, post: 0, avatar: 0, other: 0 };
  for (const r of data || []) {
    const sz = Number(r.stored_size) || 0;
    total += sz;
    const cat = r.source || "other";
    breakdown[cat] = (breakdown[cat] || 0) + sz;
  }
  return { bytes: total, breakdown, files: (data || []).length, updated_at: nowISO() };
}

async function storageLimit() {
  return Number(await setting("storage_limit_bytes", 10737418240)) || 10737418240;
}

// ---------------------------------------------------------------------------
// invite keys
// ---------------------------------------------------------------------------
function randomChunk() {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes).map((b) => alphabet[b % alphabet.length]).join("");
}

async function generateInviteKeys(count: number, adminId: string) {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = `HOUSE-${randomChunk()}-${randomChunk()}-${randomChunk()}`;
    const { error } = await admin.from("invite_keys").insert({ key_code: code, created_by: adminId || null, is_used: false });
    if (!error) out.push(code);
  }
  return out;
}

async function registerWithKey(body: any) {
  const key = String(body?.key || body?.invite_key || "").trim();
  const username = String(body?.username || body?.name || "").trim();
  const email = String(body?.email || "").trim();
  const password = String(body?.password || "");

  if (!key || !username || !email || !password) return err(400, "key, username, email and password are required");
  if (username.length < 2) return err(400, "Username must be at least 2 characters");
  if (password.length < 6) return err(400, "Password must be at least 6 characters");

  const { data: keyRec } = await admin.from("invite_keys").select("*").eq("key_code", key).maybeSingle();
  if (!keyRec) return err(400, "Invalid invite key");
  if (keyRec.is_used) return err(400, "This invite key has already been used");
  if (keyRec.expires_at && new Date(keyRec.expires_at).getTime() < Date.now()) {
    return err(400, "This invite key has expired");
  }

  const { data: dupUser } = await admin.from("profiles").select("id").ilike("username", username).limit(1);
  if (dupUser && dupUser.length) return err(400, "Username is already taken");
  const { data: dupEmail } = await admin.from("profiles").select("id").ilike("email", email).limit(1);
  if (dupEmail && dupEmail.length) return err(400, "Email is already registered");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err(400, "Invalid email address");

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, name: username, role: "member" },
  });
  if (createErr || !created?.user) return err(400, createErr?.message || "Could not create user");

  const uid = created.user.id;
  // ensure profile reflects username (trigger already inserted a baseline)
  await admin.from("profiles").upsert(
    { id: uid, username, name: username, email, role: "member", karma: 0, last_active: nowISO() },
    { onConflict: "id" },
  );

  await admin.from("invite_keys").update({ used_by: uid, used_at: nowISO(), is_used: true }).eq("id", keyRec.id);
  await notify(uid, "welcome", "Welcome to House!!",
    "You're in. Grab a seat in #general, check the gaming feed for what to play, and settle the Smash debate once and for all.",
    "/#/chat/general");

  return json(200, { record: { id: uid, email, username } });
}

// ---------------------------------------------------------------------------
// news
// ---------------------------------------------------------------------------
function stripTags(html: string) {
  return String(html || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ").trim();
}

function parseRss(text: string) {
  const items: any[] = [];
  const re = /<item[\s>][\s\S]*?<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const block = m[0];
    const title = stripTags((/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(block) || [])[1] || "");
    if (!title) continue;
    let link = (/(<link[^>]*>)([\s\S]*?)(<\/link>)/.exec(block) || [])[2] || "";
    if (link.indexOf("http") !== 0) {
      const self = (/<link[^>]*href="([^"]+)"[^>]*\/?>/.exec(block) || [])[1] || "";
      if (self.indexOf("http") === 0) link = self;
    }
    const desc = stripTags((/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/.exec(block) || [])[1] || "");
    const pub = (/<pubDate>([\s\S]*?)<\/pubDate>/.exec(block) || [])[1] || "";
    const thumb = (/<media:thumbnail[^>]*url="([^"]+)"/.exec(block) || [])[1] || "";
    items.push({ title, link, description: desc, pubDate: pub, thumbnail: thumb });
  }
  return items;
}

async function upsertNews(category: string, item: any) {
  const { data: existing } = await admin
    .from("news_items").select("id").eq("category", category).eq("url", item.url || "").maybeSingle();
  const payload: any = {
    category,
    title: item.title,
    summary: item.summary || "",
    url: item.url || "",
    thumbnail_url: item.thumbnail_url || "",
    source_name: item.source_name || category,
    metadata: item.metadata || {},
    published_at: item.published_at || nowISO(),
    fetched_at: nowISO(),
    expires_at: daysAgoISO(14),
  };
  if (existing) {
    await admin.from("news_items").update(payload).eq("id", existing.id);
  } else {
    await admin.from("news_items").insert(payload);
  }
}

async function capCategory(category: string, max: number) {
  const { data } = await admin.from("news_items").select("id").eq("category", category)
    .order("created", { ascending: false }).range(max, max + 500);
  const ids = (data || []).map((r) => r.id);
  if (ids.length) await admin.from("news_items").delete().in("id", ids);
}

async function fetchHackerNews() {
  try {
    const r = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json?print=pretty");
    if (!r.ok) return;
    const ids: number[] = await r.json();
    let count = 0;
    for (let i = 0; i < Math.min(ids.length, 15) && count < 8; i++) {
      let item: any;
      try {
        const r2 = await fetch(`https://hacker-news.firebaseio.com/v0/item/${ids[i]}.json?print=pretty`);
        if (r2.ok) item = await r2.json();
      } catch { continue; }
      if (!item?.title) continue;
      await upsertNews("tech", {
        title: item.title,
        summary: (item.text || "").substring(0, 400),
        url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
        source_name: "Hacker News",
        published_at: new Date(item.time * 1000).toISOString(),
        metadata: { hn_id: item.id, score: item.score, by: item.by },
      });
      count++;
    }
  } catch (_e) { /* ignore */ }
}

async function fetchRss(feedUrl: string, category: string, sourceName: string) {
  try {
    const r = await fetch(feedUrl, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36" },
    });
    if (!r.ok) return;
    const items = parseRss(await r.text());
    let count = 0;
    for (const it of items) {
      if (count >= 8) break;
      if (!it.title || it.title.length < 4) continue;
      let published = "";
      if (it.pubDate && !isNaN(new Date(it.pubDate).getTime())) published = new Date(it.pubDate).toISOString();
      await upsertNews(category, {
        title: it.title,
        summary: (it.description || "").substring(0, 400),
        url: it.link || feedUrl,
        thumbnail_url: it.thumbnail || "",
        source_name: sourceName,
        published_at: published || nowISO(),
        metadata: { feed: feedUrl },
      });
      count++;
    }
  } catch (_e) { /* ignore */ }
}

async function fetchJikan() {
  try {
    const r = await fetch("https://api.jikan.moe/v4/top/anime?filter=airing&limit=10");
    if (!r.ok) return;
    const j = await r.json();
    const items = j?.data || [];
    for (let i = 0; i < items.length && i < 8; i++) {
      const d = items[i];
      if (!d?.title) continue;
      await upsertNews("anime", {
        title: d.title,
        summary: (d.synopsis || "").substring(0, 400),
        url: d.url || "",
        thumbnail_url: d.images?.jpg?.small_image_url || "",
        source_name: "MyAnimeList",
        published_at: d.aired?.from || nowISO(),
        metadata: { score: d.score, episodes: d.episodes, type: d.type },
      });
    }
  } catch (_e) { /* ignore */ }
}

async function fetchMinecraft() {
  try {
    const r = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json");
    if (!r.ok) return;
    const j = await r.json();
    const latest = j?.versions?.[0];
    if (!latest) return;
    await upsertNews("minecraft", {
      title: `Minecraft ${latest.id} version available`,
      summary: `Latest Minecraft version checked by Mojang: ${latest.id} (${latest.type}, released ${(latest.releaseTime || "").substring(0, 10)}).`,
      url: "https://www.minecraft.net/en-us/version-history",
      source_name: "Mojang",
      published_at: latest.releaseTime || nowISO(),
      metadata: { version: latest.id, type: latest.type },
    });
  } catch (_e) { /* ignore */ }
}

async function refreshAllNews() {
  await fetchHackerNews();
  await fetchRss("https://feeds.feedburner.com/ign/all", "gaming", "IGN");
  await fetchRss("https://www.polygon.com/rss/index.xml", "gaming", "Polygon");
  await fetchRss("https://www.dualshockers.com/feed/", "gaming", "DualShockers");
  await fetchRss("https://www.dualshockers.com/feed/", "smash", "DualShockers");
  await fetchRss("https://www.siliconera.com/feed/", "smash", "Siliconera");
  await fetchRss("https://www.nintendolife.com/feeds/news", "smash", "Nintendo Life");
  await fetchJikan();
  await fetchMinecraft();
  await capCategory("tech", 40);
  await capCategory("gaming", 60);
  await capCategory("smash", 60);
  await capCategory("anime", 40);
  await capCategory("minecraft", 40);
  await setSetting("news_fetched_at", nowISO());
}

// ---------------------------------------------------------------------------
// minecraft / roblox / smash
// ---------------------------------------------------------------------------
async function mcStatus() {
  const host = await setting("mc_server_host", "");
  if (!host) return { configured: false, status: "unknown", message: "No Minecraft server configured. Admin can set 'mc_server_host' in settings." };
  try {
    const r = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(host)}`);
    const data = r.ok ? await r.json() : {};
    if (data.online === undefined) return { configured: true, host, status: "unknown", message: "Could not reach status API." };
    const out = {
      configured: true, host,
      status: data.online ? "online" : "offline",
      player_count: data.players?.online || 0,
      max_players: data.players?.max || 0,
      version: data.version,
      motd: (Array.isArray(data.motd) ? data.motd.join(" ") : (data.motd || "")).trim(),
      players: data.players?.list || [],
      last_checked_at: nowISO(),
    };
    await admin.from("mc_status").upsert({
      server_name: "main", host, status: out.status, player_count: out.player_count,
      max_players: out.max_players, version: out.version, motd: out.motd, players: out.players,
      last_checked_at: nowISO(),
    }, { onConflict: "server_name" });
    return out;
  } catch (e) {
    return { configured: true, host, status: "unknown", message: "Status check failed: " + (e as Error).message };
  }
}

async function robloxGames() {
  const watch = await setting("roblox_watchlist", []);
  const ids: number[] = Array.isArray(watch) ? watch.map(Number).filter((n) => n > 0) : [];
  if (!ids.length) return { configured: false, games: [], message: "Admin can set 'roblox_watchlist' (array of universe ids) in settings." };
  try {
    const r = await fetch(`https://games.roblox.com/v1/games?universeIds=${ids.join("%2C")}`, { headers: { accept: "application/json" } });
    const data = r.ok ? await r.json() : {};
    const games = (data.data || []).map((g: any) => ({
      universe_id: g.id, name: g.name, description: (g.description || "").substring(0, 300),
      playing_count: g.playing, creator: g.creator?.name || "", thumbnail_url: "",
    }));
    try {
      const t = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids.join("%2C")}&size=512x512&format=Png&isCircular=false`, { headers: { accept: "application/json" } });
      if (t.ok) {
        const td = await t.json();
        (td.data || []).forEach((d: any, i: number) => { if (games[i] && d?.imageUrl) games[i].thumbnail_url = d.imageUrl; });
      }
    } catch (_e) { /* ignore */ }
    for (const g of games) {
      await admin.from("roblox_games").upsert({
        universe_id: g.universe_id, name: g.name, description: g.description,
        thumbnail_url: g.thumbnail_url, playing_count: g.playing_count, creator: g.creator,
        last_updated_at: nowISO(),
      }, { onConflict: "universe_id" });
    }
    return { configured: true, games };
  } catch (e) {
    return { configured: true, games: [], message: (e as Error).message };
  }
}

async function robloxPresence(userIds: number[]) {
  if (!userIds.length) return { online: [] };
  try {
    const r = await fetch("https://presence.roblox.com/v1/presence/users", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ userIds }),
    });
    const data = r.ok ? await r.json() : {};
    return { online: data.data || [] };
  } catch (_e) {
    return { online: [] };
  }
}

async function smashRankings() {
  const { data: matches } = await admin.from("smash_matches").select("*").eq("is_ranked", true).order("created", { ascending: true }).limit(2000);
  const ratings: Record<string, number> = {};
  const games: Record<string, number> = {};
  const rating = (p: string) => (ratings[p] = ratings[p] ?? 1200);
  const applyMatch = (w: string, l: string) => {
    const rw = rating(w), rl = rating(l);
    const ew = 1 / (1 + Math.pow(10, (rl - rw) / 400));
    const el = 1 - ew;
    ratings[w] = rw + 32 * (1 - ew);
    ratings[l] = rl + 32 * (0 - el);
    games[w] = (games[w] || 0) + 1;
    games[l] = (games[l] || 0) + 1;
  };
  for (const m of matches || []) {
    if (!m.winner) continue;
    if (m.winner === m.player1 && m.player2 !== m.player1) applyMatch(m.player1, m.player2);
    else if (m.winner === m.player2 && m.player1 !== m.player2) applyMatch(m.player2, m.player1);
  }
  const ids = Object.keys(ratings);
  const nameMap: Record<string, string> = {};
  if (ids.length) {
    const { data: users } = await admin.from("profiles").select("id, username").in("id", ids);
    for (const u of users || []) nameMap[u.id] = u.username || "Unknown";
  }
  const arr = Object.entries(ratings).map(([k, v]) => ({
    user_id: k, username: nameMap[k] || "Unknown", rating: Math.round(v), games: games[k] || 0,
  }));
  arr.sort((a, b) => b.rating - a.rating);
  arr.forEach((r, i) => (r as any).rank = i + 1);
  return arr;
}

// ---------------------------------------------------------------------------
// voting
// ---------------------------------------------------------------------------
async function voteOnContent(userId: string, collection: string, recordId: string, value: number) {
  if (![1, -1, 0].includes(value)) return err(400, "value must be 1, -1 or 0");
  const field = collection === "posts" ? "post_id" : "comment_id";
  const { data: target } = await admin.from(collection).select("id, upvotes, downvotes").eq("id", recordId).maybeSingle();
  if (!target) return err(404, "Not found");

  const { data: vote } = await admin.from("votes").select("*").eq("user", userId).eq(field, recordId).maybeSingle();
  let my = 0;
  if (value === 0) {
    if (vote) await admin.from("votes").delete().eq("id", vote.id);
    my = 0;
  } else if (vote) {
    if (Number(vote.value) === value) {
      await admin.from("votes").delete().eq("id", vote.id);
      my = 0;
    } else {
      await admin.from("votes").update({ value }).eq("id", vote.id);
      my = value;
    }
  } else {
    await admin.from("votes").insert({ user: userId, [field]: recordId, value, category: collection });
    my = value;
  }

  const { count: ups } = await admin.from("votes").select("*", { count: "exact", head: true }).eq(field, recordId).gt("value", 0);
  const { count: downs } = await admin.from("votes").select("*", { count: "exact", head: true }).eq(field, recordId).lt("value", 0);
  await admin.from(collection).update({ upvotes: ups || 0, downvotes: downs || 0 }).eq("id", recordId);
  return json(200, { success: true, upvotes: ups || 0, downvotes: downs || 0, my });
}

// ---------------------------------------------------------------------------
// poll
// ---------------------------------------------------------------------------
async function getPoll(userId: string, postId: string) {
  const { data: poll } = await admin.from("polls").select("*").eq("post", postId).maybeSingle();
  if (!poll) return { poll: null };
  const options: string[] = poll.options || [];
  const voters: any[] = poll.voters || [];
  const counts = options.map((_, i) => voters.filter((v) => Number(v.option) === i).length);
  let chosen: number | null = null;
  for (const v of voters) if (v.user === userId) chosen = Number(v.option);
  return { poll: { options, counts, chosen, total: voters.length, ends_at: poll.ends_at } };
}

async function postPoll(userId: string, postId: string, body: any) {
  const { data: poll } = await admin.from("polls").select("*").eq("post", postId).maybeSingle();
  if (!poll) {
    let options = body?.options;
    if (!Array.isArray(options) || options.length < 2) return err(400, "options must have at least 2 entries");
    options = options.map((o: any) => String(o).slice(0, 120));
    const { data: created } = await admin.from("polls").insert({
      post: postId, options, voters: [], ends_at: body?.ends_at || null,
    }).select().single();
    return json(200, { success: true, created: true, poll: { options: created.options, counts: options.map(() => 0), chosen: null, total: 0 } });
  }
  const options: string[] = poll.options || [];
  const optIdx = Math.floor(Number(body?.option_index));
  if (isNaN(optIdx) || optIdx < 0 || optIdx >= options.length) return err(400, "bad option_index");
  let voters: any[] = poll.voters || [];
  voters = voters.filter((v) => v.user !== userId);
  voters.push({ user: userId, option: optIdx });
  await admin.from("polls").update({ voters }).eq("id", poll.id);
  const counts = options.map((_, i) => voters.filter((v) => Number(v.option) === i).length);
  return json(200, { success: true, poll: { options, counts, chosen: optIdx, total: voters.length } });
}

// ---------------------------------------------------------------------------
// deletion proposals
// ---------------------------------------------------------------------------
async function createProposal(userId: string, body: any) {
  const type = body?.type;
  const title = body?.title;
  const description = body?.description;
  const criteria = body?.criteria;
  const allowed = ["old_files", "old_posts", "old_messages", "specific_files", "clear_cache"];
  if (!allowed.includes(type)) return err(400, "Invalid proposal type");
  if (!title) return err(400, "title is required");
  const windowHours = Number(await setting("vote_window_hours", 72)) || 72;
  const estimate = await estimateFreed(type, criteria);
  const { data, error } = await admin.from("deletion_proposals").insert({
    title, description: description || "", proposed_by: userId, type, criteria: criteria || {},
    estimated_freed_space: estimate, status: "voting", votes_yes: 0, votes_no: 0,
    voting_ends_at: new Date(Date.now() + windowHours * 3600000).toISOString(),
  }).select().single();
  if (error) return err(400, error.message);
  return json(200, { success: true, id: data.id });
}

async function estimateFreed(type: string, criteria: any) {
  const c = criteria || {};
  const ageDays = Number(c.ageDays) || 90;
  let total = 0;
  if (type === "old_files" || type === "old_messages") {
    const source = c.source || "chat";
    const { data } = await admin.from("storage_files").select("stored_size, created").eq("source", source).limit(500);
    const cutoff = new Date(daysAgoISO(ageDays));
    for (const e of data || []) if (new Date(e.created) < cutoff) total += Number(e.stored_size) || 0;
  } else if (type === "specific_files" && Array.isArray(c.ids)) {
    for (const id of c.ids) {
      const { data } = await admin.from("storage_files").select("stored_size").eq("record_id", String(id));
      for (const e of data || []) total += Number(e.stored_size) || 0;
    }
  } else if (type === "old_posts") {
    const { data } = await admin.from("storage_files").select("stored_size, created").eq("source", "post").limit(1000);
    const cutoff = new Date(daysAgoISO(ageDays));
    for (const e of data || []) if (new Date(e.created) < cutoff) total += Number(e.stored_size) || 0;
  } else if (type === "clear_cache") {
    const { count } = await admin.from("news_items").select("*", { count: "exact", head: true });
    total = count || 0;
  }
  return total;
}

async function voteOnProposal(userId: string, proposalId: string, value: number) {
  if (value !== 1 && value !== -1) return err(400, "value must be 1 or -1");
  const { data: prop } = await admin.from("deletion_proposals").select("*").eq("id", proposalId).maybeSingle();
  if (!prop) return err(404, "Proposal not found");
  if (prop.status !== "voting") return err(400, "Proposal is not open for voting");
  if (prop.voting_ends_at && new Date(prop.voting_ends_at).getTime() < Date.now()) return err(400, "Voting has ended");

  await admin.from("deletion_votes").upsert(
    { proposal: proposalId, user: userId, choice: value },
    { onConflict: "proposal,user" },
  );
  const { data: votes } = await admin.from("deletion_votes").select("choice").eq("proposal", proposalId);
  let yes = 0, no = 0;
  for (const v of votes || []) { if (Number(v.choice) > 0) yes++; else if (Number(v.choice) < 0) no++; }
  await admin.from("deletion_proposals").update({ votes_yes: yes, votes_no: no }).eq("id", proposalId);
  return json(200, { success: true, votes: { votes_yes: yes, votes_no: no } });
}

async function decideProposal(prop: any) {
  const yes = Number(prop.votes_yes) || 0, no = Number(prop.votes_no) || 0;
  const pct = Number(await setting("vote_approval_pct", 60)) / 100;
  const minVoters = Number(await setting("vote_min_voters", 3));
  if (yes + no === 0) { await admin.from("deletion_proposals").update({ status: "expired" }).eq("id", prop.id); return "expired"; }
  const approval = yes / (yes + no);
  if (approval >= pct && yes >= minVoters) { await admin.from("deletion_proposals").update({ status: "approved" }).eq("id", prop.id); return "approved"; }
  await admin.from("deletion_proposals").update({ status: "rejected" }).eq("id", prop.id);
  return "rejected";
}

async function executeProposal(prop: any, executorId: string) {
  const type = prop.type;
  const c = prop.criteria || {};
  const ageDays = Number(c.ageDays) || 90;
  const cutoffISO = daysAgoISO(ageDays);
  let freed = 0;
  const logAction = async (action: string, targetId: string, targetType: string, sizeFreed: number) => {
    try {
      await admin.from("deletion_log").insert({
        proposal: prop.id, action, target_id: String(targetId), target_type: targetType,
        size_freed: sizeFreed || 0, executed_by: executorId,
      });
    } catch (_e) { /* ignore */ }
  };
  const sizeForRecord = async (recordId: string) => {
    const { data } = await admin.from("storage_files").select("stored_size").eq("record_id", recordId);
    return (data || []).reduce((a, e) => a + (Number(e.stored_size) || 0), 0);
  };

  if (type === "clear_cache") {
    const { data: items } = await admin.from("news_items").select("id").or(`expires_at.lt.${nowISO()},expires_at.is.null`).limit(500);
    for (const it of items || []) {
      await admin.from("news_items").delete().eq("id", it.id);
      freed += 512;
      await logAction("cache_cleared", it.id, "news_item", 512);
    }
  } else if (type === "old_files" || type === "old_messages") {
    const source = c.source || "chat";
    if (source === "chat") {
      const { data: msgs } = await admin.from("messages").select("id").lt("created", cutoffISO).limit(500);
      for (const msg of msgs || []) {
        const sz = await sizeForRecord(msg.id);
        await admin.from("messages").delete().eq("id", msg.id);
        freed += sz;
        await logAction("message_deleted", msg.id, "message", sz);
      }
    }
  } else if (type === "old_posts") {
    const { data: posts } = await admin.from("posts").select("id").lt("created", cutoffISO).limit(500);
    for (const p of posts || []) {
      const sz = await sizeForRecord(p.id);
      await admin.from("posts").delete().eq("id", p.id);
      freed += sz;
      await logAction("post_deleted", p.id, "post", sz);
    }
  } else if (type === "specific_files" && Array.isArray(c.ids)) {
    for (const rawId of c.ids) {
      const id = String(rawId);
      const sz = await sizeForRecord(id);
      const { data: msg } = await admin.from("messages").select("id").eq("id", id).maybeSingle();
      const delTable = msg ? "messages" : "posts";
      const { data: tgt } = msg ? { data: msg } : await admin.from("posts").select("id").eq("id", id).maybeSingle();
      if (!tgt) continue;
      await admin.from(delTable).delete().eq("id", id);
      freed += sz;
      await logAction("file_deleted", id, delTable, sz);
    }
  }

  await admin.from("deletion_proposals").update({
    status: "executed", executed_at: nowISO(), executed_by: executorId, freed_space: freed,
  }).eq("id", prop.id);
  return freed;
}

async function processExpiredProposals() {
  const { data: props } = await admin.from("deletion_proposals").select("*").eq("status", "voting").limit(500);
  for (const p of props || []) {
    if (!p.voting_ends_at || new Date(p.voting_ends_at).getTime() >= Date.now()) continue;
    const verdict = await decideProposal(p);
    if (verdict === "approved") await executeProposal(p, p.proposed_by || "");
  }
}

async function autoPropose() {
  const state = await storageState();
  const used = state.bytes || 0;
  const limit = await storageLimit();
  const threshold = Number(await setting("auto_propose_at_bytes", 8589934592)) || 8589934592;
  if (used < threshold) return;
  const { data: dup } = await admin.from("deletion_proposals").select("id").eq("type", "old_files").eq("status", "voting").limit(1);
  if (dup && dup.length) return;
  try {
    await admin.from("deletion_proposals").insert({
      title: "Automatic: clean up old chat files (auto-proposed)",
      description: `Storage usage passed ${Math.round(used / 1073741824)} GB / ${limit / 1073741824} GB. Auto-proposed cleanup of chat file attachments older than 90 days.`,
      proposed_by: null, type: "old_files", criteria: { ageDays: 90, source: "chat" },
      estimated_freed_space: await estimateFreed("old_files", { ageDays: 90, source: "chat" }),
      status: "voting", votes_yes: 0, votes_no: 0,
      voting_ends_at: new Date(Date.now() + 72 * 3600000).toISOString(),
    });
  } catch (_e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  let path = url.pathname;
  const marker = path.indexOf("/api/house");
  if (marker >= 0) path = path.slice(marker);
  const seg = path.split("/").filter(Boolean); // api, house, ...
  const route = seg.slice(2); // after api/house

  const user = await getUser(req);
  const uid = user?.id || "";
  let body: any = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { body = {}; }
  }
  const q = url.searchParams;

  try {
    // ---- cron (internal; guarded by shared secret header stored as a function secret) ----
    if (route[0] === "cron") {
      const secret = Deno.env.get("CRON_SECRET") || "";
      const sent = req.headers.get("x-cron-secret") || "";
      if (!secret || sent !== secret) return err(403, "Forbidden");
      const job = route[1];
      if (job === "news") await refreshAllNews();
      else if (job === "deletions") await processExpiredProposals();
      else if (job === "storage") { await autoPropose(); }
      return json(200, { ok: true, job });
    }

    // ---- guests ----
    if (route[0] === "register" && req.method === "POST") {
      return await registerWithKey(body);
    }

    // everything below requires auth
    if (!uid) return err(401, "Authentication required");

    // ---- invites (admin) ----
    if (route[0] === "invites") {
      if (!isAdmin(user)) return err(403, "Admin only");
      if (req.method === "GET") {
        const { data } = await admin.from("invite_keys").select("*").order("created", { ascending: false }).limit(500);
        return json(200, (data || []).map((r) => ({
          id: r.id, key_code: r.key_code, is_used: r.is_used, used_by: r.used_by,
          used_at: r.used_at, expires_at: r.expires_at, created_at: r.created,
        })));
      }
      const count = Math.floor(Number(body?.count)) || 1;
      if (count < 1 || count > 100) return err(400, "count must be between 1 and 100");
      return json(200, { keys: await generateInviteKeys(count, uid) });
    }

    // ---- settings (admin) ----
    if (route[0] === "settings") {
      if (!isAdmin(user)) return err(403, "Admin only");
      const keys = ["storage_limit_bytes", "vote_window_hours", "vote_approval_pct", "vote_min_voters",
        "auto_propose_at_bytes", "news_ttl_minutes", "mc_server_host", "roblox_watchlist"];
      if (req.method === "GET") {
        const out: any = {};
        for (const k of keys) out[k] = await setting(k, null);
        return json(200, out);
      }
      for (const k of keys) {
        const v = body?.[k];
        if (v !== undefined && v !== null && v !== "") await setSetting(k, v);
      }
      return json(200, { success: true });
    }

    // ---- storage ----
    if (route[0] === "storage") {
      if (route[1] === "refresh" && req.method === "POST") {
        return json(200, { refreshed: true, state: await storageState() });
      }
      if (route[1] === "check" && req.method === "POST") {
        const need = Number(body?.bytes) || 0;
        const state = await storageState();
        const limit = await storageLimit();
        if ((state.bytes || 0) + need > limit) {
          return err(400, `Storage limit reached (${((state.bytes || 0) / 1073741824).toFixed(2)} GB / 10 GB). This upload (${Math.round(need / 1048576)} MB) was blocked. Free space from the Storage page first.`,
            { storage: { used_bytes: state.bytes, limit_bytes: limit, blocked_bytes: need } });
        }
        return json(200, { ok: true });
      }
      if (route[1] === "register" && req.method === "POST") {
        const files = Array.isArray(body?.files) ? body.files : [];
        for (const f of files) {
          try {
            await admin.from("storage_files").insert({
              owner: f.owner || uid, source: f.source || "other", record_id: f.record_id || "",
              field: f.field || "", original_name: f.original_name || f.stored_name || "",
              stored_name: f.stored_name || f.original_name || "", mime_type: f.mime_type || "",
              original_size: f.original_size || f.stored_size || 0, stored_size: f.stored_size || 0,
              algorithm: f.algorithm || "none", category: f.category || f.source || "other",
            });
          } catch (_e) { /* ignore */ }
        }
        return json(200, { success: true });
      }
      // GET overview
      const state = await storageState();
      const limit = await storageLimit();
      const used = state.bytes || 0;
      const { data: largest } = await admin.from("storage_files").select("*").order("stored_size", { ascending: false }).limit(15);
      return json(200, {
        limit_bytes: limit, used_bytes: used, free_bytes: Math.max(0, limit - used),
        percent: Math.round((used / limit) * 10000) / 100, breakdown: state.breakdown || {},
        readonly: used >= limit, files_count: state.files || 0,
        largest: (largest || []).map((r) => ({
          id: r.id, original_name: r.original_name, original_size: r.original_size,
          stored_size: r.stored_size, algorithm: r.algorithm, source: r.source, owner: r.owner,
          record_id: r.record_id, mime_type: r.mime_type, created_at: r.created,
        })),
        updated_at: state.updated_at,
      });
    }

    // ---- news ----
    if (route[0] === "news") {
      const category = q.get("category") || "tech";
      const allowed = ["gaming", "anime", "tech", "minecraft", "roblox", "smash"];
      if (!allowed.includes(category)) return err(400, "Invalid category");
      if (route[1] === "refresh" && req.method === "POST") {
        const force = q.get("force") === "1";
        const last = await setting("news_fetched_at", null);
        const ttlMin = Number(await setting("news_ttl_minutes", 30)) || 30;
        const stale = !last || (Date.now() - new Date(last).getTime()) > ttlMin * 60000;
        if (!stale && !force) return json(200, { refreshed: false, message: "News is fresh. Try again later or use the Force button." });
        await refreshAllNews();
        return json(200, { refreshed: true });
      }
      const { data: items } = await admin.from("news_items").select("*").eq("category", category).order("created", { ascending: false }).limit(60);
      const out = (items || []).map((r) => ({
        id: r.id, category: r.category, title: r.title, summary: r.summary, url: r.url,
        thumbnail_url: r.thumbnail_url, source_name: r.source_name, metadata: r.metadata,
        published_at: r.published_at,
      }));
      const lastFetch = await setting("news_fetched_at", null);
      if (category === "roblox") return json(200, { category, items: out, games: await robloxGames() });
      return json(200, { category, items: out, lastFetch });
    }

    // ---- minecraft ----
    if (route[0] === "minecraft" && route[1] === "status") {
      return json(200, await mcStatus());
    }

    // ---- roblox ----
    if (route[0] === "roblox") {
      const games = await robloxGames();
      const { data: users } = await admin.from("profiles").select("id, username, roblox_id").gt("roblox_id", 0).limit(500);
      const ids: number[] = [];
      const nameMap: Record<string, string> = {};
      for (const u of users || []) {
        const rid = Number(u.roblox_id);
        if (rid <= 0) continue;
        ids.push(rid);
        nameMap[String(rid)] = u.username || "Unknown";
      }
      const presence = await robloxPresence(ids);
      const online = (presence.online || []).map((p: any) => ({
        username: nameMap[String(p.userId)], lastLocation: p.lastLocation || "",
        gameId: p.gameId || 0, placeId: p.placeId || 0, lastOnline: p.lastOnline || "",
      }));
      return json(200, { games, online });
    }

    // ---- smash ----
    if (route[0] === "smash") {
      if (route[1] === "matches" && req.method === "POST") {
        const player1 = body?.player1, player2 = body?.player2, winner = body?.winner;
        if (!player1 || !player2 || !winner) return err(400, "player1, player2 and winner are required");
        if (player1 === player2) return err(400, "A match needs two different players");
        if (winner !== player1 && winner !== player2) return err(400, "winner must be player1 or player2");
        const { data, error } = await admin.from("smash_matches").insert({
          player1, player2, winner, character1: body?.character1 || "", character2: body?.character2 || "",
          stage: body?.stage || "", is_ranked: body?.is_ranked === true, created_by: uid,
        }).select().single();
        if (error) return err(400, error.message);
        return json(200, { success: true, id: data.id });
      }
      if (route[1] === "matches" && req.method === "GET") {
        const { data } = await admin.from("smash_matches").select("*").order("created", { ascending: false }).limit(200);
        return json(200, { matches: data || [] });
      }
      return json(200, { rankings: await smashRankings() });
    }

    // ---- polls ----
    if (route[0] === "posts" && route[2] === "poll") {
      const postId = route[1];
      if (req.method === "GET") return json(200, await getPoll(uid, postId));
      return await postPoll(uid, postId, body);
    }

    // ---- votes ----
    if (route[0] === "posts" && route[2] === "vote" && req.method === "POST") {
      return await voteOnContent(uid, "posts", route[1], Math.floor(Number(body?.value)));
    }
    if (route[0] === "comments" && route[2] === "vote" && req.method === "POST") {
      return await voteOnContent(uid, "comments", route[1], Math.floor(Number(body?.value)));
    }

    // ---- message reaction ----
    if (route[0] === "messages" && route[2] === "reaction" && req.method === "POST") {
      const id = route[1];
      const emoji = String(body?.emoji || "").trim();
      if (!emoji) return err(400, "emoji is required");
      const { data: msg } = await admin.from("messages").select("*").eq("id", id).maybeSingle();
      if (!msg) return err(404, "Message not found");
      let reactions: any = msg.reactions;
      if (!reactions || typeof reactions !== "object" || Array.isArray(reactions)) reactions = {};
      let arr: string[] = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
      const idx = arr.indexOf(uid);
      if (idx >= 0) arr = arr.slice(0, idx).concat(arr.slice(idx + 1));
      else arr = arr.concat([uid]);
      if (arr.length) reactions[emoji] = arr; else delete reactions[emoji];
      await admin.from("messages").update({ reactions }).eq("id", id);
      return json(200, { success: true, reactions });
    }

    // ---- deletion proposals ----
    if (route[0] === "deletion" && route[1] === "proposals") {
      if (route.length === 2) {
        if (req.method === "GET") {
          const { data } = await admin.from("deletion_proposals").select("*").order("created", { ascending: false }).limit(200);
          return json(200, { proposals: data || [] });
        }
        return await createProposal(uid, body);
      }
      const id = route[2];
      if (route[3] === "vote" && req.method === "POST") {
        return await voteOnProposal(uid, id, Number(body?.choice));
      }
      if (route[3] === "execute" && req.method === "POST") {
        if (!isAdmin(user)) return err(403, "Admin only");
        const { data: prop } = await admin.from("deletion_proposals").select("*").eq("id", id).maybeSingle();
        if (!prop) return err(404, "Proposal not found");
        if (prop.status !== "approved") return err(400, "Only approved proposals can be executed");
        return json(200, { success: true, freed: await executeProposal(prop, uid) });
      }
    }

    return err(404, "Not found: " + path);
  } catch (e) {
    return err(500, "Server error: " + (e as Error).message);
  }
});
