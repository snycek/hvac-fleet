// Firebase (Admin) for the server: the database that keeps everything between restarts,
// and sign-in checks for owner screens. The browser never touches the database directly
// (firestore.rules denies it) — all data goes through this server.
//
// Each record is saved as { data: '<json>' } so any shape fits (customer outlines are
// lists of lists, which Firestore can't store natively). Receipt photos get their own
// collection so expense records stay small.
import fs from 'fs';
import admin from 'firebase-admin';

let db = null;
let authAdmin = null;

/** Connect if a service-account key is available (env FIREBASE_SERVICE_ACCOUNT or ./service-account.json). */
export function initFirebase() {
  let key = null;
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    else if (fs.existsSync('service-account.json')) key = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
  } catch (err) {
    console.error('Firebase key could not be read:', err.message);
  }
  if (!key) return false;
  admin.initializeApp({ credential: admin.credential.cert(key) });
  db = admin.firestore();
  authAdmin = admin.auth();
  console.log(`Firebase connected: ${key.project_id}`);
  return true;
}

export const firebaseReady = () => Boolean(db);

/** Verify a signed-in user's ID token; returns { uid, email } or throws. */
export async function verifyUser(idToken) {
  if (!authAdmin) throw new Error('sign-in is not set up');
  const t = await authAdmin.verifyIdToken(idToken);
  return { uid: t.uid, email: t.email || '' };
}

// ---- Data ----
// lists: { name: array } kept in sync with the collection of the same name.
// objects: { name: object } stored as one doc in "settings".
let lists = {};
let objects = {};
const saved = new Map(); // `${collection}/${id}` → last saved json
const savedReceipts = new Set();

const encode = item => JSON.stringify(item);
// Records without an id (crew shifts) are keyed by truck + day.
const idOf = it => (it?.id != null ? String(it.id) : it?.techId && it?.date ? `${it.techId}@${it.date}` : null);

/** Load everything into the in-memory lists. Empty collections keep their starting data (seeded on first save). */
export async function loadAll(listMap, objectMap) {
  lists = listMap;
  objects = objectMap;
  if (!db) return;
  for (const [name, arr] of Object.entries(lists)) {
    const snap = await db.collection(name).get();
    if (snap.empty) continue;
    const items = snap.docs.map(d => JSON.parse(d.data().data));
    arr.splice(0, arr.length, ...items);
    for (const it of items) saved.set(`${name}/${idOf(it)}`, encode(name === 'expenses' ? stripReceipt(it) : it));
  }
  // Receipt photos back onto their expenses.
  if (lists.expenses) {
    const rs = await db.collection('receipts').get();
    const byId = new Map(rs.docs.map(d => [d.id, d.data().receipt]));
    for (const e of lists.expenses) if (byId.has(e.id)) { e.receipt = byId.get(e.id); savedReceipts.add(e.id); }
  }
  for (const [name, obj] of Object.entries(objects)) {
    const doc = await db.collection('settings').doc(name).get();
    if (doc.exists) {
      const data = JSON.parse(doc.data().data);
      for (const k of Object.keys(obj)) delete obj[k];
      Object.assign(obj, data);
      saved.set(`settings/${name}`, encode(obj));
    }
  }
  console.log('Loaded from Firebase:', Object.entries(lists).map(([n, a]) => `${n} ${a.length}`).join(', '));
}

function stripReceipt(e) {
  const { receipt: _r, ...rest } = e;
  return rest;
}

// Write only what changed since the last save (batched; one save at a time).
let running = null;
let again = false;
async function syncNow() {
  if (!db) return;
  const ops = [];
  for (const [name, arr] of Object.entries(lists)) {
    const live = new Set();
    for (const it of arr) {
      const id = idOf(it);
      if (!id) continue;
      live.add(id);
      const json = encode(name === 'expenses' ? stripReceipt(it) : it);
      const key = `${name}/${id}`;
      if (saved.get(key) !== json) ops.push({ kind: 'set', ref: db.collection(name).doc(id), data: { data: json, updatedAt: new Date().toISOString() }, key, json });
      if (name === 'expenses' && it.receipt && !savedReceipts.has(id)) {
        if (it.receipt.length < 1_000_000) ops.push({ kind: 'set', ref: db.collection('receipts').doc(id), data: { receipt: it.receipt }, receipt: id });
        else console.warn(`Receipt for ${id} is too big to save (${it.receipt.length} chars)`);
      }
    }
    for (const key of [...saved.keys()]) {
      if (!key.startsWith(`${name}/`)) continue;
      const id = key.slice(name.length + 1);
      if (!live.has(id)) ops.push({ kind: 'delete', ref: db.collection(name).doc(id), key });
    }
  }
  for (const [name, obj] of Object.entries(objects)) {
    const json = encode(obj);
    const key = `settings/${name}`;
    if (saved.get(key) !== json) ops.push({ kind: 'set', ref: db.collection('settings').doc(name), data: { data: json, updatedAt: new Date().toISOString() }, key, json });
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    const chunk = ops.slice(i, i + 400);
    for (const op of chunk) (op.kind === 'set' ? batch.set(op.ref, op.data) : batch.delete(op.ref));
    await batch.commit();
    for (const op of chunk) {
      if (op.kind === 'delete') saved.delete(op.key);
      else if (op.receipt) savedReceipts.add(op.receipt);
      else saved.set(op.key, op.json);
    }
  }
  if (ops.length) console.log(`Saved ${ops.length} change${ops.length === 1 ? '' : 's'} to Firebase`);
}

/** Ask for a save (coalesced: rapid changes become one write). */
export function scheduleSave() {
  if (!db) return;
  if (running) { again = true; return; }
  running = (async () => {
    try {
      await new Promise(r => setTimeout(r, 250));
      await syncNow();
    } catch (err) {
      console.error('Firebase save failed:', err.message);
    } finally {
      running = null;
      if (again) { again = false; scheduleSave(); }
    }
  })();
}

/** Save right away (first boot seeds the database). */
export const saveNow = () => syncNow();
