import { createClient } from '@supabase/supabase-js';

// ---- configuration ---------------------------------------------------------
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://mvacjabgynoabpsekejl.supabase.co';

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12YWNqYWJneW5vYWJwc2VrZWpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NDY2MTAsImV4cCI6MjEwNzIyMjYxMH0.E4e9uSEYQEnFCLjuk8X3tUsswQnbMu3-DpwjfwsZ2mI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// The PocketBase API base is replaced by the `house` Edge Function base.
export const API_URL = `${SUPABASE_URL}/functions/v1/house`;

// ---- relation map for `expand` --------------------------------------------
const RELATIONS = {
  messages: { user: 'profiles', parent: 'messages' },
  posts: { space: 'spaces', user: 'profiles' },
  comments: { user: 'profiles', parent: 'comments' },
  notifications: { user: 'profiles' },
};

// ---- auth state ------------------------------------------------------------
let session = null;
let profile = null;

async function loadProfile() {
  if (!session) {
    profile = null;
    return;
  }
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();
  profile = data || null;
}

export async function initAuth() {
  const { data } = await supabase.auth.getSession();
  session = data.session;
  await loadProfile();
  supabase.auth.onAuthStateChange(async (_evt, ns) => {
    session = ns;
    if (!ns) profile = null;
    else await loadProfile();
  });
}

const authStore = {
  get token() {
    return (session && session.access_token) || '';
  },
  get model() {
    return profile;
  },
  get isValid() {
    return !!session;
  },
  clear() {
    try {
      supabase.auth.signOut().catch(() => {});
    } catch {}
    session = null;
    profile = null;
  },
};

// ---- supabase REST helpers -------------------------------------------------
function parseFilter(filter) {
  const out = [];
  if (!filter) return out;
  for (const part of String(filter).split('&&')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']([^"']*)["']\s*$/.exec(part.trim());
    if (m) out.push({ field: m[1], value: m[2] });
  }
  return out;
}

function applyFilter(q, filter) {
  for (const c of parseFilter(filter)) q = q.eq(c.field, c.value);
  return q;
}

function applySort(q, sort) {
  if (!sort) return q;
  const desc = sort.startsWith('-');
  const col = desc ? sort.slice(1) : sort;
  return q.order(col, { ascending: !desc });
}

async function expandRows(table, rows, expandStr) {
  if (!expandStr || !rows || !rows.length) return rows;
  const fields = String(expandStr).split(',').map((s) => s.trim()).filter(Boolean);
  for (const field of fields) {
    const relTable = RELATIONS[table] && RELATIONS[table][field];
    if (!relTable) continue;
    const ids = [...new Set(rows.map((r) => r[field]).filter(Boolean))];
    if (!ids.length) continue;
    const { data } = await supabase.from(relTable).select('*').in('id', ids);
    const map = {};
    for (const r of data || []) map[r.id] = r;
    for (const r of rows) {
      r.expand = r.expand || {};
      r.expand[field] = map[r[field]] || null;
    }
  }
  return rows;
}

async function createWithFiles(table, form) {
  const id = crypto.randomUUID();
  const scalar = {};
  const fileFields = {};

  for (const [k, v] of form.entries()) {
    if (typeof File !== 'undefined' && v instanceof File) {
      (fileFields[k] = fileFields[k] || []).push(v);
    } else if (k in scalar) {
      if (!Array.isArray(scalar[k])) scalar[k] = [scalar[k]];
      scalar[k].push(v);
    } else {
      scalar[k] = v;
    }
  }

  let total = 0;
  for (const k in fileFields) for (const f of fileFields[k]) total += f.size || 0;
  if (total > 0) {
    await api('/api/house/storage/check', {
      method: 'POST',
      body: JSON.stringify({ bytes: total }),
    });
  }

  const fileMeta = [];
  for (const field in fileFields) {
    const names = [];
    for (const f of fileFields[field]) {
      const path = `${table}/${id}/${f.name}`;
      const { error } = await supabase.storage
        .from('house')
        .upload(path, f, { upsert: true, contentType: f.type || 'application/octet-stream' });
      if (error) throw new Error(error.message);
      names.push(f.name);
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      fileMeta.push({
        owner: scalar.user,
        source: table === 'messages' ? 'chat' : 'post',
        record_id: id,
        field,
        original_name: f.name,
        stored_name: f.name,
        mime_type: ext,
        original_size: f.size,
        stored_size: f.size,
        algorithm: ext === 'webp' ? 'webp' : ext === 'gz' ? 'gzip' : 'none',
        category: table === 'messages' ? 'chat' : 'post',
      });
    }
    scalar[field] = names;
  }

  scalar.id = id;
  const { data, error } = await supabase.from(table).insert(scalar).select('*').single();
  if (error) throw new Error(error.message);
  if (fileMeta.length) {
    await api('/api/house/storage/register', {
      method: 'POST',
      body: JSON.stringify({ files: fileMeta }),
    }).catch(() => {});
  }
  return data;
}

