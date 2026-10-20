// What you chose of Iso's context (I3, Q9), and how able a model it is asked with (Q8): set in the context panel
// (ContextCount.svelte), and sent with every request in a note. The choice is per note: the parts switched off
// (earlier exchanges, notes it links to) and whether Iso may look up more. The tier is one for all. Remembered in
// this browser.

import type { Choice, Tier } from "@isorite/engine";

const TIERS: Tier[] = ["low", "mid", "max"];
const read = <T>(key: string, fallback: T, ok: (v: unknown) => v is T): T => {
  try { const v = JSON.parse(localStorage.getItem(key) ?? "null") as unknown; return ok(v) ? v : fallback; } catch { return fallback; }
};
const keep = (key: string, value: unknown): void => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not kept */ } };

class ContextChoices {
  tier = $state<Tier>(read<Tier>("isorite.tier.v2", "mid", (v): v is Tier => TIERS.includes(v as Tier)));
  private choices = $state<Record<string, Choice>>(read<Record<string, Choice>>("isorite.context", {}, (v): v is Record<string, Choice> => typeof v === "object" && v !== null));

  /** The choice for a note: nothing switched off and look-ups on, until you say otherwise. */
  of(note: string): Choice { return this.choices[note] ?? {}; }

  /** Switch one part on or off. */
  toggle(note: string, id: string): void {
    const now = this.of(note), off = now.off ?? [];
    this.set(note, { ...now, off: off.includes(id) ? off.filter((x) => x !== id) : [...off, id] });
  }
  setLookup(note: string, on: boolean): void { this.set(note, { ...this.of(note), lookup: on }); }
  setTier(tier: Tier): void { this.tier = tier; keep("isorite.tier.v2", tier); }

  private set(note: string, choice: Choice): void {
    const clean: Choice = { ...(choice.off?.length ? { off: choice.off } : {}), ...(choice.lookup === false ? { lookup: false } : {}) };
    const next = { ...this.choices };
    if (Object.keys(clean).length) next[note] = clean; else delete next[note];
    this.choices = next;
    keep("isorite.context", next);
  }
}

export const context = new ContextChoices();
