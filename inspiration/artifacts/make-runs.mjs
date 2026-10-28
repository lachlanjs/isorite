// Writes runs.csv: entropy and Huffman's average code length for a handful of sample texts, measured, not made up.
// node inspiration/artifacts/make-runs.mjs
import { writeFileSync } from "node:fs";

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (alphabet, n) => Array.from({ length: n }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join("");
const TEXTS = [
  ["pangram", "english", "the quick brown fox jumps over the lazy dog"],
  ["hamlet", "english", "to be or not to be that is the question"],
  ["lorem", "latin", "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua"],
  ["abracadabra", "word", "abracadabra"],
  ["mississippi", "word", "mississippi"],
  ["dna", "random", pick("ACGT", 120)],
  ["skewed", "random", "a".repeat(60) + "b".repeat(20) + "c".repeat(10) + "d".repeat(6) + "e".repeat(4)],
  ["base64", "random", pick("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", 160)],
  ["pi", "digits", "31415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679"],
  ["code", "python", "def surprise(p): return -log2(p)  # in bits, for a probability p"],
  ["binary", "random", pick("01", 120)],
  ["notes", "english", "a prefix code assigns each symbol a codeword so that no codeword begins another"],
];

/** Huffman's code lengths for a text's symbols: merge the two lightest, ties broken by first appearance. */
function lengths(text) {
  const counts = new Map(); for (const c of text) counts.set(c, (counts.get(c) ?? 0) + 1);
  let forest = [...counts].map(([c, w], i) => ({ w, order: i, leaves: [c] }));
  const len = new Map([...counts.keys()].map((c) => [c, 0]));
  if (forest.length === 1) len.set(forest[0].leaves[0], 1);
  while (forest.length > 1) {
    forest.sort((a, b) => a.w - b.w || a.order - b.order);
    const [a, b] = forest.splice(0, 2);
    for (const c of [...a.leaves, ...b.leaves]) len.set(c, len.get(c) + 1);
    forest.push({ w: a.w + b.w, order: Math.min(a.order, b.order), leaves: [...a.leaves, ...b.leaves] });
  }
  return { counts, len };
}
const rows = TEXTS.map(([name, source, text]) => {
  const { counts, len } = lengths(text), n = text.length;
  let H = 0, L = 0;
  for (const [c, k] of counts) { const p = k / n; H -= p * Math.log2(p); L += p * len.get(c); }
  return [name, source, n, counts.size, H.toFixed(4), L.toFixed(4)].join(",");
});
writeFileSync(new URL("runs.csv", import.meta.url), ["name,source,length,symbols,entropy,avg_length", ...rows].join("\n") + "\n");
console.log(rows.join("\n"));
