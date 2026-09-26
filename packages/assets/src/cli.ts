import { validateManifest } from "./index.js";

const { errors, warnings } = validateManifest();
for (const w of warnings) console.warn(`warn: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(errors.length ? `asset manifest: ${errors.length} error(s)` : "asset manifest: OK");
process.exit(errors.length ? 1 : 0);
