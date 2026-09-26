#!/usr/bin/env node
import { ENGINE_VERSION, STADIUMS, botArena } from "@dugout/engine";
import { loadPack, runSimGame } from "./simGame.js";
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
      const pack = loadPack(opts.pack);
      const t0 = performance.now();
      const report = botArena({ games: opts.games, seed: opts.seed, pack });
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      if (opts.json) {
        out(JSON.stringify(report, null, 2));
        return report.ok ? 0 : 1;
      }
      out(`engine ${ENGINE_VERSION} · bot-arena · ${report.games} runs · seed "${report.seed}" · pack ${pack.id} · ${secs}s`);
      out("");
      for (const m of report.metrics) out(`${m.ok ? "OK " : "OUT"} ${m.key.padEnd(28)} ${String(m.value).padEnd(22)} target ${m.target}${m.suspects ? `  ← ${m.suspects.join(", ")}` : ""}`);
      out("");
      out(`archetype avg placement: ${Object.entries(report.archetypePlacement).map(([k, v]) => `${k}=${v}`).join("  ")}`);
      out(`stadium avg placement:   ${Object.entries(report.stadiumPlacement).map(([k, v]) => `${k}=${v.avg}(${v.picks})`).join("  ")}`);
      out(`augment avg placement:   ${Object.entries(report.augmentPlacement).sort((a, b) => a[1].avg - b[1].avg).map(([k, v]) => `${k}=${v.avg}(${v.picks})`).join("  ")}`);
      out(`top winner combos:       ${report.topSynergyCombos.map((c) => `${c.combo}:${c.share}`).join("  ")}`);
      out(`synergy share in winners: ${Object.entries(report.synergyShareInWinners).map(([k, v]) => `${k}=${v}`).join("  ")}`);
      return report.ok ? 0 : 1;
    }
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split("/").pop() as string);
if (isMain) {
  process.exitCode = run(process.argv.slice(2));
}
