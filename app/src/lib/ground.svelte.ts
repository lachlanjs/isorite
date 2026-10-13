// The ground: lapis (dark), quartz (light), or the system's. Kept in this browser and set on the page's root
// before first paint (app.html).

export type Ground = "" | "lapis" | "quartz";

class GroundChoice {
  chosen = $state<Ground>((typeof document === "undefined" ? "" : document.documentElement.dataset.ground ?? "") as Ground);

  choose(ground: Ground): void {
    this.chosen = ground;
    if (ground) document.documentElement.dataset.ground = ground; else delete document.documentElement.dataset.ground;
    try { if (ground) localStorage.setItem("isorite.ground", ground); else localStorage.removeItem("isorite.ground"); } catch { /* not kept */ }
  }
}

export const ground = new GroundChoice();
export const GROUNDS: [Ground, string][] = [["", "the system's"], ["lapis", "lapis"], ["quartz", "quartz"]];
