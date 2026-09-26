#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generatePack } from "./generate.js";
import { validatePack } from "./validate.js";

const HELP = `dugout packs

  generate [--seed <seed>] [--out <file>]   Generate the fictional pack (default seed "fictional-v1")
  validate [<file>]                          Validate a pack JSON (default: fictional-v1.json)
  build <input.csv> --out <file>             CSV -> private pack (Phase 5)
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
    case "build":
      out("build: CSV -> pack converter arrives in Phase 5 (§5.6).");
      return 1;
    default:
      out(HELP);
      return cmd === undefined || cmd === "help" ? 0 : 2;
  }
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2));
}
