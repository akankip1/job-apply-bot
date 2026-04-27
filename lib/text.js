function clean(value) {
  if (!value) return "";
  const trimmed = String(value).replace(/\r/g, "").trim();
  if (!trimmed || trimmed === "-" || /^n\/?a$/i.test(trimmed)) return "";
  return trimmed;
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  clean,
  normalizeText,
  escapeRegExp,
};
