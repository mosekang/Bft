import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PackSchema } from "@dugout/protocol";
import { startNodeServer } from "./node.js";

const require = createRequire(import.meta.url);
const pack = PackSchema.parse(JSON.parse(readFileSync(require.resolve("@dugout/packs/fictional-v1.json"), "utf8")));
const port = Number(process.env["PORT"] ?? 8787);
startNodeServer(pack, port, process.env["HOST"] ?? "127.0.0.1");
console.log(`dugout room server (node) listening on ${port}`);
