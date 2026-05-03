#!/usr/bin/env node
// Reads the latest (or specified) job-status.json and updates jobs.txt,
// applied_jobs.txt, failed_jobs.txt, skipped_jobs.txt accordingly.
// Usage: node scripts/mark-run-results.js [--person <name>] [--status-file <path>]

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(args) {
  const result = { person: null, statusFile: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--person" && args[i + 1]) result.person = args[++i];
    if (args[i] === "--status-file" && args[i + 1]) result.statusFile = args[++i];
  }
  return result;
}

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/);
}

function writeLines(filePath, lines) {
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    if (line.trim().startsWith("#")) {
      out.push(line);
    } else if (line.trim()) {
      const t = line.trim();
      if (!seen.has(t)) {
        out.push(t);
        seen.add(t);
      }
    }
  }
  fs.writeFileSync(filePath, out.join("\n") + (out.length ? "\n" : ""), "utf8");
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
const DATA_DIR = person ? path.join(ROOT, "people", person) : ROOT;

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

const jobsFile = path.join(DATA_DIR, "jobs.txt");
const appliedFile = path.join(DATA_DIR, "applied_jobs.txt");
const failedFile = path.join(DATA_DIR, "failed_jobs.txt");
const skippedFile = path.join(DATA_DIR, "skipped_jobs.txt");

let jobsLines = readLines(jobsFile);
let appliedLines = readLines(appliedFile);
let failedLines = readLines(failedFile);
let skippedLines = readLines(skippedFile);

let removedFromJobs = 0;
let addedToApplied = 0;
let addedToFailed = 0;
let addedToSkipped = 0;
const unknownBuckets = [];

for (const res of results) {
  const url = String(res.url || "").trim();
  const bucket = res.bucket;
  if (!url) continue;

  const before = jobsLines.length;
  jobsLines = jobsLines.filter((line) => line.trim() !== url);
  if (jobsLines.length < before) removedFromJobs++;

  appliedLines = appliedLines.filter((line) => line.trim() !== url);
  failedLines = failedLines.filter((line) => line.trim() !== url);
  skippedLines = skippedLines.filter((line) => line.trim() !== url);

  if (bucket === "applied") { appliedLines.push(url); addedToApplied++; }
  else if (bucket === "failed") { failedLines.push(url); addedToFailed++; }
  else if (bucket === "skipped") { skippedLines.push(url); addedToSkipped++; }
  else unknownBuckets.push(bucket);
}

writeLines(jobsFile, jobsLines);
writeLines(appliedFile, appliedLines);
writeLines(failedFile, failedLines);
writeLines(skippedFile, skippedLines);

const remaining = readLines(jobsFile).filter((l) => l.trim() && !l.trim().startsWith("#")).length;

console.log("--------------------------------");
console.log(`Results read:               ${results.length}`);
console.log(`Removed from jobs.txt:      ${removedFromJobs}`);
console.log(`Added to applied_jobs.txt:  ${addedToApplied}`);
console.log(`Added to failed_jobs.txt:   ${addedToFailed}`);
console.log(`Added to skipped_jobs.txt:  ${addedToSkipped}`);
console.log(`Remaining in queue:         ${remaining}`);
if (unknownBuckets.length) {
  console.warn(`Unknown buckets: ${[...new Set(unknownBuckets)].join(", ")}`);
}
