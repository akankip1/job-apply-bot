#!/usr/bin/env node
const assert = require("assert");
const { verifySubmission } = require("../platforms/submissionVerification");
const ashby = require("../platforms/ashby");
const greenhouse = require("../platforms/greenhouse");
const workable = require("../platforms/workable");

function createFrame(options = {}) {
  const visibleSelectors = new Set(options.visibleSelectors || []);
  return {
    url: () => options.url || "https://example.test/apply",
    locator: (selector) => ({
      count: async () => visibleSelectors.has(selector) ? 1 : 0,
      nth: () => ({ isVisible: async () => visibleSelectors.has(selector) }),
      innerText: async () => selector === "body" ? (options.bodyText || "") : "",
    }),
  };
}

function createPage(options = {}) {
  const frame = createFrame(options);
  return {
    frames: () => [frame],
    url: () => options.pageUrl || options.url || "https://example.test/apply",
    waitForTimeout: async () => {},
  };
}

async function main() {
  const selectorResult = await verifySubmission(createPage({
    visibleSelectors: ["#confirmation"],
  }), {
    beforeUrl: "https://example.test/apply",
    successSelectors: ["#confirmation"],
    timeoutMs: 0,
  });
  assert.strictEqual(selectorResult.confirmed, true);
  assert.strictEqual(selectorResult.evidence.type, "selector");

  const textResult = await verifySubmission(createPage({
    bodyText: "Thank you for applying. We will be in touch.",
  }), { beforeUrl: "https://example.test/apply", timeoutMs: 0 });
  assert.strictEqual(textResult.confirmed, true);
  assert.strictEqual(textResult.evidence.type, "text");

  const urlResult = await verifySubmission(createPage({
    pageUrl: "https://example.test/application-confirmation",
  }), {
    beforeUrl: "https://example.test/apply",
    successUrl: /application-confirmation/,
    timeoutMs: 0,
  });
  assert.strictEqual(urlResult.confirmed, true);
  assert.strictEqual(urlResult.evidence.type, "url");

  const validationResult = await verifySubmission(createPage({
    visibleSelectors: ["[aria-invalid='true'], [role='alert'], .field-error, .error-message, [data-testid*='error']"],
  }), { beforeUrl: "https://example.test/apply", timeoutMs: 0 });
  assert.strictEqual(validationResult.confirmed, false);
  assert.strictEqual(validationResult.reason, "validation_error_visible");

  const unverifiedResult = await verifySubmission(createPage(), {
    beforeUrl: "https://example.test/apply",
    timeoutMs: 0,
  });
  assert.strictEqual(unverifiedResult.confirmed, false);
  assert.strictEqual(unverifiedResult.reason, "confirmation_not_found");

  const platformCases = [
    [greenhouse, "#application_confirmation"],
    [ashby, "[data-testid='application-submitted']"],
    [workable, "[data-ui='application-success']"],
  ];
  for (const [adapter, selector] of platformCases) {
    const result = await adapter.verifySubmission(createPage({ visibleSelectors: [selector] }), {
      beforeUrl: "https://example.test/apply",
      timeoutMs: 0,
    });
    assert.strictEqual(result.confirmed, true, `${adapter.name} should recognize ${selector}`);
    assert.strictEqual(result.evidence.value, selector);
  }

  console.log("Submission verification tests passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
