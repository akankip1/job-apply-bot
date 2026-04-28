const { normalizeText } = require("./text");

const SENSITIVE_BLOCKED_TOKENS = [
  "sponsor",
  "visa",
  "work authorization",
  "authorized to work",
  "salary",
  "compensation",
  "gender",
  "ethnic",
  "race",
  "veteran",
  "disability",
  "sexual orientation",
  "pronouns",
  "truthful",
  "certify",
  "background check",
  "criminal",
  "legal",
];

const FACTUAL_LOCATION_TOKENS = [
  "located",
  "based",
  "near",
  "within",
  "commuting distance",
  "commute",
  "city",
  "state",
  "country",
  "european union",
  "united states",
  "office",
  "relocate",
  "location",
  "live in",
  "reside in",
];

const WILLINGNESS_ONLY_TOKENS = [
  "willing",
  "comfortable",
  "prefer",
  "would you",
  "need relocation",
  "relocation assistance",
  "how did you hear",
];

function includesAny(label, tokens) {
  return tokens.some((token) => label.includes(token));
}

function getPolicy(field) {
  const label = normalizeText(field.label);
  const key = normalizeText(field.key || "");

  if (includesAny(label, SENSITIVE_BLOCKED_TOKENS) || includesAny(key, ["salary", "compensation", "sponsorship", "workauthorization"])) {
    return { allowed: false, reason: "policy_blocked_sensitive_or_legal" };
  }

  if (includesAny(label, WILLINGNESS_ONLY_TOKENS) || includesAny(key, ["hybridrelocation", "relocationassistance", "relatedtocompanyemployee", "personalpronouns", "howdidyouhear"])) {
    return { allowed: false, reason: "policy_requires_explicit_answer" };
  }

  if (includesAny(label, FACTUAL_LOCATION_TOKENS)) {
    return { allowed: true, reason: "policy_factual_location_reasoning", key: "locationFact" };
  }

  return { allowed: false, reason: "policy_not_factual_location" };
}

module.exports = {
  getPolicy,
};
