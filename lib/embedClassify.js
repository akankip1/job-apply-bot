const { pipeline } = require("@xenova/transformers");
const fs = require("fs");
const path = require("path");

const HIGH_CONFIDENCE = 0.85;
const LOW_CONFIDENCE  = 0.60;

let embedder = null;
let refs = null;

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return embedder;
}

function loadRefs() {
  if (refs) return refs;
  const p = path.join(__dirname, "reference-embeddings.json");
  if (!fs.existsSync(p)) {
    throw new Error("reference-embeddings.json not found — run scripts/build-embeddings.js");
  }
  refs = JSON.parse(fs.readFileSync(p, "utf8"));
  return refs;
}

function cosine(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function classifyLabel(label) {
  const embed  = await getEmbedder();
  const output = await embed(label, { pooling: "mean", normalize: true });
  const vector = Array.from(output.data);
  const refs   = loadRefs();

  let best = null;
  let bestScore = -1;

  for (const ref of refs) {
    const score = cosine(vector, ref.vector);
    if (score > bestScore) { 
      bestScore = score; 
      best = ref; 
    }
  }

  if (bestScore >= HIGH_CONFIDENCE) {
    return { 
      key: best.key, 
      sensitive: best.sensitive, 
      confidence: "high", 
      score: bestScore, 
      matchedLabel: best.label 
    };
  }
  if (bestScore >= LOW_CONFIDENCE) {
    return { 
      key: best.key, 
      sensitive: best.sensitive, 
      confidence: "low",  
      score: bestScore, 
      matchedLabel: best.label 
    };
  }
  return { 
    key: null, 
    confidence: "none", 
    score: bestScore, 
    matchedLabel: best?.label 
  };
}

module.exports = { classifyLabel, HIGH_CONFIDENCE, LOW_CONFIDENCE };
