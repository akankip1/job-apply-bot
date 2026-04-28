const { pipeline } = require("@xenova/transformers");
const fs = require("fs");
const path = require("path");

const refsPath = path.join(__dirname, "..", "lib", "reference-questions.json");
const outPath = path.join(__dirname, "..", "lib", "reference-embeddings.json");

if (!fs.existsSync(refsPath)) {
  console.error("reference-questions.json not found. Run scripts/build-reference.js first.");
  process.exit(1);
}

const refs = JSON.parse(fs.readFileSync(refsPath, "utf8"));

(async () => {
  console.log("Loading embedding model (this may take a moment on the first run)...");
  const embed = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

  const result = [];
  console.log(`Embedding ${refs.length} questions...`);
  
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    const output = await embed(ref.label, { pooling: "mean", normalize: true });
    result.push({ ...ref, vector: Array.from(output.data) });
    
    if ((i + 1) % 20 === 0) {
      console.log(`Progress: ${i + 1}/${refs.length}`);
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(result));
  console.log(`Successfully embedded ${result.length} reference questions to ${outPath}`);
})();
