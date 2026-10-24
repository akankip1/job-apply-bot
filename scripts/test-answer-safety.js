#!/usr/bin/env node
const assert = require("assert");
const { classifyField } = require("../lib/answerPlan");

const emptyProfile = {
  standard: {
    location: "Seattle, WA, United States",
    city: "Seattle",
    state: "WA",
    country: "United States",
    primaryEducation: {},
  },
  sensitive: {},
  nearbyCities: { seattle: ["bellevue"] },
};

function field(label, type = "text") {
  return {
    fieldId: label,
    label,
    type,
    required: true,
  };
}

async function decision(label, options = {}) {
  return classifyField(
    field(label, options.type),
    options.profile || emptyProfile,
    options.answers || {},
    { company: "Safety Test" }
  );
}

async function main() {
  for (const [label, type] of [
    ["Woman", "checkbox"],
    ["Heterosexual", "checkbox"],
    ["Are you Hispanic or Latinx?", "checkbox"],
    ["Are you authorized to work in the United States?", "radio"],
    ["Will you require visa sponsorship?", "radio"],
    ["What are your salary expectations?", "text"],
    ["I certify this application is truthful", "checkbox"],
    ["Are you located in the European Union?", "radio"],
  ]) {
    const result = await decision(label, { type });
    assert.strictEqual(result.answer, "", `${label} must remain unanswered without an explicit source`);
    assert.strictEqual(result.safeToFill, false, `${label} must require review`);
  }

  const unmatchedLocation = await decision("Are you near Florida?", { type: "radio" });
  assert.strictEqual(unmatchedLocation.answer, "");
  assert.strictEqual(unmatchedLocation.safeToFill, false);
  assert.strictEqual(unmatchedLocation.reason, "location_requires_explicit_match");

  const approvedNearby = await decision("Are you near Bellevue?", { type: "radio" });
  assert.strictEqual(approvedNearby.answer, "Yes");
  assert.strictEqual(approvedNearby.safeToFill, true);

  const explicitGender = await decision("Woman", {
    type: "checkbox",
    profile: { ...emptyProfile, sensitive: { gender: "Female" } },
  });
  assert.strictEqual(explicitGender.answer, "Yes");
  assert.strictEqual(explicitGender.safeToFill, true);

  const explicitAuthorization = await decision("Are you authorized to work in the United States?", {
    type: "radio",
    profile: { ...emptyProfile, sensitive: { authorizedUS: "Yes" } },
  });
  assert.strictEqual(explicitAuthorization.answer, "Yes");
  assert.strictEqual(explicitAuthorization.safeToFill, true);

  console.log("Answer safety tests passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
