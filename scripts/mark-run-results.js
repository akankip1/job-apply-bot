#!/usr/bin/env node
// Reads the latest (or specified) job-status.json and updates local tracking files.
// Usage: node scripts/mark-run-results.js [--person <name>] [--status-file <path>]

const fs = require("fs");
const path = require("path");
const { reconcileRunResults } = require("../lib/runResults");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(args) {
  const result = { person: null, statusFile: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--person" && args[i + 1]) result.person = args[++i];
    if (args[i] === "--status-file" && args[i + 1]) result.statusFile = args[++i];
  }
  if (!result.person) throw new Error("--person <name> is required.");
  return result;
}

function findLatestStatusFile(dataDir) {
  const runsDir = path.join(dataDir, "runs");
  if (!fs.existsSync(runsDir)) return null;
  const candidates = [];
  for (const entry of fs.readdirSync(runsDir)) {
    const candidate = path.join(runsDir, entry, "job-status.json");
    if (fs.existsSync(candidate)) {
      candidates.push({ path: candidate, mtime: fs.statSync(candidate).mtimeMs });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].path;
}

const { person, statusFile: argStatusFile } = parseArgs(process.argv.slice(2));
const DATA_DIR = path.join(ROOT, "people", person);

const statusFile = argStatusFile || findLatestStatusFile(DATA_DIR);
if (!statusFile || !fs.existsSync(statusFile)) {
  console.error("Could not find a job-status.json. Specify one with --status-file or run the bot first.");
  process.exitCode = 1;
  process.exit();
}

console.log(`Marking results from: ${statusFile}`);

const data = JSON.parse(fs.readFileSync(statusFile, "utf8"));
const results = data.results || [];
if (!results.length) {
  console.log("No results found in status file.");
  process.exit(0);
}

const summary = reconcileRunResults(DATA_DIR, results, { sourceStatusFile: statusFile });

console.log("--------------------------------");
console.log(`Results read:               ${results.length}`);
console.log(`Dry runs kept eligible:     ${summary.counts.dry_run}`);
console.log(`Processed as applied:       ${summary.counts.applied}`);
console.log(`Processed as blocked:       ${summary.counts.blocked}`);
console.log(`Processed as unverified:    ${summary.counts.unverified}`);
console.log(`Processed as failed:        ${summary.counts.failed}`);
console.log(`Processed as skipped:       ${summary.counts.skipped}`);
console.log(`Remaining in queue:         ${summary.remainingQueued}`);
if (summary.unknownStatuses.length) {
  console.error(`Unknown statuses left queued: ${summary.unknownStatuses.join(", ")}`);
  process.exitCode = 1;
}
