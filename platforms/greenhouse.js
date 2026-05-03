const { extractFieldsFromFrame } = require("../lib/formSchema");
const { normalizeText, escapeRegExp } = require("../lib/text");

const SUBMIT_RE = /^(submit|submit application|send application|complete application|finish)$/i;
const SAFE_NEXT_RE = /^(application|next|continue|save and continue|review|review application|proceed|go to next|next step)$/i;
const DANGEROUS_RE = /(withdraw|delete|remove|cancel application|discard|reset)/i;
const CONTROL_SELECTOR = "input:not([type='hidden']), textarea, select";
const OPTION_SELECTORS = [
  "[role='option']",
  "[data-test*='option']",
  "[class*='option']",
  "[class*='select'] li",
  "li",
];
const LOCATION_OPTION_SELECTORS = [
  "[role='option']",
  "[data-test*='option']",
  "[class*='option']",
  "[class*='suggestion']",
  "[class*='autocomplete'] li",
  "li",
];
const COMBOBOX_LABEL_RE = /country|location|eligible|authorized|verification|identity|18 years|sponsor|visa|hybrid|relocat|onsite|office|previously employed|ever been employed|gender|ethnicity|race|hispanic|latino|veteran|disability|school|degree|discipline|month|how did you hear|privacy policy|acknowledge|interviewed with|export license|ear|contractual obligations|fugitive|alien|controlled substance|mental defective|mental institution|dishonorable|renounced/;

function isGreenhouseFrame(frame) {
  return /greenhouse\.io|greenhouse\.com|job_app|gh_jid/i.test(frame.url());
}

function detect(page) {
  return page.frames().some(isGreenhouseFrame) || /greenhouse|gh_jid/i.test(page.url());
}

async function firstText(page, selectors) {
  for (const selector of selectors) {
    const value = await page.locator(selector).first().innerText({ timeout: 1000 }).catch(() => "");
    if (value && value.trim()) return value.trim();
  }
  return "";
}

async function extract(page) {
  const fields = [];
  for (const frame of page.frames()) {
    if (frame === page.mainFrame() || isGreenhouseFrame(frame)) {
      fields.push(...await extractFieldsFromFrame(frame));
    }
  }

  const filteredFields = fields.filter((field) => {
    const label = normalizeText(field.label);
    const hasStableName = field.id || field.name;
    if (!hasStableName && label === "phone" && fields.some((item) => item.id === "phone")) return false;
    if (!hasStableName && /^(select|select option|select one)$/.test(label)) return false;
    if (!hasStableName && !label) return false;
    return true;
  });

  return {
    platform: "greenhouse",
    pageUrl: page.url(),
    jobTitle: await firstText(page, ["h1", "[data-testid='job-title']", ".job-title"]),
    company: await firstText(page, ["[data-testid='company-name']", ".company-name", "header img[alt]"]),
    fields: filteredFields,
  };
}

function frameFor(page, frameUrl) {
  return page.frames().find((frame) => frame.url() === frameUrl) || page.frames().find((frame) => frame.url().startsWith(frameUrl));
}

function fieldLocator(frame, decision) {
  if (decision.selector) return frame.locator(decision.selector).first();
  return frame.locator(CONTROL_SELECTOR).nth(decision.index);
}

function answerMatches(value, answer) {
  const normalizedValue = normalizeText(value);
  const normalizedAnswer = normalizeText(answer);
  return !!normalizedValue && (normalizedValue === normalizedAnswer || normalizedValue.includes(normalizedAnswer));
}

function shouldVerifyText(decision) {
  return ["email", "text", "textarea", "tel", "input"].includes(decision.type) && decision.safeToFill && decision.answer;
}

