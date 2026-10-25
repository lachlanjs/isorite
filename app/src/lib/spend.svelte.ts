// What Iso has cost against what may be spent (M12, step 8): asked of the server when the pane opens and after each
// reply, which asks the provider's key for its own limit at most once a minute. The key never comes here.

import type { Spend } from "@isorite/engine";
import { app } from "./app.svelte.ts";

class SpendGauge {
  value = $state.raw<Spend | null>(null);
  private started = false;

  start(): void {
    if (this.started || !app.api) return;
    this.started = true;
    void this.refresh();
    app.on((e) => { if (e.type === "iso-done" || e.type === "record") void this.refresh(); });
  }

  async refresh(): Promise<void> {
    try { this.value = await app.api.spend(); } catch { /* the bar stays as it was */ }
  }
}

export const spend = new SpendGauge();
