#!/usr/bin/env node
import { ENGINE_VERSION, STADIUMS, buildSchedule } from "@dugout/engine";
import { runSimGame } from "./simGame.js";
import { HELP, parseArgs } from "./args.js";

export function run(argv: readonly string[], out: (line: string) => void = console.log): number {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    out(`error: ${(err as Error).message}`);
    out(HELP);
    return 2;
  }

  switch (opts.command) {
    case "help":
      out(HELP);
      return 0;
    case "sim-game": {
      if (!(opts.stadium in STADIUMS)) {
        out(`error: unknown stadium ${opts.stadium}. One of ${Object.keys(STADIUMS).join(", ")}`);
        return 2;
      }
      return runSimGame({ seed: opts.seed, games: opts.games, level: opts.level, stadium: opts.stadium as keyof typeof STADIUMS, pack: opts.pack, json: opts.json }, out);
    }
    case "bot-arena": {
      // Phase 2 will replace this with the real arena.
      const schedule = buildSchedule();
      out(`engine ${ENGINE_VERSION} · ${opts.games} games · seed "${opts.seed}" · ${schedule.length} rounds per run`);
      out("bot-arena: not implemented yet (Phase 2).");
      return 1;
    }
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split("/").pop() as string);
if (isMain) {
  process.exitCode = run(process.argv.slice(2));
}
