// Messages from the crew to the owner, sent from a stop ("you missed the strip behind the
// shed", "gate was locked"). Saved on that visit: job.crewNotes = [{ id, kind, text, by, at, read }].
import { lawnKey } from './lawns.js';

export const NOTE_KINDS = [
  { id: 'missed', icon: '🌱', label: 'Missed part of the lawn' },
  { id: 'access', icon: '🔒', label: 'Gate locked / no access' },
  { id: 'request', icon: '🗣️', label: 'Customer asked for something' },
  { id: 'damage', icon: '⚠️', label: 'Damage or hazard' },
  { id: 'other', icon: '💬', label: 'Other' },
];
export const noteKind = id => NOTE_KINDS.find(k => k.id === id) || NOTE_KINDS[NOTE_KINDS.length - 1];

export function newNote({ kind, text, by }, at = new Date().toISOString()) {
  const k = noteKind(kind).id;
  const body = String(text || '').trim().slice(0, 500);
  if (!body && k === 'other') return null;
  return { id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind: k, text: body, by: String(by || 'Crew').slice(0, 40), at, read: false };
}

/** Every crew message, newest first, with the visit and customer it's about. */
export const crewMessages = jobs => jobs
  .flatMap(j => (j.crewNotes || []).map(n => ({ ...n, jobId: j.id, key: lawnKey(j), address: j.address, clientName: j.clientName, techId: j.assignedTo, service: j.service })))
  .sort((a, b) => String(b.at).localeCompare(String(a.at)));

export const unreadMessages = jobs => jobs.reduce((s, j) => s + (j.crewNotes || []).filter(n => !n.read).length, 0);
