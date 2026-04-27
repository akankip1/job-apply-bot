const greenhouse = require("./greenhouse");
const generic = require("./generic");

const adapters = [greenhouse, generic];

function detectAdapter(page) {
  return adapters.find((adapter) => adapter.detect(page)) || generic;
}

module.exports = {
  detectAdapter,
};
