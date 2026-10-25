#!/usr/bin/env node
const assert = require("assert");
const { hasHumanVerification, waitForHumanVerification } = require("../lib/humanVerification");

function createPage(options = {}) {
  let widgetVisible = Boolean(options.widgetVisible);
  let textVisible = Boolean(options.textVisible);
  const collection = (isVisible) => ({
    count: async () => isVisible() ? 1 : 0,
    nth: () => ({ isVisible: async () => isVisible() }),
  });
  const frame = {
    locator: (selector) => {
      if (options.assertSelector) options.assertSelector(selector);
      return collection(() => widgetVisible);
    },
    getByText: (pattern) => {
      if (options.assertTextPattern) options.assertTextPattern(pattern);
      return collection(() => textVisible);
    },
  };
  return {
    frames: () => [frame],
    waitForTimeout: async () => {
      if (options.clearOnWait) {
        widgetVisible = false;
        textVisible = false;
      }
    },
  };
}

async function main() {
  assert.strictEqual(await hasHumanVerification(createPage({ widgetVisible: true })), true);
  assert.strictEqual(await hasHumanVerification(createPage()), false);
  assert.strictEqual(await hasHumanVerification(createPage({ textVisible: true })), true);
  assert.strictEqual(await waitForHumanVerification(createPage({ widgetVisible: true, clearOnWait: true }), { timeoutMs: 100, pollMs: 1 }), true);
  assert.strictEqual(await waitForHumanVerification(createPage({ widgetVisible: true }), { timeoutMs: 0, pollMs: 1 }), false);

  await hasHumanVerification(createPage({
    assertSelector: (selector) => {
      assert.ok(selector.includes("/bframe"));
      assert.ok(selector.includes("/anchor"));
      assert.ok(selector.includes("size=invisible"));
      assert.ok(!selector.includes("iframe[src*='recaptcha'],"));
    },
    assertTextPattern: (pattern) => {
      assert.strictEqual(pattern.test("Verify you are human"), true);
      assert.strictEqual(pattern.test("We use CAPTCHA verification to prevent abuse"), false);
    },
  }));
  console.log("Human verification tests passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
