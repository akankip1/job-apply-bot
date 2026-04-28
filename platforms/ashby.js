const { extractFieldsFromFrame } = require("../lib/formSchema");
const greenhouse = require("./greenhouse");
const { normalizeText, escapeRegExp } = require("../lib/text");

function detect(page) {
  return /jobs\.ashbyhq\.com/i.test(page.url());
}

async function firstText(page, selectors) {
  for (const selector of selectors) {
    const value = await page.locator(selector).first().innerText({ timeout: 1000 }).catch(() => "");
    if (value && value.trim()) return value.trim();
  }
  return "";
}

function fieldLocator(frame, decision) {
  if (decision.selector) return frame.locator(decision.selector).first();
  return frame.locator("input:not([type='hidden']), textarea, select").nth(decision.index);
}

async function extractAshbyButtonGroups(frame, existingCount) {
  return frame.evaluate((startIndex) => {
    function buttonGroupLabel(text) {
      const prefix = text.split(/\bYes\s+No\b/i)[0].trim();
      const questionMark = prefix.indexOf("?");
      return questionMark >= 0 ? prefix.slice(0, questionMark + 1).trim() : prefix;
    }

    const fields = [];
    const seenLabels = new Set();
    const groupCandidates = Array.from(document.querySelectorAll("div, fieldset"))
      .filter((el) => {
        const buttons = Array.from(el.querySelectorAll("button")).filter((button) => {
          const text = (button.innerText || "").trim().toLowerCase();
          return text === "yes" || text === "no";
        });
        return buttons.length === 2;
      });

    for (const group of groupCandidates) {
      const text = (group.innerText || "").replace(/\s+/g, " ").trim();
      if (/^Yes\s+No$/i.test(text)) continue;
      const label = /\bYes\s+No\b/i.test(text) ? buttonGroupLabel(text) : "";
      if (!label || seenLabels.has(label)) continue;
      seenLabels.add(label);
      const id = group.getAttribute("data-testid") || group.id || `ashby_button_group_${fields.length}`;
      fields.push({
        fieldId: id,
        frameUrl: location.href,
        index: startIndex + fields.length,
        selector: group.id ? `[id="${group.id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]` : null,
        id,
        name: "",
        label,
        normalizedLabel: label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
        type: "radio",
        tag: "button-group",
        required: /\*/.test(text) || /willing to move/i.test(label),
        options: ["Yes", "No"],
        visible: true,
        disabled: false,
      });
    }

    return fields;
  }, existingCount);
}

async function extract(page) {
  const fields = [];
  for (const frame of page.frames()) {
    const frameFields = await extractFieldsFromFrame(frame);
    fields.push(...frameFields);
    fields.push(...await extractAshbyButtonGroups(frame, fields.length));
  }

  const normalized = fields.map((field) => {
    if (field.label !== "Start typing...") return field;
    return {
      ...field,
      label: "Where are you currently based?",
      normalizedLabel: "where are you currently based",
      required: true,
    };
  });

  return {
    platform: "ashby",
    pageUrl: page.url(),
    jobTitle: await firstText(page, ["h1", "[data-testid='job-title']"]),
    company: await firstText(page, ["header img[alt]", "[data-testid='company-name']"]),
    fields: normalized,
  };
}

async function clickAshbyButtonGroup(page, decision, log) {
  const wanted = String(decision.answer || "").trim();
  if (!wanted) return { filled: false, reason: decision.reason };
  const question = normalizeText(decision.label);
  const answerRe = new RegExp(`^\\s*${escapeRegExp(wanted)}\\s*$`, "i");

  for (const frame of page.frames()) {
    const groups = frame.locator("div, fieldset").filter({ hasText: new RegExp(escapeRegExp(decision.label), "i") });
    const count = await groups.count().catch(() => 0);
    let best = null;
    for (let i = 0; i < count; i += 1) {
      const group = groups.nth(i);
      const text = normalizeText(await group.innerText({ timeout: 1000 }).catch(() => ""));
      if (!text.includes(question)) continue;
      const options = await group.locator("button").evaluateAll((buttons) =>
        buttons.map((button) => (button.innerText || "").trim()).filter(Boolean)
      ).catch(() => []);
      const yesNoOptions = options.filter((option) => /^(yes|no)$/i.test(option));
      if (yesNoOptions.length !== 2) continue;

      if (!best || text.length < best.textLength) best = { group, textLength: text.length };
    }

    if (best) {
      const button = best.group.locator("button").filter({ hasText: answerRe }).first();
      if (await button.isVisible().catch(() => false)) {
        await button.click({ timeout: 3000 });
        log("ashby_button_option_selected", { fieldId: decision.fieldId, label: decision.label, answer: wanted });
        return { filled: true };
      }
    }
  }

  return { filled: false, reason: "choice_not_found" };
}

