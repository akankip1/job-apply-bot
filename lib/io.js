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

function createLogger(logFile, submitMode) {
  return function log(event, data = {}) {
    const row = {
      timestamp: new Date().toISOString(),
      mode: submitMode ? "submit" : "dry-run",
      event,
      ...data,
    };
    fs.appendFileSync(logFile, `${JSON.stringify(row)}\n`, "utf8");
    console.log(`${event}: ${JSON.stringify(data)}`);
  };
}

module.exports = {
  readJobs,
  writeJson,
  createLogger,
};
