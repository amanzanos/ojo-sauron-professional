import type { StoreZone, ZoneStats } from '../types/analysis';
import type { TrackedPerson } from './PersonTracker';

interface ZoneAccum {
  totalVisits: number;
  totalDwellMs: number;
}

/**
 * Anonymous, aggregate occupancy/dwell-time analytics per store-owner-drawn zone. Deliberately
 * has no notion of "which person visited which zone" beyond the current tick — only ever
 * accumulates counts/durations, never a per-person history, so this can't be turned into a
 * per-customer profile even by accident.
 */
export class ZoneAnalyticsEngine {
  private zones: StoreZone[] = [];
  private accum: Record<string, ZoneAccum> = {};
  private presentSince: Record<string, Record<string, number>> = {}; // zoneId -> personId -> ts entered

  setZones(zones: StoreZone[]) {
    this.zones = zones;
    zones.forEach((z) => {
      this.accum[z.id] ??= { totalVisits: 0, totalDwellMs: 0 };
      this.presentSince[z.id] ??= {};
    });
  }

  /** Restores previously-persisted totals (e.g. from localStorage) without resetting the live zone list. */
  loadStats(stats: Record<string, ZoneAccum>) {
    Object.entries(stats).forEach(([zoneId, a]) => {
      this.accum[zoneId] = { ...a };
    });
  }

  /** videoWidth/videoHeight convert person.box (raw pixel space) to the same 0-1 fraction space zones are stored in. */
  update(persons: TrackedPerson[], ts: number, videoWidth: number, videoHeight: number) {
    const currentOccupancy: Record<string, number> = {};
    if (!videoWidth || !videoHeight) return currentOccupancy;

    this.zones.forEach((zone) => {
      const inside = new Set<string>();
      persons.forEach((p) => {
        const cx = (p.box.x + p.box.width / 2) / videoWidth;
        const cy = (p.box.y + p.box.height / 2) / videoHeight;
        if (cx >= zone.x && cx <= zone.x + zone.width && cy >= zone.y && cy <= zone.y + zone.height) {
          inside.add(p.id);
        }
      });
      currentOccupancy[zone.id] = inside.size;

      const since = this.presentSince[zone.id] ?? (this.presentSince[zone.id] = {});
      inside.forEach((id) => { since[id] ??= ts; });
      Object.keys(since).forEach((id) => {
        if (inside.has(id)) return;
        const enteredAt = since[id];
        delete since[id];
        const dwell = ts - enteredAt;
        const acc = this.accum[zone.id] ?? (this.accum[zone.id] = { totalVisits: 0, totalDwellMs: 0 });
        acc.totalVisits += 1;
        acc.totalDwellMs += dwell;
      });
    });

    return currentOccupancy;
  }

  getStats(): ZoneStats[] {
    return this.zones.map((zone) => {
      const acc = this.accum[zone.id] ?? { totalVisits: 0, totalDwellMs: 0 };
      const currentOccupancy = Object.keys(this.presentSince[zone.id] ?? {}).length;
      return {
        zoneId: zone.id,
        name: zone.name,
        currentOccupancy,
        totalVisits: acc.totalVisits,
        totalDwellMs: acc.totalDwellMs,
        avgDwellMs: acc.totalVisits ? Math.round(acc.totalDwellMs / acc.totalVisits) : 0
      };
    });
  }

  getRawStats(): Record<string, ZoneAccum> {
    return this.accum;
  }

  resetStats() {
    Object.keys(this.accum).forEach((id) => { this.accum[id] = { totalVisits: 0, totalDwellMs: 0 }; });
  }
}
