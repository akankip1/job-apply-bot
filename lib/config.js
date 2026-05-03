const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const DEFAULTS = {
  nearbyCities: {},
  optionAliases: {},
};

function loadConfig(slug) {
  const configPath = path.join(ROOT, "people", slug, "config.json");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULTS, null, 2));
    return { ...DEFAULTS };
  }
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

module.exports = { loadConfig };