function entity(name) {
  const table = name === 'users' ? 'profiles' : name;

  async function create(data, opts = {}) {
    let row;
    if (typeof FormData !== 'undefined' && data instanceof FormData) {
      row = await createWithFiles(table, data);
    } else {
      const { data: r, error } = await supabase.from(table).insert(data).select('*').single();
      if (error) throw new Error(error.message);
      row = r;
    }
    if (opts.expand) await expandRows(table, [row], opts.expand);
    return row;
  }

  async function update(id, data, opts = {}) {
    const { data: r, error } = await supabase.from(table).update(data).eq('id', id).select('*').single();
    if (error) throw new Error(error.message);
    if (opts.expand) await expandRows(table, [r], opts.expand);
    return r;
  }

  async function del(id) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw new Error(error.message);
    return true;
  }

  async function getList(page = 1, perPage = 50, opts = {}) {
    let q = supabase.from(table).select('*', { count: 'exact' });
    q = applyFilter(q, opts.filter);
    q = applySort(q, opts.sort);
    const from = (page - 1) * perPage;
    q = q.range(from, from + perPage - 1);
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    const items = data || [];
    if (opts.expand) await expandRows(table, items, opts.expand);
    const total = count || items.length;
    return {
      page,
      perPage,
      totalItems: total,
      totalPages: Math.ceil(total / perPage),
      items,
    };
  }

  async function getFullList(opts = {}) {
    let q = supabase.from(table).select('*');
    q = applyFilter(q, opts.filter);
    q = applySort(q, opts.sort);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const items = data || [];
    if (opts.expand) await expandRows(table, items, opts.expand);
    return items;
  }

  async function getOne(id, opts = {}) {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('The requested resource was not found.');
    if (opts.expand) await expandRows(table, [data], opts.expand);
    return data;
  }

  async function subscribe(...args) {
    let cb;
    let opts = {};
    if (typeof args[0] === 'function') {
      cb = args[0];
      opts = args[1] || {};
    } else {
      cb = args[1];
      opts = args[2] || {};
    }
    const channel = supabase.channel(`rt-${table}-${Math.random().toString(36).slice(2)}`);
    const cfg = { event: '*', schema: 'public', table };
    const conds = parseFilter(opts.filter);
    if (conds.length === 1) cfg.filter = `${conds[0].field}=eq.${conds[0].value}`;
    channel.on('postgres_changes', cfg, async (payload) => {
      const action =
        payload.eventType === 'INSERT' ? 'create' : payload.eventType === 'UPDATE' ? 'update' : 'delete';
      const record = payload.eventType === 'DELETE' ? payload.old : payload.new;
      if (!record) return;
      if (payload.eventType !== 'DELETE' && opts.expand) {
        await expandRows(table, [record], opts.expand).catch(() => {});
      }
      cb({ action, record });
    });
    await channel.subscribe();
    return channel;
  }

  function unsubscribe(channel) {
    if (channel) supabase.removeChannel(channel);
  }

  async function authWithPassword(identity, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: identity, password });
    if (error) throw new Error(error.message);
    session = data.session;
    await loadProfile();
    return { token: session.access_token, record: profile };
  }

  return { create, update, delete: del, getList, getFullList, getOne, subscribe, unsubscribe, authWithPassword };
}

export const pb = {
  authStore,
  collection: (name) => entity(name),
};

// ---- custom API (Edge Function) -------------------------------------------
export const api = async (path, opts = {}) => {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (authStore.token) headers.Authorization = `Bearer ${authStore.token}`;
  const res = await fetch(API_URL + path, { ...opts, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.message || JSON.stringify(j.data || j);
    } catch {}
    throw new Error(detail);
  }
  return res.json();
};

export function fileUrl(collection, recordId, filename) {
  if (!filename) return '';
  return `${SUPABASE_URL}/storage/v1/object/public/house/${collection}/${recordId}/${filename}`;
}

export const fmtBytes = (n) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return n.toFixed(1) + ' ' + u[i];
};
