#!/usr/bin/env node
const assert = require("assert");
const { choiceMatchers, groupTextMatchesQuestion } = require("../platforms/ashby");

function matches(decision, option) {
  return choiceMatchers(decision).some((matcher) => matcher.test(option));
}

assert.strictEqual(matches({ key: "gender", answer: "Female" }, "Female"), true);
assert.strictEqual(matches({ key: "ethnicity", answer: "South Asian" }, "Asian (Not Hispanic or Latino)"), true);
assert.strictEqual(matches({ key: "veteran", answer: "No" }, "I am not a protected veteran"), true);
assert.strictEqual(matches({ key: "veteran", answer: "Yes" }, "I identify as one or more of the classifications of protected veteran listed above"), true);
assert.strictEqual(groupTextMatchesQuestion("Race Hispanic or Latino White Asian", "Race"), true);
assert.strictEqual(groupTextMatchesQuestion("Two or More Races (Not Hispanic or Latino)", "Race"), false);
assert.strictEqual(groupTextMatchesQuestion("Veteran Status I am not a protected veteran", "Veteran Status"), true);
assert.strictEqual(groupTextMatchesQuestion("I am not a protected veteran", "Veteran Status"), false);

console.log("Ashby choice matching tests passed.");
