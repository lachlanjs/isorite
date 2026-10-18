import { describe, expect, it } from "vitest"
import { height, lines, rows, shapes, width } from "../src/logo.ts"

describe("the mark", () => {
  it("has the board's 31 shapes, each on the grid and none on another", () => {
    expect(shapes).toHaveLength(31)
    const at = new Set(shapes.map((shape) => `${shape.x},${shape.y}`))
    expect(at.size).toBe(31)
    for (const shape of shapes) {
      expect(shape.x).toBeGreaterThanOrEqual(0)
      expect(shape.x).toBeLessThan(width)
      expect(shape.y).toBeGreaterThanOrEqual(0)
      expect(shape.y).toBeLessThan(height)
    }
  })

  it("is 20 cells by 15 rows in both styles", () => {
    for (const style of ["legacy", "simple"] as const) {
      const drawn = lines(style)
      expect(drawn).toHaveLength(15)
      for (const line of drawn) expect([...line]).toHaveLength(20)
    }
  })

  it("is gold in its top two rows only", () => {
    rows().forEach((runs, y) => {
      const gold = runs.some((run) => run.growth && run.text.trim())
      expect(gold).toBe(y < 2)
    })
  })

  it("draws the trunk as whole blocks in the middle column", () => {
    for (const line of lines().slice(12)) expect(line).toBe("          ██        ")
  })
})
