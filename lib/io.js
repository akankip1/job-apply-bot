const fs = require("fs");
const path = require("path");

function readJobs(root) {
  const jobsFile = path.join(root, "jobs.txt");
  if (!fs.existsSync(jobsFile)) {
    fs.writeFileSync(jobsFile, "# Add one job application URL per line.\n", "utf8");
    return [];
  }
  return fs
    .readFileSync(jobsFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeFileAtomic(filePath, contents) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    fs.writeFileSync(tempPath, contents, "utf8");
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

function writeJsonAtomic(filePath, value) {
  writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createLogger(logFile, submitMode, options = {}) {
  const { quiet = false } = options;

  return function log(event, data = {}) {
    const row = {
      timestamp: new Date().toISOString(),
      mode: submitMode ? "submit" : "dry-run",
      event,
      ...data,
    };
    fs.appendFileSync(logFile, `${JSON.stringify(row)}\n`, "utf8");
    if (!quiet) {
      console.log(`${event}: ${JSON.stringify(data)}`);
    }
  };
}

module.exports = {
  readJobs,
  writeJson,
  writeFileAtomic,
  writeJsonAtomic,
  createLogger,
};
