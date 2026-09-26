#!/usr/bin/env node
import { ENGINE_VERSION, buildSchedule, createRng } from "@dugout/engine";
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
      // Phase 1 will replace this with the real simulator.
      const rng = createRng(opts.seed).fork("game");
      out(`engine ${ENGINE_VERSION} · seed "${opts.seed}" · rng check ${rng.next().toFixed(6)}`);
      out("sim-game: not implemented yet (Phase 1).");
      return 1;
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