function requiresOptionSelection(decision, label) {
  return /how did you hear|privacy policy|acknowledge|interviewed with|authorized|eligible|verification|identity|18 years|sponsor|visa|gender|ethnicity|race|hispanic|latino|veteran|disability|export license|ear|contractual obligations|fugitive|alien|controlled substance|mental defective|mental institution|dishonorable|renounced|onsite|office/.test(label) ||
    [
      "howDidYouHear",
      "recruitmentPrivacyPolicyAcknowledgement",
      "recentlyInterviewedWithCompany",
      "workAuthorization",
      "workAuthorizationAnyEmployer",
      "identityWorkAuthorizationVerification",
      "age18OrOlder",
      "deemedExportLicenseEligible",
      "conflictingObligations",
      "fugitiveFromJustice",
      "unlawfullyInUnitedStates",
      "unlawfulControlledSubstanceUser",
      "adjudicatedMentalDefectiveOrCommitted",
      "dishonorableMilitaryDischarge",
      "renouncedUsCitizenship",
      "onsiteSeattleFourDays",
      "sponsorship",
      "gender",
      "ethnicity",
      "hispanicLatinx",
      "veteran",
      "disability",
      "lgbtq",
    ].includes(decision.key);
}

async function verifyTextValue(frame, locator, decision, log) {
  if (!shouldVerifyText(decision)) return { filled: true };

  const answer = String(decision.answer || "");
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const value = await locator.inputValue({ timeout: 1000 }).catch(() => "");
    if (answerMatches(value, answer)) {
      log("greenhouse_text_value_verified", { fieldId: decision.fieldId, label: decision.label, attempt });
      return { filled: true };
    }

    await locator.click({ timeout: 3000 }).catch(() => {});
    await locator.fill("", { timeout: 1000 }).catch(() => {});
    await locator.fill(answer, { timeout: 3000 }).catch(async () => {
      await locator.pressSequentially(answer, { timeout: 5000 }).catch(() => {});
    });
    await locator.evaluate((el) => {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.blur();
    }).catch(() => {});
    await frame.waitForTimeout(150);
  }

  const finalValue = await locator.inputValue({ timeout: 1000 }).catch(() => "");
  if (answerMatches(finalValue, answer)) return { filled: true };
  log("greenhouse_text_value_mismatch", { fieldId: decision.fieldId, label: decision.label, expected: answer, actual: finalValue });
  return { filled: false, reason: "value_not_persisted" };
}

async function selectOption(locator, answer) {
  const options = await locator.locator("option").evaluateAll((els) =>
    els.map((el) => ({ label: el.textContent.trim(), value: el.value }))
  );
  const wanted = normalizeText(answer);
  const option =
    options.find((item) => normalizeText(item.label) === wanted) ||
    options.find((item) => normalizeText(item.label).includes(wanted)) ||
    options.find((item) => wanted.includes(normalizeText(item.label)));
  if (!option) return false;
  await locator.selectOption(option.value, { timeout: 3000 });
  return true;
}

async function clickChoice(frame, decision) {
  const label = decision.label || "";
  const answer = String(decision.answer || "").trim();
  const field = fieldLocator(frame, decision);
  
  if (decision.type === "checkbox") {
    const isYes = /^(yes|true|checked)$/i.test(answer);
    const isNo = /^(no|false|unchecked)$/i.test(answer);

    if (isYes) {
      if (!(await field.isChecked().catch(() => false))) {
        await field.click({ timeout: 3000, force: true });
      }
      return true;
    } else if (isNo) {
      if (await field.isChecked().catch(() => false)) {
        await field.click({ timeout: 3000, force: true });
      }
      return true;
    }
  }

  const parent = field.locator("xpath=ancestor::*[self::fieldset or @role='radiogroup' or @role='group' or self::div][1]");
  const exactText = new RegExp(`^\\s*${escapeRegExp(answer)}\\s*$`, "i");
  const choices = parent.getByText(exactText);
  if ((await choices.count().catch(() => 0)) > 0) {
    await choices.first().click({ timeout: 3000 });
    return true;
  }
  return false;
}

