#!/usr/bin/env node
const assert = require("assert");
const greenhouse = require("../platforms/greenhouse");

function createPage(state) {
  const element = {
    files: state.files || [],
    checked: Boolean(state.checked),
    value: state.value || "",
    selectedIndex: state.selectedIndex ?? 0,
    options: state.options || [],
    matches: (selector) => selector === "input[type='radio']" && state.type === "radio",
    querySelector: () => state.groupSelected ? {} : null,
  };
  const locator = {
    count: async () => 1,
    evaluate: async (callback) => callback(element),
    first: () => locator,
    inputValue: async () => state.value || "",
    isChecked: async () => Boolean(state.checked),
    nth: () => locator,
  };
  const frame = {
    url: () => "https://example.test/form",
    locator: (selector) => selector.includes("field-error")
      ? { count: async () => state.validationError ? 1 : 0, nth: () => ({ isVisible: async () => Boolean(state.validationError) }) }
      : locator,
  };
  return {
    frames: () => [frame],
    mainFrame: () => frame,
  };
}

async function verify(type, state, answer = "Yes") {
  const results = await greenhouse.verify(createPage({ ...state, type }), {
    decisions: [{
      fieldId: `required-${type}`,
      frameUrl: "https://example.test/form",
      selector: `#required-${type}`,
      label: `Required ${type}`,
      key: type === "file" ? "resume" : type,
      type,
      required: true,
      safeToFill: true,
      answer,
    }],
  }, () => {});
  return results[0];
}

async function main() {
  assert.strictEqual((await verify("text", { value: "persisted" })).filled, true);
  assert.strictEqual((await verify("text", { value: "" })).filled, false);
  assert.strictEqual((await verify("file", { files: [{ name: "resume.pdf" }] }, "/tmp/resume.pdf")).filled, true);
  assert.strictEqual((await verify("file", { files: [] }, "/tmp/resume.pdf")).filled, false);
  assert.strictEqual((await verify("checkbox", { checked: true })).filled, true);
  assert.strictEqual((await verify("checkbox", { checked: false })).filled, false);
  assert.strictEqual((await verify("radio", { checked: true })).filled, true);
  assert.strictEqual((await verify("radio", { checked: false })).filled, false);
  assert.strictEqual((await verify("select", {
    value: "approved",
    selectedIndex: 1,
    options: [{ textContent: "Select" }, { textContent: "Approved" }],
  }, "Approved")).filled, true);
  assert.strictEqual((await verify("select", {
    value: "",
    selectedIndex: 0,
    options: [{ textContent: "Select an option" }],
  }, "Approved")).filled, false);
  assert.strictEqual((await greenhouse.validationErrors(createPage({ validationError: true }))).length, 1);
  assert.strictEqual((await greenhouse.validationErrors(createPage({ validationError: false }))).length, 0);
  console.log("Form verification tests passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
