import { expect, test } from "vitest";
import { findSymbol, hasSymbols } from "../src/symbol.ts";

const PY = `import math

@jit
def leapfrog(x, v, a, dt):
    """One step."""
    v = v + 0.5 * dt * a(x)
    return x, v


class Body:
    def __init__(self):
        self.x = 0

    def step(
        self,
        dt,
    ):
        self.x += dt  # { not a brace

    async def later(self):
        pass


def after():
    pass
`;

test("a Python function is its decorators, signature and body; a method is found inside its class", () => {
  expect(findSymbol(PY, "sim.py", "leapfrog")).toEqual({ start: 3, end: 7, count: 1 });
  expect(findSymbol(PY, "sim.py", "Body")).toEqual({ start: 10, end: 21, count: 1 });
  expect(findSymbol(PY, "sim.py", "Body.step")).toEqual({ start: 14, end: 18, count: 1 });
  expect(findSymbol(PY, "sim.py", "Body.later")).toEqual({ start: 20, end: 21, count: 1 });
  expect(findSymbol(PY, "sim.py", "after")).toEqual({ start: 24, end: 25, count: 1 });
  expect(findSymbol(PY, "sim.py", "step")).toBeNull(); // not at the top level
  expect(findSymbol(PY, "sim.py", "Body.nope")).toBeNull();
});

const TS = `import x from "y";

/** Adds. */
export function add(a: number, b: number): number {
  const s = "}"; // } in a string
  return a + b;
}

export const twice = (n: number): number => {
  return n * 2;
};

export class Counter<T> {
  private n = 0;
  /** Bump it. */
  increment(by = 1): void {
    this.n += by; // {
  }
  static make(): Counter<number> { return new Counter(); }
}

function main() { return add(1, 2); }
`;

test("braces: functions, arrow functions, classes and their methods; calls and braces in strings are not declarations", () => {
  expect(findSymbol(TS, "a.ts", "add")).toEqual({ start: 3, end: 7, count: 1 });
  expect(findSymbol(TS, "a.ts", "twice")).toEqual({ start: 9, end: 11, count: 1 });
  expect(findSymbol(TS, "a.ts", "Counter")).toEqual({ start: 13, end: 20, count: 1 });
  expect(findSymbol(TS, "a.ts", "Counter.increment")).toEqual({ start: 15, end: 18, count: 1 });
  expect(findSymbol(TS, "a.ts", "Counter.make")).toEqual({ start: 19, end: 19, count: 1 });
  expect(findSymbol(TS, "a.ts", "main")).toEqual({ start: 22, end: 22, count: 1 });
});

test("Go and Rust declarations", () => {
  const go = "package p\n\nfunc (s *Server) Serve(addr string) error {\n\treturn nil\n}\n\nfunc Run() {\n}\n";
  expect(findSymbol(go, "s.go", "Serve")).toEqual({ start: 3, end: 5, count: 1 });
  expect(findSymbol(go, "s.go", "Run")).toEqual({ start: 7, end: 8, count: 1 });
  const rs = "/// Docs.\n#[inline]\npub fn step(x: f64) -> f64 {\n    x\n}\n\nimpl Body {\n    pub fn kick(&mut self) {\n    }\n}\n";
  expect(findSymbol(rs, "b.rs", "step")).toEqual({ start: 1, end: 5, count: 1 });
  expect(findSymbol(rs, "b.rs", "Body.kick")).toEqual({ start: 8, end: 9, count: 1 });
});

test("a name declared twice is counted; a language without support has none", () => {
  expect(findSymbol("def f():\n    pass\ndef f():\n    pass\n", "a.py", "f")).toEqual({ start: 1, end: 2, count: 2 });
  expect(hasSymbols("a.ts")).toBe(true);
  expect(hasSymbols("a.rb")).toBe(false);
  expect(findSymbol("def f; end", "a.rb", "f")).toBeNull();
});
