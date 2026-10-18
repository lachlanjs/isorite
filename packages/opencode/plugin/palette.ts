// The boards' two grounds (`isorite.css` on the mood board): lapis, dark, and quartz, light.

export const lapis = {
  g0: "#07101C", g1: "#0C1828", g2: "#122238", g3: "#1A3150", line: "#23395A", ls: "#5C7BA6",
  text: "#E9EEF5", soft: "#B4C0D2", faint: "#8796AD",
  lattice: "#6BA6FF", growth: "#F0BE4A", mal: "#5FD3A4", rose: "#FF8FA6",
} as const;

export const quartz = {
  g0: "#F2F0EA", g1: "#F8F7F3", g2: "#FFFFFF", g3: "#E6E4DC", line: "#D3D0C5", ls: "#7F7D70",
  text: "#0E1726", soft: "#3B475B", faint: "#5B677A",
  lattice: "#1E4FB8", growth: "#8C6200", mal: "#0B6B4A", rose: "#A81E48",
} as const;

export type Swatch = keyof typeof lapis;