async function fillDecision(page, decision, log, answers = {}) {
  if (!decision.safeToFill) return { filled: false, reason: decision.reason };
  const frame = frameFor(page, decision.frameUrl);
  if (!frame) return { filled: false, reason: "frame_not_found" };
  const locator = fieldLocator(frame, decision);

  try {
    if (decision.key === "resume" || decision.type === "file") {
      await locator.setInputFiles(decision.answer, { timeout: 5000 });
      return { filled: true };
    }
    if (decision.type === "select") {
      const selected = await selectOption(locator, decision.answer);
      return selected ? { filled: true } : { filled: false, reason: "option_not_found" };
    }
    if (decision.type === "radio" || decision.type === "checkbox") {
      const clicked = await clickChoice(frame, decision);
      return clicked ? { filled: true } : { filled: false, reason: "choice_not_found" };
    }

    const label = normalizeText(decision.label);
    const isAshbyFrame = /ashbyhq\.com/i.test(decision.frameUrl || "");
    const isComboboxCandidate =
      decision.type === "text" &&
      (COMBOBOX_LABEL_RE.test(label) || /^question_/.test(decision.fieldId) || /^\d+$/.test(decision.fieldId));

    if (isComboboxCandidate && !(isAshbyFrame && /how did you hear/.test(label))) {
      if (await fillComboboxLikeField(frame, locator, decision.answer, log, decision, answers)) {
        return { filled: true };
      }
      if (requiresOptionSelection(decision, label)) {
        return { filled: false, reason: "option_not_found" };
      }
    }

    await locator.fill(String(decision.answer), { timeout: 3000 });
    return verifyTextValue(frame, locator, decision, log);
  } catch (error) {
    log("field_fill_failed", { fieldId: decision.fieldId, label: decision.label, error: error.message });
    return { filled: false, reason: "fill_failed", error: error.message };
  }
}

async function fillComboboxLikeField(frame, locator, answer, log, decision, answers = {}) {
  // Greenhouse frequently renders selects as text inputs backed by a popup.
  // Treat planned answers as candidates, then select an actual visible option
  // when one exists. Plain text acceptance is only a fallback.
  const mustSelectOption = requiresOptionSelection(decision, normalizeText(decision.label));
  if (decision.key === "locationCity") {
    const selected = await fillLocationAutocomplete(frame, locator, answer, log, decision, answers);
    if (selected) return true;
  }

  const candidates = optionCandidates(answer, decision, answers);
  if (!candidates.length) return false;

  await locator.click({ timeout: 3000 }).catch(() => {});

  for (const wanted of candidates) {
    await locator.fill("", { timeout: 1000 }).catch(() => {});
    await locator.fill(wanted, { timeout: 3000 }).catch(async () => {
      await locator.pressSequentially(wanted, { timeout: 3000 }).catch(() => {});
    });
    await frame.waitForTimeout(500);

    if (await clickVisibleOption(frame, wanted, decision, log, "typed")) return true;

    const exact = new RegExp(`^\\s*${escapeRegExp(wanted)}\\s*$`, "i");
    const contains = new RegExp(escapeRegExp(wanted), "i");

    for (const selector of OPTION_SELECTORS) {
      const options = frame.locator(selector).filter({ hasText: exact });
      if ((await options.count().catch(() => 0)) > 0 && await options.first().isVisible().catch(() => false)) {
        await options.first().click({ timeout: 3000 });
        log("dropdown_option_selected", { fieldId: decision.fieldId, label: decision.label, answer: wanted, originalAnswer: answer, strategy: selector });
        return true;
      }
    }

    for (const selector of OPTION_SELECTORS) {
      const options = frame.locator(selector).filter({ hasText: contains });
      if ((await options.count().catch(() => 0)) > 0 && await options.first().isVisible().catch(() => false)) {
        await options.first().click({ timeout: 3000 });
        log("dropdown_option_selected", { fieldId: decision.fieldId, label: decision.label, answer: wanted, originalAnswer: answer, strategy: `${selector}:contains` });
        return true;
      }
    }

    await locator.press("Enter", { timeout: 1000 }).catch(() => {});
    await frame.waitForTimeout(150);
    const value = await locator.inputValue({ timeout: 1000 }).catch(() => "");
    const normalizedValue = normalizeText(value);
    const normalizedWanted = normalizeText(wanted);
    const accepted = !!normalizedValue && (normalizedValue.includes(normalizedWanted) || normalizedWanted.includes(normalizedValue));
    log("dropdown_enter_attempted", { fieldId: decision.fieldId, label: decision.label, answer: wanted, originalAnswer: answer, value, accepted });
    if (accepted && !mustSelectOption) return true;
  }

  return false;
}

