const { normalizeText } = require("./text");

function optionMatch(answer, options) {
  const normalizedAnswer = normalizeText(answer);
  if (!normalizedAnswer || !Array.isArray(options) || options.length === 0) return null;

  for (const option of options) {
    const normalizedOption = normalizeText(option);
    if (!normalizedOption) continue;
    if (normalizedAnswer === normalizedOption) return option;
    if (normalizedAnswer.includes(normalizedOption) || normalizedOption.includes(normalizedAnswer)) return option;
  }

  if (/^yes$/.test(normalizedAnswer)) {
    return options.find((option) => normalizeText(option) === "yes") || null;
  }
  if (/^no$/.test(normalizedAnswer)) {
    return options.find((option) => normalizeText(option) === "no") || null;
  }

  return null;
}

function normalizeResponse(raw, field) {
  if (!raw || typeof raw !== "object") {
    return { answer: "", source: "llm.invalid", confidence: "none", safeToFill: false, manualReview: true, reason: "llm_invalid_json" };
  }

  const confidence = normalizeText(raw.confidence) || "none";
  const safeToFill = raw.safeToFill === true;
  const manualReview = raw.manualReview === true || confidence !== "high" || !safeToFill;
  const reason = String(raw.reason || (manualReview ? "llm_requires_manual_review" : "llm_accepted"));
  const source = String(raw.source || "llm");
  let answer = String(raw.answer || "").trim();

  if (Array.isArray(field.options) && field.options.length) {
    const matched = optionMatch(answer, field.options);
    if (!matched) {
      return {
        answer: "",
        source,
        confidence,
        safeToFill: false,
        manualReview: true,
        reason: "llm_option_mismatch",
      };
    }
    answer = matched;
  }

  return {
    answer,
    source,
    confidence,
    safeToFill,
    manualReview,
    reason,
  };
}

function resolveLocationAnswer(field, profile) {
  const label = normalizeText(field.label);
  const rawLocation = String(profile.standard.location || "");
  const city = normalizeText(profile.standard.city || rawLocation.split(",")[0] || "");
  const state = normalizeText(profile.standard.state || rawLocation.split(",")[1] || "");
  const country = normalizeText(profile.standard.country || "");
  const location = normalizeText(profile.standard.location || "");

  if (city && label.includes(city)) return "Yes";
  if (state && label.includes(state)) return "Yes";
  if (country && label.includes(country)) return "Yes";
  if (location && label.includes(location)) return "Yes";

  if ((label.includes("united states") || label.includes("us")) && (country === "united states" || state)) {
    return "Yes";
  }
  if (label.includes("european union") || label.includes("eu")) {
    return "No";
  }

  const nearbyCities = (profile.nearbyCities || {})[city] || [];
  if (nearbyCities.some((nearbyCity) => label.includes(nearbyCity))) {
    return "Yes";
  }

  if (/currently live near|located near|based near|live within/.test(label)) {
    return "No";
  }

  return "";
}

async function planAnswer(field, profile, answers, schema, logger) {
  const label = normalizeText(field.label);

  if (/willing to commute|willing to relocate|comfortable with this policy|office.*per week|office.*x a week/.test(label)) {
    const answer = String(
      answers.comfortable_with_hybrid_or_relocation ||
      answers.onsite_seattle_four_days ||
      ""
    ).trim();
    if (answer) {
      return normalizeResponse(
        {
          answer,
          source: "answers.comfortable_with_hybrid_or_relocation",
          confidence: "high",
          safeToFill: true,
          manualReview: false,
          reason: "commute_rule_matched",
        },
        field
      );
    }
  }

  const locationAnswer = resolveLocationAnswer(field, profile);
  if (locationAnswer) {
    return normalizeResponse(
      {
        answer: locationAnswer,
        source: "rule.location",
        confidence: "high",
        safeToFill: true,
        manualReview: false,
        reason: "location_rule_matched",
      },
      field
    );
  }

  return {
    answer: "",
    source: "rule.none",
    confidence: "none",
    safeToFill: false,
    manualReview: true,
    reason: "no_rule_matched",
  };
}

module.exports = {
  planAnswer,
};
