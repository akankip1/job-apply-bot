const { pipeline } = require("@xenova/transformers");
const fs = require("fs");
const path = require("path");

// 6. Configurable threshold
const SEMANTIC_THRESHOLD = Number(process.env.SEMANTIC_THRESHOLD || 0.85);

let embedder = null;
let refs = null;

async function initEmbedder() {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return embedder;
}

async function getEmbedder() {
  return initEmbedder();
}

function loadRefs() {
  if (refs) return refs;
  const p = path.join(__dirname, "reference-embeddings.json");
  if (!fs.existsSync(p)) {
    throw new Error("reference-embeddings.json not found - run scripts/build-embeddings.js");
  }
  refs = JSON.parse(fs.readFileSync(p, "utf8")).map((ref) => ({
    ...ref,
    example: ref.example || ref.label || ref.question || "",
  }));
  return refs;
}

function cosine(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function classifyLabel(label) {
  const embed = await getEmbedder();
  const output = await embed(label, { pooling: "mean", normalize: true });
  const vector = Array.from(output.data);
  const refs = loadRefs();

  let best = null;
  let bestScore = -1;

  for (const ref of refs) {
    const score = cosine(vector, ref.vector);
    if (score > bestScore) {
      bestScore = score;
      best = ref;
    }
  }

  // 6. Conservative thresholds based on new requirement
  if (bestScore >= SEMANTIC_THRESHOLD) {
    return {
      key: best.key,
      sensitive: best.sensitive,
      confidence: "high",
      score: bestScore,
      matchedLabel: best.example,
    };
  }
  if (bestScore >= 0.8) {
    return {
      key: best.key,
      sensitive: best.sensitive,
      confidence: "low",
      score: bestScore,
      matchedLabel: best.example,
    };
  }
  return {
    key: null,
    confidence: "none",
    score: bestScore,
    matchedLabel: best?.example,
  };
}

module.exports = { classifyLabel, initEmbedder, SEMANTIC_THRESHOLD };
