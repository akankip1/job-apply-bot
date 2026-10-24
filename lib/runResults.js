const fs = require("fs");
const path = require("path");
const { writeFileAtomic } = require("./io");

const STATUS_BUCKETS = {
  queued: "queued",
  dry_run_completed: "dry_run",
  blocked: "blocked",
  submission_unverified: "unverified",
  submitted: "applied",
  failed: "failed",
  skipped: "skipped",
};

const TRACKING_FILES = {
  queued: "jobs.txt",
  dry_run: "dry_run_jobs.txt",
  blocked: "blocked_jobs.txt",
  unverified: "unverified_jobs.txt",
  applied: "applied_jobs.txt",
  failed: "failed_jobs.txt",
  skipped: "skipped_jobs.txt",
};

function statusToBucket(status) {
  return STATUS_BUCKETS[status] || null;
}

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/);
}

function normalizedLines(lines) {
  const comments = [];
  const values = [];
  const seen = new Set();
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      comments.push(line);
    } else if (!seen.has(trimmed)) {
      seen.add(trimmed);
      values.push(trimmed);
    }
  }
  return [...comments, ...values];
}

function writeLinesAtomic(filePath, lines) {
  const output = normalizedLines(lines);
  writeFileAtomic(filePath, output.length ? `${output.join("\n")}\n` : "");
}

function removeUrl(lines, url) {
  return lines.filter((line) => String(line).trim() !== url);
}

function addUrl(lines, url) {
  return [...removeUrl(lines, url), url];
}

function readHistory(filePath) {
  return readLines(filePath)
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function reconcileRunResults(dataDir, results, options = {}) {
  const sourceStatusFile = options.sourceStatusFile ? path.resolve(options.sourceStatusFile) : "unknown";
  const files = Object.fromEntries(
    Object.entries(TRACKING_FILES).map(([bucket, fileName]) => [bucket, path.join(dataDir, fileName)])
  );
  const linesByBucket = Object.fromEntries(
    Object.entries(files).map(([bucket, filePath]) => [bucket, readLines(filePath)])
  );
  const counts = Object.fromEntries(Object.keys(files).map((bucket) => [bucket, 0]));
  const unknownStatuses = [];
  const historyPath = path.join(dataDir, "application_history.jsonl");
  const history = readHistory(historyPath);
  const historyKeys = new Set(history.map((entry) => `${entry.sourceStatusFile}|${entry.url}|${entry.status}`));

  for (const result of results) {
    const url = String(result.url || "").trim();
    const status = String(result.status || "").trim();
    const bucket = statusToBucket(status);
    if (!url) continue;
    if (!bucket) {
      unknownStatuses.push(status || "(missing)");
      continue;
    }

    for (const currentBucket of Object.keys(linesByBucket)) {
      if (currentBucket === "queued" && bucket === "dry_run") continue;
      linesByBucket[currentBucket] = removeUrl(linesByBucket[currentBucket], url);
    }

    if (bucket === "queued") {
      linesByBucket.queued = addUrl(linesByBucket.queued, url);
    } else if (bucket === "dry_run") {
      linesByBucket.queued = addUrl(linesByBucket.queued, url);
      linesByBucket.dry_run = addUrl(linesByBucket.dry_run, url);
    } else {
      linesByBucket[bucket] = addUrl(linesByBucket[bucket], url);
    }
    counts[bucket] += 1;

    const historyKey = `${sourceStatusFile}|${url}|${status}`;
    if (!historyKeys.has(historyKey)) {
      history.push({
        sourceStatusFile,
        url,
        status,
        bucket,
        blockers: Array.isArray(result.blockers) ? result.blockers : [],
        confirmationEvidence: result.confirmationEvidence || null,
        submissionReason: result.submissionReason || null,
        reconciledAt: new Date().toISOString(),
      });
      historyKeys.add(historyKey);
    }
  }

  for (const [bucket, filePath] of Object.entries(files)) {
    writeLinesAtomic(filePath, linesByBucket[bucket]);
  }
  writeFileAtomic(historyPath, history.length ? `${history.map((entry) => JSON.stringify(entry)).join("\n")}\n` : "");

  return {
    counts,
    unknownStatuses: [...new Set(unknownStatuses)],
    remainingQueued: normalizedLines(linesByBucket.queued).filter((line) => !line.trim().startsWith("#")).length,
  };
}

module.exports = {
  STATUS_BUCKETS,
  TRACKING_FILES,
  statusToBucket,
  reconcileRunResults,
};
