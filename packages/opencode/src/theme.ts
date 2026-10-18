// The lapis and quartz grounds as an OpenCode theme: lapis when the terminal is dark,
// quartz when it is light.

import { lapis, quartz, type Swatch } from "../plugin/palette.ts";

// Each of OpenCode's theme keys, and the board colour it takes.
const roles: Record<string, Swatch> = {
  primary: "lattice", secondary: "growth", accent: "growth",
  error: "rose", warning: "growth", success: "mal", info: "lattice",
  text: "text", textMuted: "faint",
  background: "g0", backgroundPanel: "g1", backgroundElement: "g2",
  border: "ls", borderActive: "lattice", borderSubtle: "line",
  diffAdded: "mal", diffRemoved: "rose", diffContext: "soft", diffHunkHeader: "faint",
  diffHighlightAdded: "mal", diffHighlightRemoved: "rose",
  diffAddedBg: "g2", diffRemovedBg: "g2", diffContextBg: "g1", diffLineNumber: "faint",
  diffAddedLineNumberBg: "g2", diffRemovedLineNumberBg: "g2",
  markdownText: "text", markdownHeading: "text", markdownLink: "lattice", markdownLinkText: "lattice",
  markdownCode: "growth", markdownBlockQuote: "soft", markdownEmph: "text", markdownStrong: "text",
  markdownHorizontalRule: "line", markdownListItem: "soft", markdownListEnumeration: "faint",
  markdownImage: "lattice", markdownImageText: "soft", markdownCodeBlock: "text",
  syntaxComment: "faint", syntaxKeyword: "lattice", syntaxFunction: "growth", syntaxVariable: "text",
  syntaxString: "mal", syntaxNumber: "growth", syntaxType: "lattice", syntaxOperator: "soft", syntaxPunctuation: "faint",
};

/** The theme file OpenCode reads from `themes/isorite.json`. */
export function theme(): object {
  const defs: Record<string, string> = {};
  for (const [swatch, colour] of Object.entries(lapis)) defs[`lapis-${swatch}`] = colour;
  for (const [swatch, colour] of Object.entries(quartz)) defs[`quartz-${swatch}`] = colour;
  const roleColours: Record<string, { dark: string; light: string }> = {};
  for (const [role, swatch] of Object.entries(roles)) roleColours[role] = { dark: `lapis-${swatch}`, light: `quartz-${swatch}` };
  return { $schema: "https://opencode.ai/theme.json", defs, theme: roleColours };
}
