#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { reconcileRunResults, statusToBucket } = require("../lib/runResults");

function readValues(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-apply-status-"));

try {
  const urls = {
    dryRun: "https://example.test/jobs/dry-run",
    submitted: "https://example.test/jobs/submitted",
    unverified: "https://example.test/jobs/unverified",
    blocked: "https://example.test/jobs/blocked",
    failed: "https://example.test/jobs/failed",
    skipped: "https://example.test/jobs/skipped",
    unknown: "https://example.test/jobs/unknown",
  };
  fs.writeFileSync(path.join(dataDir, "jobs.txt"), `${Object.values(urls).join("\n")}\n`, "utf8");

  const results = [
    { url: urls.dryRun, status: "dry_run_completed" },
    { url: urls.submitted, status: "submitted" },
    { url: urls.unverified, status: "submission_unverified" },
    { url: urls.blocked, status: "blocked" },
    { url: urls.failed, status: "failed" },
    { url: urls.skipped, status: "skipped" },
  ];
  const sourceStatusFile = path.join(dataDir, "runs", "run-1", "job-status.json");

  assert.strictEqual(statusToBucket("dry_run_completed"), "dry_run");
  assert.strictEqual(statusToBucket("submitted"), "applied");
  assert.strictEqual(statusToBucket("submission_unverified"), "unverified");
  assert.strictEqual(statusToBucket("unexpected"), null);

  let summary = reconcileRunResults(dataDir, results, { sourceStatusFile });
  assert.deepStrictEqual(summary.unknownStatuses, []);
  assert.deepStrictEqual(readValues(path.join(dataDir, "jobs.txt")).sort(), [urls.dryRun, urls.unknown].sort());
  assert.deepStrictEqual(readValues(path.join(dataDir, "dry_run_jobs.txt")), [urls.dryRun]);
  assert.deepStrictEqual(readValues(path.join(dataDir, "applied_jobs.txt")), [urls.submitted]);
  assert.deepStrictEqual(readValues(path.join(dataDir, "unverified_jobs.txt")), [urls.unverified]);
  assert.deepStrictEqual(readValues(path.join(dataDir, "blocked_jobs.txt")), [urls.blocked]);
  assert.deepStrictEqual(readValues(path.join(dataDir, "failed_jobs.txt")), [urls.failed]);
  assert.deepStrictEqual(readValues(path.join(dataDir, "skipped_jobs.txt")), [urls.skipped]);

  summary = reconcileRunResults(dataDir, results, { sourceStatusFile });
  assert.deepStrictEqual(summary.unknownStatuses, []);
  assert.strictEqual(readValues(path.join(dataDir, "application_history.jsonl")).length, results.length);
  assert.strictEqual(readValues(path.join(dataDir, "applied_jobs.txt")).length, 1);

  const unknownSummary = reconcileRunResults(
    dataDir,
    [{ url: urls.unknown, status: "unexpected_status" }],
    { sourceStatusFile: path.join(dataDir, "runs", "run-2", "job-status.json") }
  );
  assert.deepStrictEqual(unknownSummary.unknownStatuses, ["unexpected_status"]);
  assert(readValues(path.join(dataDir, "jobs.txt")).includes(urls.unknown));

  console.log("Status model tests passed.");
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
