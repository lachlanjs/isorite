// Numbers as an artifact reads them out.

/** A number for reading: a fixed number of digits when asked, else three significant figures, in scientific form
 *  when very small or large (2.3×10⁻³). */
export function format(x: number, digits = -1): string {
  if (typeof x !== "number" || Number.isNaN(x)) return "–";
  if (!Number.isFinite(x)) return x > 0 ? "∞" : "−∞";
  if (digits >= 0) return x.toFixed(digits).replace("-", "−");
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a >= 1e-3 && a < 1e6) {
    if (Number.isInteger(x)) return String(x).replace("-", "−");
    return String(+x.toPrecision(3)).replace("-", "−");
  }
  const [m, e] = x.toExponential(2).split("e") as [string, string];
  const sup = (s: string) => s.replace(/[-+\d]/g, (c) => ({ "-": "⁻", "+": "" } as Record<string, string>)[c] ?? "⁰¹²³⁴⁵⁶⁷⁸⁹"[+c]!);
  return `${String(+m).replace("-", "−")}×10${sup(String(+e))}`;
}

/** One number from a column: min, max, mean, sum, count, first or last. */
export function aggregate(values: unknown[], of: string): number {
  const ns = values.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  switch (of) {
    case "min": return ns.length ? Math.min(...ns) : NaN;
    case "max": return ns.length ? Math.max(...ns) : NaN;
    case "mean": return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : NaN;
    case "sum": return ns.reduce((a, b) => a + b, 0);
    case "count": return values.length;
    case "first": return typeof values[0] === "number" ? values[0] : NaN;
    default: return typeof values.at(-1) === "number" ? (values.at(-1) as number) : NaN;
  }
}
