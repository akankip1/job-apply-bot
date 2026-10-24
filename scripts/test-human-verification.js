#!/usr/bin/env node
const assert = require("assert");
const { hasHumanVerification, waitForHumanVerification } = require("../lib/humanVerification");

function createPage(initiallyVisible, clearOnWait = false) {
  let visible = initiallyVisible;
  const collection = {
    count: async () => visible ? 1 : 0,
    nth: () => ({ isVisible: async () => visible }),
  };
  const frame = {
    locator: () => collection,
    getByText: () => ({ count: async () => 0, nth: collection.nth }),
  };
  return {
    frames: () => [frame],
    waitForTimeout: async () => {
      if (clearOnWait) visible = false;
    },
  };
}

async function main() {
  assert.strictEqual(await hasHumanVerification(createPage(true)), true);
  assert.strictEqual(await hasHumanVerification(createPage(false)), false);
  assert.strictEqual(await waitForHumanVerification(createPage(true, true), { timeoutMs: 100, pollMs: 1 }), true);
  assert.strictEqual(await waitForHumanVerification(createPage(true), { timeoutMs: 0, pollMs: 1 }), false);
  console.log("Human verification tests passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
