import { cpSync, mkdirSync, rmSync } from "node:fs";

const SITE_FILES = ["index.html", "style.css", "app.js", "piercing.js"];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
for (const file of SITE_FILES) {
  cpSync(file, `dist/${file}`);
}
console.log(`dist: ${SITE_FILES.join(", ")}`);
