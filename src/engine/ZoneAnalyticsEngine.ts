import type { StoreZone } from '../types/analysis';
import type { TrackedPerson } from './PersonTracker';

export interface ClosedZoneVisit {
  zoneId: string;
  dwellMs: number;
}

/**
 * Anonymous, live occupancy tracking per store-owner-drawn zone. Deliberately has no notion of
 * "which person visited which zone" beyond the current tick — the only output is how many people
 * are in a zone right now, and, when someone leaves, how long they were there (never who). Totals
 * are accumulated server-side (see server/schema.sql) from the closed visits this reports; this
 * engine itself keeps no running counters, so it can't drift out of sync with the backend.
 */
export class ZoneAnalyticsEngine {
  private zones: StoreZone[] = [];
  private presentSince: Record<string, Record<string, number>> = {}; // zoneId -> personId -> ts entered

  setZones(zones: StoreZone[]) {
    this.zones = zones;
    zones.forEach((z) => { this.presentSince[z.id] ??= {}; });
  }

  /** videoWidth/videoHeight convert person.box (raw pixel space) to the same 0-1 fraction space zones are stored in. */
  update(persons: TrackedPerson[], ts: number, videoWidth: number, videoHeight: number): { occupancy: Record<string, number>; closedVisits: ClosedZoneVisit[] } {
    const occupancy: Record<string, number> = {};
    const closedVisits: ClosedZoneVisit[] = [];
    if (!videoWidth || !videoHeight) return { occupancy, closedVisits };

    this.zones.forEach((zone) => {
      const inside = new Set<string>();
      persons.forEach((p) => {
        const cx = (p.box.x + p.box.width / 2) / videoWidth;
        const cy = (p.box.y + p.box.height / 2) / videoHeight;
        if (cx >= zone.x && cx <= zone.x + zone.width && cy >= zone.y && cy <= zone.y + zone.height) {
          inside.add(p.id);
        }
      });
      occupancy[zone.id] = inside.size;

      const since = this.presentSince[zone.id] ?? (this.presentSince[zone.id] = {});
      inside.forEach((id) => { since[id] ??= ts; });
      Object.keys(since).forEach((id) => {
        if (inside.has(id)) return;
        const enteredAt = since[id];
        delete since[id];
        closedVisits.push({ zoneId: zone.id, dwellMs: ts - enteredAt });
      });
    });

    return { occupancy, closedVisits };
  }
}
