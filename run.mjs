#!/usr/bin/env node
// One-shot run: node run.mjs  (the server also runs this on open and on a schedule).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./lib/llm.mjs";
import { runPipeline } from "./lib/pipeline.mjs";
import { runExtras } from "./lib/extras.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
loadEnv(HERE);
const log = (m) => console.log(m);
const r = await runPipeline({ dir: HERE, log });
const extraErrors = await runExtras({ dir: HERE, log });
for (const e of extraErrors) console.log("LỖI: " + e);
console.log("Xong: +" + r.added + " bài, " + (r.errors.length + extraErrors.length) + " lỗi, " + Math.round(r.ms / 1000) + "s");
