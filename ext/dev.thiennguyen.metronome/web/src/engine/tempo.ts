// Words about a tempo, and tapping one in.

/** The Italian marking a tempo is usually written as. Bands overlap in
 *  every reference; these are cut where most of them agree. */
const MARKINGS: [number, string][] = [
  [40, "Grave"],
  [60, "Largo"],
  [66, "Larghetto"],
  [76, "Adagio"],
  [108, "Andante"],
  [120, "Moderato"],
  [156, "Allegro"],
  [176, "Vivace"],
  [200, "Presto"],
  [Infinity, "Prestissimo"],
];

/** The marking for `bpm` beats of `unit` notes a minute, judged in quarter
 *  notes as the bands are: 6/8 at 240 eighths is Moderato, not Prestissimo. */
export function marking(bpm: number, unit: 2 | 4 | 8 | 16): string {
  const quarters = (bpm * 4) / unit;
  return MARKINGS.find(([below]) => quarters < below)![1];
}

/** Presses averaged into a tempo: the last four gaps, forgotten after two
 *  seconds of nothing, so a new tap starts a new count. */
export class Tapper {
  private taps: number[] = [];

  tap(at = performance.now()): number | null {
    const last = this.taps[this.taps.length - 1];
    if (last !== undefined && at - last > 2000) this.taps = [];
    this.taps.push(at);
    if (this.taps.length > 5) this.taps.shift();
    if (this.taps.length < 2) return null;
    const gaps = this.taps.slice(1).map((t, i) => t - this.taps[i]!);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    return 60000 / mean;
  }

  get count(): number {
    return this.taps.length;
  }
}

/** The signatures offered as chips; 9/8 and the rest are Other's. */
export const SIGNATURES: { beats: number; unit: 2 | 4 | 8 | 16 }[] = [
  { beats: 2, unit: 4 },
  { beats: 3, unit: 4 },
  { beats: 4, unit: 4 },
  { beats: 5, unit: 4 },
  { beats: 6, unit: 8 },
  { beats: 7, unit: 8 },
  { beats: 12, unit: 8 },
];

export const SUBDIVISIONS: { sub: 1 | 2 | 3 | 4; label: string; name: string }[] = [
  { sub: 1, label: "♩", name: "Quarter notes" },
  { sub: 2, label: "♫", name: "Eighth notes" },
  { sub: 3, label: "3", name: "Triplets" },
  { sub: 4, label: "𝅘𝅥𝅯𝅘𝅥𝅯", name: "Sixteenth notes" },
];
