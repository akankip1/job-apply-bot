#!/usr/bin/env node
// Reads URLs from the clipboard and merges them (deduplicated) into jobs.txt.
// Usage: node scripts/add-tabs-to-jobs.js [--person <name>]

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const URL_RE = /https?:\/\/(?:(?!https?:\/\/)[^\s,"<>])+/g;

function parseArgs(args) {
  const idx = args.indexOf("--person");
  if (idx === -1) throw new Error("--person <name> is required.");
  const name = args[idx + 1];
  if (!name || name.startsWith("--")) throw new Error("--person requires a name argument.");
  return name;
}

function readClipboard() {
  try {
    if (process.platform === "win32") {
      return execSync("powershell -command Get-Clipboard", { encoding: "utf8" });
    }
    if (process.platform === "darwin") {
      return execSync("pbpaste", { encoding: "utf8" });
    }
    // Linux: try xclip or xsel
    try {
      return execSync("xclip -selection clipboard -o", { encoding: "utf8" });
    } catch {
      return execSync("xsel --clipboard --output", { encoding: "utf8" });
    }
  } catch {
    return "";
  }
}

const person = parseArgs(process.argv.slice(2));
const DATA_DIR = path.join(ROOT, "people", person);
const jobsFile = path.join(DATA_DIR, "jobs.txt");

if (!fs.existsSync(jobsFile)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(jobsFile, "# Add one job application URL per line.\n", "utf8");
}

const existingText = fs.readFileSync(jobsFile, "utf8");
const comments = existingText.split(/\r?\n/).filter((l) => l.trim().startsWith("#"));
const existingUrls = [...(existingText.match(URL_RE) || [])];

const clipboardText = readClipboard();
const newUrls = [...(clipboardText.match(URL_RE) || [])];

const allUrls = [...new Set([...existingUrls, ...newUrls].map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u)))].sort();

const output = [...comments, "", ...allUrls].join("\n") + "\n";
fs.writeFileSync(jobsFile, output, "utf8");

const addedCount = newUrls.filter((u) => !existingUrls.includes(u)).length;
console.log(`Added URLs from clipboard to ${jobsFile}`);
console.log(`New URLs found:    ${addedCount}`);
console.log(`Total unique URLs: ${allUrls.length}`);
