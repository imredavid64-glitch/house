import PocketBase from 'pocketbase';

export const API_URL =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8090';

export const pb = new PocketBase(API_URL);

export const api = async (path, opts = {}) => {
  const res = await fetch(API_URL + path, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: pb.authStore.token ? pb.authStore.token : '',
      ...opts.headers,
    },
    ...opts,
  });
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
  return `${API_URL}/api/files/${collection}/${recordId}/${filename}`;
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