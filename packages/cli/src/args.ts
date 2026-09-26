export type Command = "sim-game" | "bot-arena" | "help";

export interface CliOptions {
  readonly command: Command;
  readonly seed: string;
  readonly games: number;
  readonly json: boolean;
  readonly level: number;
  readonly stadium: string;
  readonly pack: string | undefined;
}

export const DEFAULT_OPTIONS: CliOptions = {
  command: "help",
  seed: "dev",
  games: 1,
  json: false,
  level: 7,
  stadium: "DOME",
  pack: undefined,
};

/** Tiny argv parser: `dugout <command> [--seed X] [--games N] [--json]`. */
export function parseArgs(argv: readonly string[]): CliOptions {
  let opts: CliOptions = DEFAULT_OPTIONS;
  const rest = [...argv];
  const first = rest.shift();
  if (first === "sim-game" || first === "bot-arena" || first === "help") {
    opts = { ...opts, command: first };
  } else if (first !== undefined && !first.startsWith("--")) {
    throw new Error(`Unknown command: ${first}`);
  } else if (first !== undefined) {
    rest.unshift(first);
  }

  while (rest.length > 0) {
    const flag = rest.shift() as string;
    if (flag === "--") continue; // pnpm/npm pass-through separator
    switch (flag) {
      case "--seed": {
        const v = rest.shift();
        if (v === undefined) throw new Error("--seed requires a value");
        opts = { ...opts, seed: v };
        break;
      }
      case "--games": {
        const v = Number(rest.shift());
        if (!Number.isInteger(v) || v <= 0) throw new Error("--games requires a positive integer");
        opts = { ...opts, games: v };
        break;
      }
      case "--json":
        opts = { ...opts, json: true };
        break;
      case "--level": {
        const v = Number(rest.shift());
        if (!Number.isInteger(v) || v < 1 || v > 12) throw new Error("--level requires an integer 1..12");
        opts = { ...opts, level: v };
        break;
      }
      case "--stadium": {
        const v = rest.shift();
        if (v === undefined) throw new Error("--stadium requires a value");
        opts = { ...opts, stadium: v };
        break;
      }
      case "--pack": {
        const v = rest.shift();
        if (v === undefined) throw new Error("--pack requires a value");
        opts = { ...opts, pack: v };
        break;
      }
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }
  return opts;
}

export const HELP = `dugout — Dugout Tactics CLI

Usage:
  dugout sim-game  --seed <seed> [--games N] [--level L] [--stadium ID] [--pack file] [--json]
                   One game prints a box score; --games N prints aggregate stats.
  dugout bot-arena --games <n> --seed <seed>   Run n bot-vs-bot tournaments and print the balance report (Phase 2)
  dugout help
`;
