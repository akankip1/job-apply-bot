#!/usr/bin/env node
const assert = require("assert");
const { isSafeDryRunSubmitText } = require("../lib/dryRunGuard");

assert.strictEqual(isSafeDryRunSubmitText("Continue"), true);
assert.strictEqual(isSafeDryRunSubmitText("Next"), true);
assert.strictEqual(isSafeDryRunSubmitText("Review Application"), true);
assert.strictEqual(isSafeDryRunSubmitText("Submit"), false);
assert.strictEqual(isSafeDryRunSubmitText("Submit Application"), false);
assert.strictEqual(isSafeDryRunSubmitText(""), false);

console.log("Dry-run guard tests passed.");
