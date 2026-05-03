#!/usr/bin/env node
// Runs `node --check` on every .js source file in the project.
// Exit code 1 if any file fails.

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIRS = [".", "lib", "platforms", "scripts"];
const SELF = path.basename(__filename);

const files = SOURCE_DIRS.flatMap((dir) =>
  fs
    .readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith(".js") && f !== SELF)
    .map((f) => path.relative(ROOT, path.join(ROOT, dir, f)))
);

let failures = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { cwd: ROOT, stdio: "pipe" });
    console.log(`  ok  ${file}`);
  } catch (err) {
    console.error(`FAIL  ${file}`);
    console.error((err.stderr || err.stdout || "").toString().trim());
    failures++;
  }
}

console.log(failures ? `\n${failures} file(s) failed.` : `\nAll ${files.length} files OK.`);
process.exitCode = failures ? 1 : 0;
