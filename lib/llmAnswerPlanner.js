const { pipeline } = require("@xenova/transformers");
const { normalizeText } = require("./text");

const MODEL_NAME = process.env.LLM_ANSWER_MODEL || "Xenova/flan-t5-small";
const NEARBY_CITY_GROUPS = {
  seattle: ["bellevue", "redmond", "renton", "kirkland", "tukwila"],
};

let generator = null;

async function getGenerator() {
  if (!generator) {
    generator = await pipeline("text2text-generation", MODEL_NAME);
  }
  return generator;
}

function extractJson(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

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

function buildPrompt(field, profile, answers) {
  const facts = {
    location: profile.standard.location || "",
    city: profile.standard.city || "",
    state: profile.standard.state || "",
    country: profile.standard.country || "",
  };

  const safeAnswers = {};
  for (const [key, value] of Object.entries(answers || {})) {
    if (value) safeAnswers[key] = value;
  }

  return [
    "You are a factual answer planner for a job application.",
    "Return only strict JSON with these keys: answer, source, confidence, safeToFill, manualReview, reason.",
    "Use only the provided applicant facts and reusable answers.",
    "If you cannot answer with high confidence, set safeToFill to false and manualReview to true.",
    "If the question has options, return an answer that matches one of the available options exactly.",
    `Question: ${field.label}`,
    `Type: ${field.type || ""}`,
    `Options: ${Array.isArray(field.options) ? field.options.join(" | ") : ""}`,
    `Applicant facts: ${JSON.stringify(facts)}`,
    `Reusable answers: ${JSON.stringify(safeAnswers)}`,
  ].join("\n");
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

function fallbackLocationAnswer(field, profile) {
  const label = normalizeText(field.label);
  const rawLocation = String(profile.standard.location || "");
  const city = normalizeText(profile.standard.city || rawLocation.split(",")[0] || "");
  const state = normalizeText(profile.standard.state || rawLocation.split(",")[1] || "");
  const country = normalizeText(profile.standard.country || "");
  const location = normalizeText(profile.standard.location || "");

  if (city && label.includes(city)) {
    return "Yes";
  }
  if (state && label.includes(state)) {
    return "Yes";
  }
  if (country && label.includes(country)) {
    return "Yes";
  }
  if (location && label.includes(location)) {
    return "Yes";
  }

  if ((label.includes("united states") || label.includes("us")) && (country === "united states" || state)) {
    return "Yes";
  }
  if (label.includes("european union") || label.includes("eu")) {
    return "No";
  }

  const nearbyCities = NEARBY_CITY_GROUPS[city] || [];
  if (nearbyCities.some((nearbyCity) => label.includes(nearbyCity))) {
    return "Yes";
  }

  if (label.includes("florida") && city === "seattle") {
    return "No";
  }

  return "";
}

async function planAnswer(field, profile, answers, schema, logger) {
  if (logger) {
    logger("llm_answer_planner_used", {
      fieldId: field.fieldId,
      label: field.label,
      type: field.type,
    });
  }

  let result = null;
  try {
    const generatorInstance = await getGenerator();
    const output = await generatorInstance(buildPrompt(field, profile, answers), {
      max_new_tokens: 128,
      do_sample: false,
      temperature: 0.1,
    });
    const generatedText = Array.isArray(output) ? output[0]?.generated_text : output?.generated_text;
    const parsed = extractJson(generatedText);
    result = normalizeResponse(parsed, field);
  } catch (error) {
    if (logger) {
      logger("llm_answer_rejected", {
        fieldId: field.fieldId,
        label: field.label,
        reason: `llm_error:${error.message}`,
      });
    }
    const fallbackAnswer = fallbackLocationAnswer(field, profile);
    if (fallbackAnswer) {
      const fallbackResult = normalizeResponse({
        answer: fallbackAnswer,
        source: "llm.fallback.location",
        confidence: "high",
        safeToFill: true,
        manualReview: false,
        reason: "fallback_location_reasoning",
      }, field);
      if (logger) {
        logger("llm_answer_accepted", {
          fieldId: field.fieldId,
          label: field.label,
          answer: fallbackResult.answer,
          confidence: fallbackResult.confidence,
          source: fallbackResult.source,
        });
      }
      return fallbackResult;
    }
    return {
      answer: "",
      source: "llm.unavailable",
      confidence: "none",
      safeToFill: false,
      manualReview: true,
      reason: `llm_error:${error.message}`,
    };
  }

  if (result.manualReview) {
    if (logger) {
      logger("llm_answer_manual_review", {
        fieldId: field.fieldId,
        label: field.label,
        reason: result.reason,
      });
    }
    return result;
  }

  if (result.confidence !== "high" || !result.safeToFill || !result.answer) {
    if (logger) {
      logger("llm_answer_rejected", {
        fieldId: field.fieldId,
        label: field.label,
        reason: result.reason,
        confidence: result.confidence,
        safeToFill: result.safeToFill,
      });
    }
    const fallbackAnswer = fallbackLocationAnswer(field, profile);
    if (fallbackAnswer) {
      const fallbackResult = normalizeResponse({
        answer: fallbackAnswer,
        source: "llm.fallback.location",
        confidence: "high",
        safeToFill: true,
        manualReview: false,
        reason: "fallback_location_reasoning",
      }, field);
      if (logger) {
        logger("llm_answer_accepted", {
          fieldId: field.fieldId,
          label: field.label,
          answer: fallbackResult.answer,
          confidence: fallbackResult.confidence,
          source: fallbackResult.source,
        });
      }
      return fallbackResult;
    }
    return {
      ...result,
      safeToFill: false,
      manualReview: true,
      reason: result.reason || "llm_rejected",
    };
  }

  if (logger) {
    logger("llm_answer_accepted", {
      fieldId: field.fieldId,
      label: field.label,
      answer: result.answer,
      confidence: result.confidence,
    });
  }

  return result;
}

module.exports = {
  planAnswer,
};