async function fillLocationCombobox(page, decision, log) {
  const city = String(decision.answer || "").split(",")[0].trim();
  if (!city) return { filled: false, reason: "missing_location" };
  const frame = page.frames().find((item) => item.url() === decision.frameUrl) || page.mainFrame();
  const locator = fieldLocator(frame, decision);

  await locator.click({ timeout: 3000 });
  await locator.fill(city, { timeout: 3000 });
  await frame.waitForTimeout(700);

  const option = frame.locator("[role='option'], [class*='option'], [class*='select'] li, li").filter({ hasText: new RegExp(escapeRegExp(city), "i") }).first();
  if (await option.isVisible().catch(() => false)) {
    const text = await option.innerText({ timeout: 1000 }).catch(() => "");
    await option.click({ timeout: 3000 });
    log("ashby_location_option_selected", { fieldId: decision.fieldId, typed: city, optionText: text });
    return { filled: true };
  }

  const value = await locator.inputValue({ timeout: 1000 }).catch(() => "");
  return normalizeText(value).includes(normalizeText(city))
    ? { filled: true }
    : { filled: false, reason: "location_option_not_found" };
}

function isTextDecision(decision) {
  return ["email", "text", "textarea", "input"].includes(decision.type) && decision.safeToFill && decision.answer;
}

function answerMatches(value, answer) {
  const normalizedValue = normalizeText(value);
  const normalizedAnswer = normalizeText(answer);
  return !!normalizedValue && (normalizedValue === normalizedAnswer || normalizedValue.includes(normalizedAnswer));
}

async function fillTextAndVerify(page, decision, log) {
  const frame = page.frames().find((item) => item.url() === decision.frameUrl) || page.mainFrame();
  const locator = fieldLocator(frame, decision);
  const answer = String(decision.answer || "");

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const current = await locator.inputValue({ timeout: 1000 }).catch(() => "");
    if (answerMatches(current, answer)) {
      log("ashby_text_value_verified", { fieldId: decision.fieldId, label: decision.label, attempt });
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
  log("ashby_text_value_mismatch", { fieldId: decision.fieldId, label: decision.label, expected: answer, actual: finalValue });
  return { filled: false, reason: "value_not_persisted" };
}

async function fill(page, plan, log) {
  const specialDecisions = new Set();
  const results = [];

  for (const decision of plan.decisions) {
    if (!decision.safeToFill) continue;
    if (decision.type === "radio" && /yes|no/i.test(String(decision.answer))) {
      specialDecisions.add(decision.fieldId);
      continue;
    } else if (decision.label === "Where are you currently based?") {
      specialDecisions.add(decision.fieldId);
    }
  }

  const remainingPlan = {
    ...plan,
    decisions: plan.decisions.filter((decision) => !specialDecisions.has(decision.fieldId)),
  };
  results.push(...await greenhouse.fill(page, remainingPlan, log));
  await page.waitForTimeout(1500);

  for (const decision of remainingPlan.decisions.filter(isTextDecision)) {
    results.push({ fieldId: decision.fieldId, ...await fillTextAndVerify(page, decision, log) });
  }

  for (const decision of plan.decisions) {
    if (!decision.safeToFill) continue;
    if (decision.type === "radio" && /yes|no/i.test(String(decision.answer))) {
      results.push({ fieldId: decision.fieldId, ...await clickAshbyButtonGroup(page, decision, log) });
    } else if (decision.label === "Where are you currently based?") {
      results.push({ fieldId: decision.fieldId, ...await fillLocationCombobox(page, decision, log) });
    }
  }

  return results;
}

module.exports = {
  name: "ashby",
  detect,
  extract,
  fill,
  nextButton: greenhouse.nextButton,
  submitButton: greenhouse.submitButton,
};
