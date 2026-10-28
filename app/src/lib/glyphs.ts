// The kinds' glyphs (docs/taste.md's habit rule; sketch Q in inspiration/combinations/): each drawn on a 16-unit
// grid in 1.5-unit strokes, a chamfered box for what lives in the notes, other habits for what doesn't. The label, the
// file page and the Atlas draw the same ones.

export const GLYPHS = {
  concept: ["M5 2.75H13.25V11L11 13.25H2.75V5Z"],
  question: ["M8 1.75L14.25 8L8 14.25L1.75 8Z", "M8 5.75L10.25 8L8 10.25L5.75 8Z"],
  problem: ["M5 2.75H13.25V11L11 13.25H2.75V5Z", "M8.5 2.75L9.75 6.25L8.25 8.5L10 13.25"],
  folder: ["M4.25 4.25H14.25V12.25L12.25 14.25H1.75V6.75Z", "M5 1.75H9.5"],
  image: ["M4 2.75H13.25V10.5L11 12.75H2.75V4Z", "M4.5 10.5L7 7.5L8.75 9.25L10 8L11.75 10"],
  artifact: ["M5 2.75H13.25V11L11 13.25H2.75V5Z", "M2.75 5.75H13.25", "M4.75 11L7 8.5L8.75 10L11.25 7.5"],
  data: ["M5 2.75H13.25V11L11 13.25H2.75V5Z", "M2.75 6.75H13.25", "M2.75 10H13.25", "M7.5 6.75V13.25"],
  document: ["M2.75 1.75H10L13.25 5V14.25H2.75Z", "M10 1.75V5H13.25", "M5 8.25H11", "M5 11H9"],
  misc: ["M8 1.75L13.5 4.9V11.1L8 14.25L2.5 11.1V4.9Z", "M2.5 4.9L8 8L13.5 4.9", "M8 8V14.25"],
  web: ["M5.5 1.75H10.5L14.25 5.5V10.5L10.5 14.25H5.5L1.75 10.5V5.5Z", "M1.75 8H14.25", "M8 1.75V14.25"],
  code: ["M5.25 4.75L2 8L5.25 11.25", "M10.75 4.75L14 8L10.75 11.25", "M9.25 3.25L6.75 12.75"],
} as const;
export type Glyph = keyof typeof GLYPHS;

/** What a kind is called where it's named. */
export const KIND_NAMES: Record<Glyph, string> = {
  concept: "concept", question: "question", problem: "problem", folder: "folder", image: "picture", artifact: "artifact",
  data: "data", document: "document", misc: "file", web: "web", code: "code",
};
