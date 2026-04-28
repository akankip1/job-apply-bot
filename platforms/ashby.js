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
    if (decision.radioName) {
      const inputs = frame.locator(`input[type="radio"][name="${decision.radioName}"]`);
      const count = await inputs.count().catch(() => 0);
      if (count > 0) {
        for (const matcher of matchers) {
          for (let i = 0; i < count; i++) {
            const input = inputs.nth(i);
            const meta = await input.evaluate(el => ({
              value: el.value || "",
              labelText: (el.labels && el.labels[0] ? el.labels[0].innerText : "").trim()
            })).catch(() => ({ value: "", labelText: "" }));
            
            if (matcher.test(meta.value) || matcher.test(meta.labelText)) {
              if (await input.isVisible().catch(() => false)) {
                await input.click({ force: true, timeout: 3000 });
                log("ashby_radio_selected_by_name", { fieldId: decision.fieldId, answer: wanted, name: decision.radioName });
                return { filled: true };
              }
            }
          }
        }
      }
    }

    const questionPrefix = decision.label.slice(0, 50);
    const allDivs = frame.locator("div, fieldset, [role='radiogroup'], [role='group']");
    const divCount = await allDivs.count().catch(() => 0);
    
    let best = null;
    log("ashby_searching_groups", { fieldId: decision.label.slice(0, 30), divCount });
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
      log("ashby_group_found", { fieldId: decision.fieldId, text: best.text });
      const controls = best.group.locator("button, label, [role='radio'], [role='button'], input[type='radio']");
      const controlCount = await controls.count().catch(() => 0);
      
      for (const matcher of matchers) {
        for (let i = 0; i < controlCount; i++) {
          const control = controls.nth(i);
          const meta = await control.evaluate((el) => {
            return {
              text: (el.innerText || "").trim(),
              labelText: (el.labels && el.labels[0] ? el.labels[0].innerText : "").trim(),
              value: el.value || "",
              tagName: el.tagName.toLowerCase(),
              role: el.getAttribute("role") || ""
            };
          }).catch(() => ({ text: "", labelText: "", value: "", tagName: "", role: "" }));
          
          const combinedText = `${meta.text} ${meta.labelText} ${meta.value}`.trim();
          if (matcher.test(combinedText)) {
            await control.click({ force: true, timeout: 3000 }).catch(() => {});

            const isButton = meta.tagName === "button" || meta.role === "button";
            const confirmed = isButton || await best.group.locator("input[type='radio'], [aria-checked='true']").evaluateAll(els =>
              els.some(el => el.checked || el.getAttribute("aria-checked") === "true")
            ).catch(() => false);

            if (confirmed) {
              log("ashby_group_option_selected", { fieldId: decision.fieldId, label: decision.label, answer: wanted, matchedText: combinedText });
              return { filled: true };
            }
          }
        }
      }
    } else {
      const possibleControls = frame.locator("button, label, input[type='radio']");
      const possibleCount = await possibleControls.count().catch(() => 0);
      for (let i = 0; i < possibleCount; i++) {
        const control = possibleControls.nth(i);
        const val = await control.evaluate(el => el.innerText || el.labels?.[0]?.innerText || "").catch(() => "");
        if (matchers.some(m => m.test(val))) {
            const isNear = await control.evaluate((el, q) => {
                const body = document.body.innerText.toLowerCase();
                const idx = body.indexOf(q.toLowerCase());
                if (idx === -1) return false;
                return true; 
            }, questionPrefix).catch(() => false);
            
            if (isNear && await control.isVisible().catch(() => false)) {
                await control.click({ timeout: 3000 });
                log("ashby_group_option_selected_fallback", { fieldId: decision.fieldId, label: decision.label, answer: wanted });
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

  const cityRe = new RegExp(escapeRegExp(city), "i");
  const locator = await getAshbyLocationLocator(frame, decision);

  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ force: true, timeout: 3000 });
  await locator.focus();
  await frame.waitForTimeout(300);
  
  await locator.fill("", { timeout: 1000 }).catch(() => {});
  await frame.waitForTimeout(200);

  // Type full city name at a human pace
  await locator.pressSequentially(city, { delay: 150 });
  await frame.waitForTimeout(1500); // Wait for API

  const listboxSelectors = [
    frame.locator("[role='listbox']").first(),
    page.locator("[role='listbox']").first(),
    frame.locator("[class*='listbox']").first(),
    page.locator("[class*='listbox']").first(),
  ];

  let listbox = null;
  let appeared = false;

  for (const selector of listboxSelectors) {
    appeared = await selector.waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false);
    if (appeared) {
      listbox = selector;
      break;
    }
  }

  if (!appeared) {
    log("ashby_location_debug", { fieldId: decision.fieldId, city, reason: "listbox_never_appeared" });
    return { filled: false, reason: "location_listbox_not_found" };
  }

  // Filter for the best match - prefer the first one but ensure it's visible
  const options = listbox.locator("[role='option'], li, div[class*='option'], button");
  const count = await options.count().catch(() => 0);
  
  let selected = false;
  for (let i = 0; i < Math.min(count, 3); i++) {
    const opt = options.nth(i);
    const text = await opt.innerText().catch(() => "");
    if (cityRe.test(text)) {
      await opt.click({ force: true, timeout: 3000 });
      log("ashby_location_selected", { fieldId: decision.fieldId, typed: city, optionText: text, index: i });
      selected = true;
      break;
    }
  }

  if (selected) {
    await frame.waitForTimeout(1000); // Wait for potential state reset
    const finalValue = await locator.inputValue({ timeout: 1000 }).catch(() => "");
    return { filled: true, finalValue };
  }

  return { filled: false, reason: "matching_location_not_found" };
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
    
    if (String(decision.fieldId).startsWith("ashby_group_")) {
      specialDecisions.add(decision.fieldId);
      continue;
    }

    if (decision.label === "Where are you currently based?") {
      specialDecisions.add(decision.fieldId);
      continue;
    }
  }

  const remainingPlan = {
    ...plan,
    decisions: plan.decisions.filter((decision) => !specialDecisions.has(decision.fieldId)),
  };
  
  // 1. Fill Greenhouse-handled fields
  results.push(...await greenhouse.fill(page, remainingPlan, log));
  await page.waitForTimeout(500);

  // 2. Fill standard text fields
  for (const decision of remainingPlan.decisions.filter(isTextDecision)) {
    results.push({ fieldId: decision.fieldId, ...await fillTextAndVerify(page, decision, log) });
  }

  // 3. Fill Button Groups (First Pass)
  const groupDecisions = plan.decisions.filter(d => specialDecisions.has(d.fieldId) && d.label !== "Where are you currently based?");
  for (const decision of groupDecisions) {
    results.push({ fieldId: decision.fieldId, ...await clickAshbyButtonGroup(page, decision, log) });
  }

  // 4. Fill Location (LAST)
  const locationDecision = plan.decisions.find(d => d.label === "Where are you currently based?" && d.safeToFill);
  if (locationDecision) {
    results.push({ fieldId: locationDecision.fieldId, ...await fillLocationCombobox(page, locationDecision, log) });
    
    // 5. CLEANUP PASS: Re-verify critical button groups that Ashby often resets
    await page.waitForTimeout(1000);
    log("ashby_cleanup_pass", { message: "Re-verifying critical button groups after location fill" });
    for (const decision of groupDecisions) {
      if (/european union|visa sponsorship|relocate/i.test(decision.label)) {
        await clickAshbyButtonGroup(page, decision, log);
      }
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
