import type { CitizenEvent, NewCitizenEvent } from '../types/citizen';
import { nowId } from './math';

// Citizen reports (feed + map). Unlike the store-zone API these are public by design — anyone
// running WEROS can report or read them, so this hits /public/events (no X-API-Key) rather than
// the protected /api/* routes. Without a backend (VITE_API_URL unset) everything is kept in
// localStorage on-device instead, so the feed and map still work standalone.
const API_URL = import.meta.env.VITE_API_URL as string | undefined;
const LOCAL_KEY = 'weros.events.v1';

function apiConfigured() {
  return !!API_URL;
}

function readLocal(): CitizenEvent[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as CitizenEvent[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(events: CitizenEvent[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(events.slice(0, 300)));
  } catch (err) {
    console.error('No se pudieron guardar los eventos localmente', err);
  }
}

export async function fetchEvents(): Promise<CitizenEvent[]> {
  if (!apiConfigured()) return readLocal().sort((a, b) => b.createdAt - a.createdAt);
  const res = await fetch(`${API_URL}/public/events`);
  if (!res.ok) throw new Error(`fetchEvents failed: ${res.status}`);
  return res.json();
}

export async function createEvent(event: NewCitizenEvent): Promise<CitizenEvent> {
  if (!apiConfigured()) {
    const full: CitizenEvent = { ...event, id: nowId(), createdAt: Date.now() };
    writeLocal([full, ...readLocal()]);
    return full;
  }
  const res = await fetch(`${API_URL}/public/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });
  if (!res.ok) throw new Error(`createEvent failed: ${res.status}`);
  return res.json();
}
