const ashby = require("./ashby");
const greenhouse = require("./greenhouse");
const generic = require("./generic");

const adapters = [ashby, greenhouse, generic];

function detectAdapter(page) {
  return adapters.find((adapter) => adapter.detect(page)) || generic;
}

module.exports = {
  detectAdapter,
};
