import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const JS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../static/js");

/**
 * Skrip di static/js adalah skrip klasik (bukan modul ES): ia memakai `const RS = ...`
 * atau menempel ke `window`. Helper ini menjalankannya di dalam lingkungan jsdom dan
 * mengembalikan nama-nama yang diminta, tanpa mengubah kode sumbernya.
 *
 *   const { RS } = loadScript("research-state.js", ["RS"]);
 */
export function loadScript(file, names = []) {
  const src = fs.readFileSync(path.join(JS_DIR, file), "utf8");
  const run = new Function(`${src}\n;return { ${names.join(", ")} };`);
  return run();
}
