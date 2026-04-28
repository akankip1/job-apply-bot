const fs = require("fs");
const path = require("path");

const runsDir = path.join(__dirname, "..", "runs");
const out = [];
const seen = new Set();

if (!fs.existsSync(runsDir)) {
  console.error("runs/ directory not found. Run a dry run first.");
  process.exit(0);
}

for (const run of fs.readdirSync(runsDir)) {
  // Look for any answer plan in the run folder
  const files = fs.readdirSync(path.join(runsDir, run));
  const planFiles = files.filter(f => f.endsWith("-answer-plan.json"));

  for (const planFile of planFiles) {
    const planPath = path.join(runsDir, run, planFile);
    try {
      const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
      if (!plan.decisions) continue;

      for (const d of plan.decisions) {
        // Only harvest fields that were successfully mapped and safe to fill
        if (!d.key || !d.label || !d.safeToFill) continue;
        
        const sig = `${d.key}::${d.label.slice(0, 80)}`;
        if (seen.has(sig)) continue;
        
        seen.add(sig);
        out.push({ 
          label: d.label, 
          key: d.key, 
          sensitive: d.sensitive || false 
        });
      }
    } catch (e) {
      console.warn(`Failed to parse ${planPath}: ${e.message}`);
    }
  }
}

const outPath = path.join(__dirname, "..", "lib", "reference-questions.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${out.length} reference entries to ${outPath}`);
