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

/** Code in colour (the default) or in ink, as on the boards (M19). Kept in this browser, set on the root before first
 *  paint as the ground is. */
export type CodeLook = "" | "ink";

class CodeChoice {
  chosen = $state<CodeLook>((typeof document === "undefined" ? "" : document.documentElement.dataset.code ?? "") as CodeLook);

  choose(look: CodeLook): void {
    this.chosen = look;
    if (look) document.documentElement.dataset.code = look; else delete document.documentElement.dataset.code;
    try { if (look) localStorage.setItem("isorite.code", look); else localStorage.removeItem("isorite.code"); } catch { /* not kept */ }
  }
}

export const codeLook = new CodeChoice();
export const CODE_LOOKS: [CodeLook, string][] = [["", "in colour"], ["ink", "in ink"]];
