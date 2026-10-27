import { auth } from './firebase.js';

// Every request to our own /api/ carries the signed-in user's Firebase token, so the
// server can check who's asking. Public pages (quote form, pay links) work without it.
const realFetch = window.fetch.bind(window);

window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  const ours = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
  const user = auth?.currentUser;
  if (!ours || !user) return realFetch(input, init);
  const token = await user.getIdToken();
  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return realFetch(input, { ...init, headers });
};