async function clickVisibleOption(frame, wanted, decision, log, strategy) {
  const exact = new RegExp(`^\\s*${escapeRegExp(wanted)}\\s*$`, "i");
  const contains = new RegExp(escapeRegExp(wanted), "i");
  const selectors = [
    "[role='option']",
    "[role='listbox'] *",
    "[id*='listbox'] *",
    "[class*='menu'] *",
    "[class*='option']",
    "li",
  ];

  for (const selector of selectors) {
    for (const re of [exact, contains]) {
      const options = frame.locator(selector).filter({ hasText: re });
      const count = await options.count().catch(() => 0);
      for (let i = 0; i < count; i += 1) {
        const option = options.nth(i);
        if (await option.isVisible().catch(() => false)) {
          const text = await option.innerText({ timeout: 1000 }).catch(() => "");
          await option.click({ timeout: 3000 });
          log("greenhouse_dropdown_option_selected", { fieldId: decision.fieldId, label: decision.label, answer: wanted, optionText: text, strategy });
          return true;
        }
      }
    }
  }

  return false;
}

async function fillLocationAutocomplete(frame, locator, answer, log, decision, answers = {}) {
  const candidates = optionCandidates(answer, decision, answers);
  const city = candidates.find((candidate) => !candidate.includes(",")) || String(answer || "").split(",")[0].trim();
  if (!city) return false;

  await locator.click({ timeout: 3000 }).catch(() => {});
  await locator.fill("", { timeout: 1000 }).catch(() => {});
  await locator.fill(city, { timeout: 3000 }).catch(async () => {
    await locator.pressSequentially(city, { timeout: 3000 }).catch(() => {});
  });
  await frame.waitForTimeout(700);

  for (const selector of LOCATION_OPTION_SELECTORS) {
    const options = frame.locator(selector).filter({ hasText: new RegExp(escapeRegExp(city), "i") });
    const count = await options.count().catch(() => 0);
    for (let i = 0; i < count; i += 1) {
      const option = options.nth(i);
      if (await option.isVisible().catch(() => false)) {
        const text = await option.innerText({ timeout: 1000 }).catch(() => "");
        await option.click({ timeout: 3000 });
        log("location_option_selected", { fieldId: decision.fieldId, label: decision.label, typed: city, optionText: text, strategy: selector });
        return true;
      }
    }
  }

  log("location_option_not_found", { fieldId: decision.fieldId, label: decision.label, typed: city });
  return false;
}

