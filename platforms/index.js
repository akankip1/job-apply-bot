const ashby = require("./ashby");
const greenhouse = require("./greenhouse");
const workable = require("./workable");
const generic = require("./generic");

const adapters = [ashby, greenhouse, workable, generic];

function detectAdapter(page) {
  return adapters.find((adapter) => adapter.detect(page)) || generic;
}

module.exports = {
  detectAdapter,
};
