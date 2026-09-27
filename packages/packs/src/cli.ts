#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generatePack } from "./generate.js";
import { validatePack } from "./validate.js";
import { buildPackFromCsv } from "./build.js";
import { buildPackFromRoster } from "./roster.js";
import { parseRosterCsv, parseTeamsCsv } from "./rosterCsv.js";

const HELP = `dugout packs

  generate [--seed <seed>] [--out <file>]   Generate the fictional pack (default seed "fictional-v1")
  validate [<file>]                          Validate a pack JSON (default: fictional-v1.json)
  build --hitters h.csv --pitchers p.csv --out my.json [--id my-kbo-2026] [--name "내 팩"]
                                             CSV -> private pack (never commit the output)
  roster --roster r.csv --teams t.csv --out my.json [--id my-pack] [--name "내 팩"] [--seed s]
                                             Hand-authored roster (costs + display ratings) -> private pack
`;

export function run(argv: readonly string[], out: (s: string) => void = console.log): number {
  const args = [...argv].filter((a) => a !== "--");
  const cmd = args.shift();
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const here = dirname(fileURLToPath(import.meta.url));
  const defaultPack = resolve(here, "..", "fictional-v1.json");

  switch (cmd) {
    case "generate": {
      const seed = flag("--seed") ?? "fictional-v1";
      const file = resolve(flag("--out") ?? defaultPack);
      const pack = generatePack({ seed });
      const report = validatePack(pack);
      if (!report.ok) {
        out(`generated pack failed validation:\n  ${report.errors.join("\n  ")}`);
        return 1;
      }
      writeFileSync(file, `${JSON.stringify(pack, null, 2)}\n`);
      out(`wrote ${file} (${pack.cards.length} cards, seed "${seed}")`);
      return 0;
    }
    case "validate": {
      const file = resolve(args.find((a) => !a.startsWith("--")) ?? defaultPack);
      const json: unknown = JSON.parse(readFileSync(file, "utf8"));
      const report = validatePack(json);
      out(`${report.ok ? "OK" : "FAIL"} ${file}`);
      for (const [k, v] of Object.entries(report.summary)) out(`  ${k}: ${v}`);
      for (const w of report.warnings) out(`  warning: ${w}`);
      for (const e of report.errors) out(`  error: ${e}`);
      return report.ok ? 0 : 1;
    }
    case "build": {
      const h = flag("--hitters");
      const p = flag("--pitchers");
      const file = flag("--out");
      if (!h || !p || !file) { out(HELP); return 2; }
      const id = flag("--id") ?? "private-pack";
      const pack = buildPackFromCsv(readFileSync(resolve(h), "utf8"), readFileSync(resolve(p), "utf8"), { id, name: flag("--name") ?? id });
      const report = validatePack(pack);
      writeFileSync(resolve(file), `${JSON.stringify(pack, null, 2)}\n`);
      out(`wrote ${resolve(file)} (${pack.cards.length} cards) — ${report.ok ? "valid" : "with validation notes:"}`);
      for (const e of report.errors) out(`  note: ${e}`);
      out("This pack is private (kind: private). Do not commit it.");
      return 0;
    }
    case "roster": {
      const r = flag("--roster");
      const t = flag("--teams");
      const file = flag("--out");
      if (!r || !t || !file) { out(HELP); return 2; }
      const id = flag("--id") ?? "private-roster";
      const seed = flag("--seed");
      const { pack, notes } = buildPackFromRoster(parseRosterCsv(readFileSync(resolve(r), "utf8")), parseTeamsCsv(readFileSync(resolve(t), "utf8")), {
        id,
        name: flag("--name") ?? id,
        ...(seed !== undefined ? { seed } : {}),
      });
      const report = validatePack(pack);
      writeFileSync(resolve(file), `${JSON.stringify(pack, null, 2)}\n`);
      out(`wrote ${resolve(file)} (${pack.cards.length} cards) — ${report.ok ? "valid" : "INVALID"}`);
      for (const n of notes) out(`  note: ${n}`);
      for (const w of report.warnings) out(`  warning: ${w}`);
      for (const e of report.errors) out(`  error: ${e}`);
      out("This pack is private (kind: private). Do not commit it.");
      return report.ok ? 0 : 1;
    }
    default:
      out(HELP);
      return cmd === undefined || cmd === "help" ? 0 : 2;
  }
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2));
}
