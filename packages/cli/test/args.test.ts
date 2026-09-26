import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/args.js";
import { run } from "../src/index.js";

describe("parseArgs", () => {
  it("defaults to help", () => {
    expect(parseArgs([]).command).toBe("help");
  });

  it("parses command and flags", () => {
    expect(parseArgs(["bot-arena", "--games", "50", "--seed", "abc", "--json", "--level", "8"])).toEqual({
      command: "bot-arena",
      games: 50,
      seed: "abc",
      json: true,
      level: 8,
      stadium: "DOME",
      pack: undefined,
    });
  });

  it("rejects unknown commands and flags", () => {
    expect(() => parseArgs(["fly"])).toThrow(/Unknown command/);
    expect(() => parseArgs(["sim-game", "--wat"])).toThrow(/Unknown flag/);
    expect(() => parseArgs(["sim-game", "--games", "-1"])).toThrow(/positive integer/);
    expect(() => parseArgs(["sim-game", "--seed"])).toThrow(/requires a value/);
  });
});

describe("run", () => {
  const capture = () => {
    const lines: string[] = [];
    return { lines, out: (l: string) => lines.push(l) };
  };

  it("prints help with exit code 0", () => {
    const c = capture();
    expect(run(["help"], c.out)).toBe(0);
    expect(c.lines.join("\n")).toContain("bot-arena");
  });

  it("returns 2 on bad input", () => {
    const c = capture();
    expect(run(["nope"], c.out)).toBe(2);
    expect(c.lines[0]).toMatch(/error/);
  });

  it("sim-game is deterministic per seed and prints a box score", () => {
    const a = capture();
    const b = capture();
    expect(run(["sim-game", "--seed", "x"], a.out)).toBe(0);
    run(["sim-game", "--seed", "x"], b.out);
    expect(a.lines).toEqual(b.lines);
    expect(a.lines.join("\n")).toContain("하이라이트");
    expect(run(["sim-game", "--seed", "x", "--stadium", "NOPE"], capture().out)).toBe(2);
    expect(run(["bot-arena", "--games", "3"], capture().out)).toBe(1);
  });

  it("sim-game aggregates many games", () => {
    const c = capture();
    expect(run(["sim-game", "--seed", "agg", "--games", "20", "--json"], c.out)).toBe(0);
    const report = JSON.parse(c.lines.join("\n"));
    expect(report.games).toBe(20);
  });
});