function optionCandidates(answer, decision, answers = {}) {
  const original = String(answer || "").trim();
  if (!original) return [];
  const label = normalizeText(decision.label);
  const key = decision.key || "";
  const candidates = [original];
  const educationAliases = (answers && typeof answers.educationAliases === "object") ? answers.educationAliases : {};

  if (key === "ethnicity" || /ethnic|race/.test(label)) {
    if (/south asian/i.test(original)) candidates.unshift("Asian");
  }

  if (key === "country" || /country/.test(label)) {
    if (/^(usa|us|u s|united states of america)$/i.test(original)) {
      candidates.push("United States", "United States of America", "+1 United States", "United States +1");
    }
  }

  if (key === "howDidYouHear" || /how did you hear/.test(label)) {
    if (/career|job|website|site/i.test(original)) candidates.push("Career Site");
  }

  if (key === "workAuthorization" || /(authorized|eligible).*work/.test(label)) {
    if (/^yes$/i.test(original)) {
      candidates.push("I am authorized to work for any employer in the country outlined in this role");
    }
  }

  if (key === "locationCity" || /location city|\bcity\b/.test(label)) {
    if (/seattle/i.test(original)) candidates.push("Seattle", "Seattle, WA", "Seattle, Washington");
  }

  if (key === "educationDegree" || /degree/.test(label)) {
    if (/master/i.test(original)) candidates.push("Master's Degree", "Masters", "Master");
    if (/bachelor/i.test(original)) candidates.push("Bachelor's Degree", "Bachelors", "Bachelor");
  }

  if (key === "educationSchool" || key === "educationDiscipline" || /school|university|college|discipline|field of study|major/.test(label)) {
    for (const [pattern, aliasGroup] of Object.entries(educationAliases)) {
      if (Array.isArray(aliasGroup) && new RegExp(pattern, "i").test(original)) {
        candidates.push(...aliasGroup);
      }
    }
  }

  if (key === "recruitmentPrivacyPolicyAcknowledgement" || /privacy policy|acknowledge/.test(label)) {
    candidates.push(
      "Acknowledge/Confirm",
      "I acknowledge",
      "Yes, I acknowledge",
      "I acknowledge that I have read and understand",
      "I have read and understand",
      "Yes"
    );
  }

  if (key === "prohibitedPossessorQuestionnaireAcknowledgement" || /prohibited possessor questionnaire|acknowledgment of receipt and review/.test(label)) {
    candidates.push("Acknowledge", "I acknowledge", "Yes");
  }

  if (key === "disability" || /disability/.test(label)) {
    if (/^no$/i.test(original)) candidates.push("No, I do not have a disability and have not had one in the past");
  }

  return [...new Set(candidates.filter(Boolean))];
}

async function fill(page, plan, log, answers = {}) {
  const results = [];
  for (const decision of plan.decisions) {
    if (!decision.safeToFill) {
      log("field_skipped", { fieldId: decision.fieldId, label: decision.label, reason: decision.reason, required: decision.required });
      results.push({ fieldId: decision.fieldId, filled: false, reason: decision.reason });
      continue;
    }
    const result = await fillDecision(page, decision, log, answers);
    if (result.filled) {
      log("field_filled", { fieldId: decision.fieldId, key: decision.key, label: decision.label, sensitive: decision.sensitive });
    } else {
      log("field_skipped", { fieldId: decision.fieldId, label: decision.label, reason: result.reason, required: decision.required });
    }
    results.push({ fieldId: decision.fieldId, ...result });
  }
  return results;
}

async function visibleButtonByText(page, re) {
  for (const frame of page.frames()) {
    const buttons = frame.locator("button, input[type='submit'], input[type='button'], a[role='button'], [role='tab'], a");
    const count = await buttons.count();
    for (let i = 0; i < count; i += 1) {
      const locator = buttons.nth(i);
      const meta = await locator.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return {
          text: (el.innerText || el.value || el.getAttribute("aria-label") || "").trim(),
          disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
          visible: !!(rect.width && rect.height),
        };
      }).catch(() => null);
      if (!meta || !meta.visible || meta.disabled || DANGEROUS_RE.test(meta.text)) continue;
      if (re.test(meta.text)) return { locator, text: meta.text, frameUrl: frame.url() };
    }
  }
  return null;
}

async function nextButton(page) {
  return visibleButtonByText(page, SAFE_NEXT_RE);
}

async function submitButton(page) {
  return visibleButtonByText(page, SUBMIT_RE);
}

module.exports = {
  name: "greenhouse",
  detect,
  extract,
  fill,
  nextButton,
  submitButton,
};
