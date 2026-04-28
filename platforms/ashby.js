const { extractFieldsFromFrame } = require("../lib/formSchema");
const greenhouse = require("./greenhouse");
const { normalizeText, escapeRegExp } = require("../lib/text");

function detect(page) {
  return page.frames().some((frame) => /ashbyhq\.com/i.test(frame.url())) || /jobs\.ashbyhq\.com/i.test(page.url());
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

function getStableKey(decision) {
  const label = normalizeText(decision.label || "");
  
  // Requirement 1: Targeted resume categories
  const isAutofill = /autofill|parse|parsing/.test(label);
  const isResume = /resume|cv/.test(label);

  if (isAutofill && isResume) {
    return "category:resume_autofill_upload";
  }
  if (isResume) {
    return "category:resume_attachment_upload";
  }
  
  if (label.includes("currently based") || label.includes("typing")) {
    return "category:location";
  }

  if (label) {
    return `label:${label}`;
  }
  
  return `id:${decision.fieldId}`;
}

async function extractAshbyButtonGroups(frame, existingCount) {
  return frame.evaluate((startIndex) => {
    function getGroupLabel(group) {
      const heading = group.querySelector("h1, h2, h3, h4, h5, h6, [class*='label'], [class*='title'], [class*='heading'], legend");
      if (heading && heading.innerText.trim()) return heading.innerText.trim();
      
      const parent = group.parentElement;
      if (parent) {
        const parentHeading = parent.querySelector("[class*='label'], [class*='title'], [class*='heading'], legend");
        if (parentHeading && parentHeading.innerText.trim()) return parentHeading.innerText.trim();
      }

      const text = (group.innerText || "").replace(/\s+/g, " ").trim();
      const prefix = text.split(/\b(Yes|No)\b/i)[0].trim();
      const questionMark = prefix.lastIndexOf("?");
      if (questionMark >= 0) {
        const lastNewline = prefix.lastIndexOf("\n", questionMark);
        return prefix.slice(lastNewline + 1, questionMark + 1).trim();
      }
      return prefix.split("\n").pop().trim();
    }

    const fields = [];
    const seenLabels = new Set();
    const allContainers = Array.from(document.querySelectorAll("div, fieldset, [role='radiogroup']"));
    
    const sortedContainers = allContainers.sort((a, b) => {
      const depthA = document.evaluate("count(ancestor::*)", a, null, XPathResult.NUMBER_TYPE, null).numberValue;
      const depthB = document.evaluate("count(ancestor::*)", b, null, XPathResult.NUMBER_TYPE, null).numberValue;
      return depthB - depthA;
    });

    const claimedControls = new Set();

    for (const group of sortedContainers) {
      const controls = Array.from(group.querySelectorAll("button, input[type='radio'], [role='radio'], [role='button']"));
      if (controls.length < 2 || controls.length > 10) continue;
      
      if (controls.some(c => claimedControls.has(c))) continue;
      controls.forEach(c => claimedControls.add(c));

      const label = getGroupLabel(group);
      if (!label || seenLabels.has(label) || label.length > 300) continue;
      seenLabels.add(label);
      
      const isRadio = controls.every(c => c.tagName.toLowerCase() === 'input' || c.getAttribute('role') === 'radio');
      const id = group.getAttribute("data-testid") || group.id || `ashby_group_${fields.length}`;
      
      fields.push({
        fieldId: id,
        frameUrl: location.href,
        index: startIndex + fields.length,
        selector: group.id ? `[id="${group.id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]` : (group.getAttribute("data-testid") ? `[data-testid="${group.getAttribute("data-testid")}"]` : null),
        id,
        name: "",
        radioName: isRadio ? controls[0].getAttribute("name") : null,
        label,
        normalizedLabel: label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
        type: "radio",
        tag: isRadio ? "radio-group" : "button-group",
        required: group.innerText.includes("*") || /willing to move|authorized|sponsorship|relocate|disability|veteran|gender|race|ethnic|experience/i.test(label),
        options: controls.map(c => (c.innerText || c.labels?.[0]?.innerText || "").trim()),
        visible: true,
        disabled: false,
        _childIndices: controls.map(c => Array.from(document.querySelectorAll("input:not([type='hidden']), textarea, select")).indexOf(c)).filter(i => i !== -1)
      });
    }
    return fields;
  }, existingCount);
}

async function extract(page) {
  const fields = [];
  for (const frame of page.frames()) {
    const frameFields = await extractFieldsFromFrame(frame);
    const groups = await extractAshbyButtonGroups(frame, frameFields.length);
    const childIndices = new Set(groups.flatMap(g => g._childIndices || []));
    const filteredFrameFields = frameFields.filter(f => !childIndices.has(f.index));
    fields.push(...filteredFrameFields, ...groups);
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
  
  const isYesNo = /^(yes|no|true|false)$/i.test(wanted);
  const isWantedYes = /^(yes|true)$/i.test(wanted);

  const yesMatchers = [/^\s*yes\b/i, /i have a disability/i, /i am a veteran/i, /identify as transgender/i, /i identify as/i, /i have/i];
  const noMatchers = [/^\s*no\b/i, /don't have a disability/i, /do not have a disability/i, /not a veteran/i, /do not identify/i, /don't identify/i, /prefer not to/i, /i do not/i, /i don't/i, /i do not have a disability/i];

  let matchers = [];
  if (isYesNo) {
    matchers = isWantedYes ? yesMatchers : noMatchers;
  } else {
    matchers = [new RegExp(escapeRegExp(wanted), "i")];
  }

  const question = normalizeText(decision.label);

  for (const frame of page.frames()) {
    const questionPrefix = decision.label.slice(0, 50);
    const allDivs = frame.locator("div, fieldset, [role='radiogroup'], [role='group']");
    const divCount = await allDivs.count().catch(() => 0);
    
    let best = null;
    for (let i = 0; i < divCount; i += 1) {
      const group = allDivs.nth(i);
      const rawText = await group.innerText({ timeout: 500 }).catch(() => "");
      if (!rawText) continue;
      
      const text = normalizeText(rawText);
      const isMatch = text.includes(question) || 
                      text.includes(normalizeText(questionPrefix)) ||
                      (/disab/i.test(decision.label) && /disab/i.test(text));

      if (isMatch) {
        if (!best || rawText.length < best.rawLength) {
          best = { group, rawLength: rawText.length, text: text.slice(0, 50) };
        }
      }
    }

    if (best) {
      const controls = best.group.locator("button, label, [role='radio'], [role='button'], input[type='radio']");
      const controlCount = await controls.count().catch(() => 0);
      
      for (const matcher of matchers) {
        for (let i = 0; i < controlCount; i++) {
          const control = controls.nth(i);
          const meta = await control.evaluate((el) => {
            const isChecked = el.checked || el.getAttribute("aria-checked") === "true" || el.classList.contains("selected") || el.getAttribute("data-state") === "on";
            return {
              text: (el.innerText || "").trim(),
              labelText: (el.labels && el.labels[0] ? el.labels[0].innerText : "").trim(),
              value: el.value || "",
              isChecked
            };
          }).catch(() => ({ text: "", labelText: "", value: "", isChecked: false }));
          
          const combinedText = `${meta.text} ${meta.labelText} ${meta.value}`.trim();
          if (matcher.test(combinedText)) {
            if (meta.isChecked) {
              log("ashby_group_already_selected_skipped", { fieldId: decision.fieldId, label: decision.label, answer: wanted });
              return { filled: true };
            }

            await control.click({ force: true, timeout: 3000 }).catch(() => {});
            log("ashby_group_option_selected", { fieldId: decision.fieldId, label: decision.label, answer: wanted });
            return { filled: true };
          }
        }
      }
    }
  }

  return { filled: false, reason: "choice_not_found" };
}

async function getAshbyLocationLocator(frame, decision) {
  const candidates = [
    frame.locator("input[placeholder='Start typing...']").first(),
    frame.locator("input[placeholder*='Start typing']").first(),
    frame.locator("input[placeholder*='typing']").first(),
    frame.locator("input[aria-label*='location' i]").first(),
    frame.locator("input[aria-label*='based' i]").first(),
  ];

  for (const candidate of candidates) {
    if (await candidate.count().catch(() => 0)) {
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }
  }

  return fieldLocator(frame, decision);
}

async function fillLocationCombobox(page, decision, log) {
  const city = String(decision.answer || "").split(",")[0].trim();
  if (!city) return { filled: false, reason: "missing_location" };

  const frame =
    page.frames().find((item) => item.url() === decision.frameUrl) ||
    page.frames().find((item) => /ashbyhq\.com/i.test(item.url())) ||
    page.mainFrame();

  const locator = await getAshbyLocationLocator(frame, decision);

  const current = await locator.inputValue().catch(() => "");
  if (current && current.length > 3) {
      log("ashby_location_already_filled_skipped", { fieldId: decision.fieldId, value: current });
      return { filled: true };
  }

  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ force: true, timeout: 3000 });
  await locator.focus();
  await frame.waitForTimeout(300);
  
  await locator.fill("", { timeout: 1000 }).catch(() => {});
  await frame.waitForTimeout(200);

  await locator.pressSequentially(city, { delay: 150 });
  await frame.waitForTimeout(1500);

  await locator.press("ArrowDown");
  await frame.waitForTimeout(200);
  await locator.press("Enter");
  await frame.waitForTimeout(1000);

  const finalValue = await locator.inputValue({ timeout: 1000 }).catch(() => "");
  log("ashby_location_selected_via_keys", { fieldId: decision.fieldId, typed: city, finalValue });
  
  return { filled: true, finalValue };
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

const globallyFilledKeys = new Set();

async function fill(page, plan, log) {
  const specialDecisions = new Set();
  const results = [];

  for (const decision of plan.decisions) {
    if (!decision.safeToFill) continue;
    
    if (String(decision.fieldId).startsWith("ashby_group_")) {
      specialDecisions.add(decision.fieldId);
      continue;
    }

    if (decision.label === "Where are you currently based?") {
      specialDecisions.add(decision.fieldId);
      continue;
    }
  }

  const fillIfNew = async (decision, fillFn) => {
      const key = getStableKey(decision);
      if (globallyFilledKeys.has(key)) {
          // Requirement 4: Targeted log for skipped resume upload
          if (key.startsWith("category:resume")) {
              log("ashby_resume_upload_already_done_skipped", { fieldId: decision.fieldId, label: decision.label, category: key });
          } else {
              log("ashby_field_already_filled_skipped", { fieldId: decision.fieldId, key, label: decision.label });
          }
          return { filled: true, skipped: true };
      }
      const res = await fillFn();
      if (res.filled) globallyFilledKeys.add(key);
      return res;
  };

  // 1. Location FIRST
  const locationDecision = plan.decisions.find(d => d.label === "Where are you currently based?" && d.safeToFill);
  if (locationDecision) {
    results.push({ fieldId: locationDecision.fieldId, ...await fillIfNew(locationDecision, () => fillLocationCombobox(page, locationDecision, log)) });
    await page.waitForTimeout(1000);
  }

  // Filter remaining plan to skip already filled categories before greenhouse
  const filteredRemainingDecisions = plan.decisions.filter((decision) => {
      if (specialDecisions.has(decision.fieldId)) return false;
      const key = getStableKey(decision);
      if (globallyFilledKeys.has(key)) {
          if (key.startsWith("category:resume")) {
              log("ashby_resume_upload_already_done_skipped", { fieldId: decision.fieldId, label: decision.label, category: key });
          }
          results.push({ fieldId: decision.fieldId, filled: true, skipped: true });
          return false;
      }
      return true;
  });

  const remainingPlan = { ...plan, decisions: filteredRemainingDecisions };
  
  // 2. Greenhouse-handled (Resume etc)
  const ghResults = await greenhouse.fill(page, remainingPlan, log);
  for (const res of ghResults) {
      if (res.filled) {
          const decision = remainingPlan.decisions.find(d => d.fieldId === res.fieldId);
          if (decision) globallyFilledKeys.add(getStableKey(decision));
      }
  }
  results.push(...ghResults);

  // 3. Text fields verification
  for (const decision of remainingPlan.decisions.filter(isTextDecision)) {
    results.push({ fieldId: decision.fieldId, ...await fillIfNew(decision, () => fillTextAndVerify(page, decision, log)) });
  }

  // 4. Button Groups
  const groupDecisions = plan.decisions.filter(d => specialDecisions.has(d.fieldId) && d.label !== "Where are you currently based?");
  for (const decision of groupDecisions) {
    results.push({ fieldId: decision.fieldId, ...await fillIfNew(decision, () => clickAshbyButtonGroup(page, decision, log)) });
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
