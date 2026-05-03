const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function parsePersonArg(args) {
  const idx = args.indexOf("--person");
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}
const person = parsePersonArg(process.argv.slice(2));

function getRunsDirs() {
  if (person) {
    return [path.join(ROOT, "people", person, "runs")];
  }
  const peopleDir = path.join(ROOT, "people");
  if (!fs.existsSync(peopleDir)) return [];
  return fs.readdirSync(peopleDir)
    .map(p => path.join(peopleDir, p, "runs"))
    .filter(d => fs.existsSync(d));
}

const runsDirs = getRunsDirs();
const outMap = new Map();

if (!runsDirs.length) {
  console.error("No runs/ directories found. Run a dry run first.");
  process.exit(0);
}

function isCleanRun(status) {
  if (!status) return false;

  // Newer runs store a compact results array instead of a single summary object.
  if (Array.isArray(status.results)) {
    if (status.results.length === 0) return false;
    return status.results.every((result) =>
      result &&
      result.status === "dry_run_completed" &&
      result.bucket === "applied"
    );
  }

  return status.status === "dry_run_completed" && Number(status.manualReviewCount || 0) === 0;
}

function hasManualReview(plan) {
  if (!plan) return true;
  if (plan.canSubmit === false) return true;
  if (Array.isArray(plan.manualReview) && plan.manualReview.length > 0) return true;
  return false;
}

function skipRun(run, reason) {
  console.log(`Skipping ${run}: ${reason}`);
}

for (const runsDir of runsDirs) {
for (const run of fs.readdirSync(runsDir)) {
  const runPath = path.join(runsDir, run);
  const statusPath = path.join(runPath, "job-status.json");
  
  // 4. Only harvest from runs that ended cleanly
  if (!fs.existsSync(statusPath)) {
    skipRun(run, "missing job-status.json");
    continue;
  }
  try {
    const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
    if (!isCleanRun(status)) {
      skipRun(run, "status not dry_run_completed/applied");
      continue;
    }
  } catch (e) {
    skipRun(run, `failed to parse job-status.json: ${e.message}`);
    continue;
  }

  const files = fs.readdirSync(runPath);
  const planFiles = files.filter(f => f.endsWith("-answer-plan.json"));
  if (planFiles.length === 0) {
    skipRun(run, "no answer-plan files found");
    continue;
  }

  let harvestable = true;
  for (const planFile of planFiles) {
    const planPath = path.join(runPath, planFile);
    try {
      const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
      if (hasManualReview(plan)) {
        skipRun(run, `${planFile} contains manualReview or canSubmit=false`);
        harvestable = false;
        break;
      }
    } catch (e) {
      skipRun(run, `failed to parse ${planFile}: ${e.message}`);
      harvestable = false;
      break;
    }
  }

  if (!harvestable) continue;

  for (const planFile of planFiles) {
    const planPath = path.join(runPath, planFile);
    try {
      const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
      if (!plan.decisions) continue;

      for (const d of plan.decisions) {
        // 4. Filter harvest
        if (!d.key || !d.label || !d.safeToFill) continue;
        if (d.confidence && d.confidence !== "high") continue;
        if (d.reason) continue;
        
        if (!outMap.has(d.key)) {
          outMap.set(d.key, { key: d.key, sensitive: d.sensitive || false, examples: new Set() });
        }
        outMap.get(d.key).examples.add(d.label);
      }
    } catch (e) { console.warn(`Failed to parse ${planPath}: ${e.message}`); }
  }
}
}

const out = Array.from(outMap.values()).map(item => ({
  ...item,
  examples: Array.from(item.examples)
}));

const outPath = path.join(__dirname, "..", "lib", "reference-questions.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${out.length} reference intent groups to ${outPath}`);
