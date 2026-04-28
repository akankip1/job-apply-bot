const { pipeline } = require("@xenova/transformers");
const fs = require("fs");
const path = require("path");

const refsPath = path.join(__dirname, "..", "lib", "reference-questions.json");
const outPath = path.join(__dirname, "..", "lib", "reference-embeddings.json");

if (!fs.existsSync(refsPath)) {
  console.error("reference-questions.json not found. Run scripts/build-reference.js first.");
  process.exit(1);
}

const references = JSON.parse(fs.readFileSync(refsPath, "utf8"));

function normalizeGroups(items) {
  if (!Array.isArray(items)) return [];

  // Support both legacy grouped input ({ examples: [...] }) and the current
  // flat harvested reference rows ({ label, key, sensitive }).
  if (items.length && Array.isArray(items[0].examples)) {
    return items;
  }

  return items.map((item) => ({
    ...item,
    examples: [item.example || item.label || item.question].filter(Boolean),
  }));
}

(async () => {
  console.log("Loading embedding model...");
  const embed = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

  const result = [];
  const groups = normalizeGroups(references);
  console.log(`Embedding ${groups.length} intent groups...`);

  for (const group of groups) {
    for (const example of group.examples) {
      const output = await embed(example, { pooling: "mean", normalize: true });
      result.push({
        ...group,
        example,
        embeddingModel: "Xenova/all-MiniLM-L6-v2",
        vector: Array.from(output.data)
      });
    }
  }

  // 2. Pretty-print
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`Successfully embedded ${result.length} examples to ${outPath}`);
})();
