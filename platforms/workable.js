const { extractFieldsFromFrame } = require("../lib/formSchema");
const greenhouse = require("./greenhouse");
const { normalizeText, escapeRegExp } = require("../lib/text");

function detect(page) {
  return page.frames().some((frame) => /workable\.com/i.test(frame.url())) || /workable\.com/i.test(page.url());
}

async function firstText(page, selectors) {
  for (const selector of selectors) {
    const value = await page.locator(selector).first().innerText({ timeout: 1000 }).catch(() => "");
    if (value && value.trim()) return value.trim();
  }
  return "";
}

function uniqueByFieldId(fields) {
  const seen = new Set();
  return fields.filter((field) => {
    if (!field.fieldId || seen.has(field.fieldId)) return false;
    seen.add(field.fieldId);
    return true;
  });
}

function digitString(value) {
  return String(value || "").replace(/\D+/g, "");
}

async function extractWorkableVirtualFields(frame, baseCount) {
  return frame.evaluate((startIndex) => {
    function clean(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function selectorFor(el) {
      if (el.id) return `[id="${el.id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
      const name = el.getAttribute("name");
      if (name) return `[name="${name.replace(/"/g, '\\"')}"]`;
      const dataUi = el.getAttribute("data-ui");
      if (dataUi) return `[data-ui="${dataUi.replace(/"/g, '\\"')}"]`;
      return null;
    }

    function labelFor(el) {
      const aria = clean(el.getAttribute("aria-label"));
      if (aria) return aria;
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id))
          .filter(Boolean)
          .map((node) => clean(node.innerText || node.textContent))
          .filter(Boolean)
          .join(" ");
        if (text) return text;
      }
      const id = el.getAttribute("id");
      if (id) {
        const explicit = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (explicit) {
          const text = clean(explicit.innerText || explicit.textContent);
          if (text) return text;
        }
      }
      const wrapper = el.closest("label, [data-testid], [role='group'], fieldset, section, div");
      if (wrapper) {
        const labelNode = wrapper.querySelector("label, legend, [class*='label'], [class*='title'], [class*='heading']");
        const text = clean(labelNode ? (labelNode.innerText || labelNode.textContent) : wrapper.innerText);
        if (text) return text.split("\n")[0];
      }
      return "";
    }

    function commonAncestor(elements) {
      if (!elements.length) return null;
      let node = elements[0].parentElement;
      while (node) {
        if (elements.every((el) => node.contains(el))) return node;
        node = node.parentElement;
      }
      return null;
    }

    function groupLabelFor(controls) {
      let container = commonAncestor(controls) || controls[0]?.parentElement;
      while (container) {
        const directLabelText = clean(
          Array.from(container.childNodes || [])
            .filter((node) => node !== controls[0]?.closest('[role="radiogroup"]'))
            .map((node) => node.innerText || node.textContent || "")
            .join(" ")
        );
        if (directLabelText) {
          const directLines = directLabelText
            .split(/\n+/)
            .map(clean)
            .filter(Boolean)
            .filter((line) => !/^(yes|no|true|false|svgs not supported by this browser\.)$/i.test(line));
          const directCandidate = directLines.find((line) => /[?*]/.test(line) || line.length > 20);
          if (directCandidate) return directCandidate;
        }

        const heading = container.querySelector(":scope > legend, :scope > [class*='question'], :scope > [class*='label'], :scope > [class*='title'], :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > p, :scope > span");
        const headingText = clean(heading ? (heading.innerText || heading.textContent) : "");
        if (headingText && !/^(yes|no|true|false|svgs not supported by this browser\.)$/i.test(headingText)) {
          if (/[?*]/.test(headingText) || headingText.length > 20) return headingText;
        }

        const lines = String(container.innerText || "")
          .split(/\n+/)
          .map(clean)
          .filter(Boolean)
          .filter((line) => !/^(yes|no|true|false|svgs not supported by this browser\.)$/i.test(line));
        const candidate = lines.find((line) => /[?*]/.test(line) || line.length > 20);
        if (candidate) return candidate;
        container = container.parentElement;
      }

      return labelFor(controls[0]);
    }

    function optionLabelFor(el) {
      const explicit = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      const wrapping = el.closest("label");
      const text = clean(
        explicit ? (explicit.innerText || explicit.textContent) :
        wrapping ? (wrapping.innerText || wrapping.textContent) :
        (el.getAttribute("value") || "")
      );
      if (/^true$/i.test(text)) return "Yes";
      if (/^false$/i.test(text)) return "No";
      return text;
    }

    const fields = [];
    const claimed = new Set();
    const radioGroups = Array.from(document.querySelectorAll("[role='radiogroup']"));
    for (const group of radioGroups) {
      const rect = group.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;

      const controls = Array.from(group.querySelectorAll("input[type='radio'][name]"));
      if (!controls.length) continue;
      const name = controls[0].getAttribute("name");
      if (!name) continue;

      const label = groupLabelFor(controls);
      const selector = `[name="${name.replace(/"/g, '\\"')}"]`;
      fields.push({
        fieldId: name,
        frameUrl: location.href,
        index: startIndex + fields.length,
        selector,
        id: "",
        name,
        label,
        normalizedLabel: clean(label).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
        type: "radio",
        tag: "workable-radio-group",
        required: controls.some((el) => el.required || el.getAttribute("aria-required") === "true") || /\*/.test(label),
        options: controls.map(optionLabelFor).filter(Boolean),
        visible: true,
        disabled: controls.every((el) => el.disabled || el.getAttribute("aria-disabled") === "true"),
      });
    }

    const comboboxes = Array.from(document.querySelectorAll("[role='combobox'], button[aria-haspopup='listbox'], [role='button'][aria-haspopup='listbox']"));
    for (const el of comboboxes) {
      if (claimed.has(el)) continue;
      claimed.add(el);
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const label = labelFor(el);
      const selector = selectorFor(el);
      if (!label && !selector) continue;
      const options = clean(el.getAttribute("aria-label")).split("|").map(clean).filter(Boolean);
      fields.push({
        fieldId: el.id || el.getAttribute("name") || `workable_combobox_${fields.length}`,
        frameUrl: location.href,
        index: startIndex + fields.length,
        selector,
        id: el.id || "",
        name: el.getAttribute("name") || "",
        label,
        normalizedLabel: clean(label).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
        type: "select",
        tag: "workable-combobox",
        required: el.getAttribute("aria-required") === "true" || /\*/.test(label),
        options,
        visible: true,
        disabled: el.getAttribute("aria-disabled") === "true" || el.disabled === true,
      });
    }

    const fileInputs = Array.from(document.querySelectorAll("input[type='file']"));
    for (const el of fileInputs) {
      const label = labelFor(el);
      const selector = selectorFor(el);
      if (!selector) continue;
      fields.push({
        fieldId: el.id || el.getAttribute("name") || `workable_file_${fields.length}`,
        frameUrl: location.href,
        index: startIndex + fields.length,
        selector,
        id: el.id || "",
        name: el.getAttribute("name") || "",
        label,
        normalizedLabel: clean(label).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
        type: "file",
        tag: "input",
        required: el.required || el.getAttribute("aria-required") === "true" || /\*/.test(label),
        options: [],
        visible: true,
        disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
      });
    }

    return fields;
  }, baseCount);
}

async function extract(page) {
  const frame = page.mainFrame();
  const baseFields = await extractFieldsFromFrame(frame);
  const virtualFields = await extractWorkableVirtualFields(frame, baseFields.length);
  const radioGroupNames = new Set(virtualFields.filter((field) => field.tag === "workable-radio-group").map((field) => field.name).filter(Boolean));
  const filteredBaseFields = baseFields.filter((field) => !(field.type === "radio" && radioGroupNames.has(field.name)));
  const fields = uniqueByFieldId([...filteredBaseFields, ...virtualFields]).filter((field) => field.visible && !field.disabled);

  return {
    platform: "workable",
    pageUrl: page.url(),
    jobTitle: await firstText(page, ["h1", "[data-ui='job-title']"]),
    company: await firstText(page, ["header img[alt]", "[data-ui='company-name']", "[class*='company']"]),
    fields,
  };
}

function optionCandidates(answer, decision, aliases = {}) {
  const original = String(answer || "").trim();
  if (!original) return [];
  const fromAliases = Array.isArray(aliases[decision.key]) ? aliases[decision.key] : [];
  return [...new Set([original, ...fromAliases].filter(Boolean))];
}

async function fillWorkableSelect(page, decision, log, options = {}) {
  const frame = page.mainFrame();
  const locator = decision.selector ? frame.locator(decision.selector).first() : null;
  if (!locator) return { filled: false, reason: "selector_missing" };
  const candidates = optionCandidates(decision.answer, decision, options.aliases || {});
  if (!candidates.length) return { filled: false, reason: "missing_answer" };

  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ timeout: 3000 }).catch(() => {});
  await frame.waitForTimeout(250);

  const popupSelectors = ["[role='option']", "[role='listbox'] *", "[class*='option']", "li"];
  for (const candidate of candidates) {
    const input = locator.locator("input").first();
    if (await input.count().catch(() => 0)) {
      await input.fill("", { timeout: 1000 }).catch(() => {});
      await input.fill(candidate, { timeout: 3000 }).catch(async () => {
        await input.pressSequentially(candidate, { timeout: 3000 }).catch(() => {});
      });
      await frame.waitForTimeout(300);
    }

    const exact = new RegExp(`^\\s*${escapeRegExp(candidate)}\\s*$`, "i");
    const contains = new RegExp(escapeRegExp(candidate), "i");
    for (const selector of popupSelectors) {
      for (const pattern of [exact, contains]) {
        const option = frame.locator(selector).filter({ hasText: pattern }).first();
        if (await option.isVisible().catch(() => false)) {
          await option.click({ timeout: 3000 }).catch(() => {});
          log("workable_option_selected", { fieldId: decision.fieldId, label: decision.label, answer: candidate });
          return { filled: true };
        }
      }
    }
  }

  return { filled: false, reason: "option_not_found" };
}

async function fillWorkableRadioGroup(page, decision, log) {
  const frame = page.mainFrame();
  const wantedYes = /^(yes|true)$/i.test(String(decision.answer || "").trim());
  const wantedNo = /^(no|false)$/i.test(String(decision.answer || "").trim());
  if (!wantedYes && !wantedNo) return { filled: false, reason: "choice_not_found" };

  const wantedTokens = wantedYes ? ["yes", "true"] : ["no", "false"];
  const oppositeTokens = wantedYes ? ["no", "false"] : ["yes", "true"];
  const wantedValue = wantedYes ? "true" : "false";
  const labelText = decision.label.replace(/^\*\s*/, "").trim();
  const groupCandidates = [];
  if (decision.selector) {
    const inputLocator = frame.locator(decision.selector);
    groupCandidates.push(
      frame.locator("[role='radiogroup']").filter({ has: inputLocator }).first(),
      frame.locator("fieldset").filter({ has: inputLocator }).first(),
      inputLocator.first().locator("xpath=ancestor::*[@role='radiogroup' or self::fieldset or contains(@class,'question') or contains(@class,'Question')][1]").first()
    );
  }
  groupCandidates.push(
    frame.locator("[role='radiogroup']").filter({ hasText: new RegExp(escapeRegExp(labelText), "i") }).first()
  );

  let matchingGroup = null;
  for (const candidate of groupCandidates) {
    if (await candidate.count().catch(() => 0)) {
      matchingGroup = candidate;
      break;
    }
  }

  async function readOptionMeta(locator) {
    return locator.evaluate((el) => {
      const collectText = (node) => (node && typeof node.textContent === "string" ? node.textContent.trim() : "");
      const directParts = [];
      const contextParts = [];
      const push = (bucket, value) => {
        if (value && typeof value === "string") bucket.push(value.trim());
      };
      const input = el.matches?.("input[type='radio']") ? el : el.querySelector?.("input[type='radio']") || null;
      const target = input || el;
      const id = target?.id || el.getAttribute?.("id") || "";
      const parentText = collectText(el.parentElement);
      const wrappingLabelText = collectText(el.closest?.("label"));
      const externalLabelText = id ? collectText(document.querySelector(`label[for="${id}"]`)) : "";
      push(directParts, el.innerText || "");
      push(directParts, el.textContent || "");
      push(directParts, el.getAttribute?.("aria-label") || "");
      push(directParts, target?.value || "");
      push(directParts, target?.getAttribute?.("aria-label") || "");
      push(directParts, wrappingLabelText);
      push(directParts, externalLabelText);
      push(contextParts, parentText);
      const directCombined = directParts.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
      const contextCombined = contextParts.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
      const combined = `${directCombined} ${contextCombined}`.trim();
      const selected = (
        el.getAttribute?.("aria-checked") === "true" ||
        target?.getAttribute?.("aria-checked") === "true" ||
        Boolean(target?.checked) ||
        Boolean(el.checked) ||
        el.querySelector?.("input[type='radio']:checked") ||
        el.querySelector?.("[role='radio'][aria-checked='true']")
      );
      return {
        combined,
        directCombined,
        contextCombined,
        text: (el.innerText || el.textContent || "").trim(),
        value: String(target?.value || ""),
        ariaLabel: el.getAttribute?.("aria-label") || target?.getAttribute?.("aria-label") || "",
        selected: Boolean(selected),
      };
    }).catch(() => ({
      combined: "",
      directCombined: "",
      contextCombined: "",
      text: "",
      value: "",
      ariaLabel: "",
      selected: false,
    }));
  }

  function containsAny(haystack, tokens) {
    const words = new Set(String(haystack || "").toLowerCase().match(/[a-z0-9]+/g) || []);
    return tokens.some((token) => words.has(token));
  }

  function matchesWanted(meta) {
    const directHasWanted = containsAny(meta.directCombined, wantedTokens);
    const directHasOpposite = containsAny(meta.directCombined, oppositeTokens);
    if (directHasWanted || directHasOpposite) {
      return directHasWanted && !directHasOpposite;
    }
    const contextHasWanted = containsAny(meta.contextCombined, wantedTokens);
    const contextHasOpposite = containsAny(meta.contextCombined, oppositeTokens);
    if (contextHasWanted || contextHasOpposite) {
      return contextHasWanted && !contextHasOpposite;
    }
    return false;
  }

  async function verifySelection(group) {
    const selectedCandidates = group.locator("[role='radio'][aria-checked='true'], input[type='radio']:checked, label:has(input[type='radio']:checked)");
    const count = await selectedCandidates.count().catch(() => 0);
    for (let i = 0; i < count; i += 1) {
      const meta = await readOptionMeta(selectedCandidates.nth(i));
      if (matchesWanted(meta)) return true;
    }
    return false;
  }

  if (!matchingGroup) {
    log("workable_radio_group_not_found", { fieldId: decision.fieldId, label: decision.label, answer: decision.answer });
    return { filled: false, reason: "group_not_found" };
  }

  const options = matchingGroup.locator("[role='radio'], label, button, input[type='radio']");
  const optionCount = await options.count().catch(() => 0);
  for (let i = 0; i < optionCount; i += 1) {
    const option = options.nth(i);
    const meta = await readOptionMeta(option);
    log("workable_radio_candidate_inspected", {
      fieldId: decision.fieldId,
      label: decision.label,
      answer: decision.answer,
      optionText: meta.text,
      optionValue: meta.value,
      optionAriaLabel: meta.ariaLabel,
      directCombined: meta.directCombined,
      contextCombined: meta.contextCombined,
      combined: meta.combined,
      selected: meta.selected,
    });
    if (!matchesWanted(meta)) continue;
    if (meta.selected) {
      log("workable_radio_already_selected", { fieldId: decision.fieldId, label: decision.label, answer: decision.answer, option: meta.text || meta.value });
      return { filled: true };
    }
    await option.click({ timeout: 3000, force: true }).catch(() => {});
    if (await verifySelection(matchingGroup)) {
      log("workable_radio_selected", { fieldId: decision.fieldId, label: decision.label, answer: decision.answer, option: meta.text || meta.value });
      return { filled: true };
    }
    log("workable_radio_click_not_verified", { fieldId: decision.fieldId, label: decision.label, answer: decision.answer, option: meta.text || meta.value });
  }

  const fallbackInput = matchingGroup.locator(`input[type='radio'][value='${wantedValue}']`).first();
  if (await fallbackInput.count().catch(() => 0)) {
    const fallbackLabel = await fallbackInput.evaluate((input) => {
      const id = input.id || "";
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) {
          label.click();
          return true;
        }
      }
      const wrappingLabel = input.closest("label");
      if (wrappingLabel) {
        wrappingLabel.click();
        return true;
      }
      input.click();
      return true;
    }).catch(() => false);
    if (fallbackLabel && await verifySelection(matchingGroup)) {
      log("workable_radio_selected", { fieldId: decision.fieldId, label: decision.label, answer: decision.answer, option: wantedValue });
      return { filled: true };
    }
    log("workable_radio_click_not_verified", { fieldId: decision.fieldId, label: decision.label, answer: decision.answer, option: wantedValue });
  }

  log("workable_radio_choice_not_found", { fieldId: decision.fieldId, label: decision.label, answer: decision.answer });
  return { filled: false, reason: "choice_not_found" };
}

async function fillWorkablePhone(page, decision, log) {
  const frame = page.mainFrame();
  const locator = decision.selector ? frame.locator(decision.selector).first() : null;
  if (!locator) return { filled: false, reason: "selector_missing" };

  const digits = digitString(decision.answer);
  if (!digits) return { filled: false, reason: "missing_answer" };
  const localDigits = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  const candidates = [localDigits, digits, `${localDigits.slice(0, 3)}-${localDigits.slice(3, 6)}-${localDigits.slice(6)}`].filter(Boolean);

  for (const candidate of candidates) {
    await locator.click({ timeout: 3000 }).catch(() => {});
    await locator.fill("", { timeout: 1000 }).catch(() => {});
    await locator.fill(candidate, { timeout: 3000 }).catch(async () => {
      await locator.pressSequentially(candidate, { timeout: 3000 }).catch(() => {});
    });
    await frame.waitForTimeout(150);
    const value = await locator.inputValue({ timeout: 1000 }).catch(() => "");
    const actualDigits = digitString(value);
    if (actualDigits.endsWith(localDigits)) {
      log("workable_phone_value_verified", { fieldId: decision.fieldId, label: decision.label, value });
      return { filled: true };
    }
  }

  return { filled: false, reason: "value_not_persisted" };
}

async function clearWorkableCoverLetterTextarea(page, decision, log) {
  const frame = page.mainFrame();
  const locator = decision.selector ? frame.locator(decision.selector).first() : null;
  if (!locator) return { filled: false, reason: "selector_missing" };

  await locator.click({ timeout: 3000 }).catch(() => {});
  await locator.fill("", { timeout: 1000 }).catch(() => {});
  await frame.waitForTimeout(100);
  const value = await locator.inputValue({ timeout: 1000 }).catch(() => "");
  if (value) {
    log("workable_cover_letter_textarea_clear_failed", { fieldId: decision.fieldId, label: decision.label, value });
    return { filled: false, reason: "value_not_persisted" };
  }

  log("workable_cover_letter_textarea_cleared", { fieldId: decision.fieldId, label: decision.label });
  return { filled: true, skipped: true };
}

async function fill(page, plan, log, options = {}) {
  const special = plan.decisions.filter((decision) =>
    decision.type === "select" ||
    decision.type === "radio" ||
    decision.type === "tel" ||
    (decision.key === "coverLetter" && decision.fieldId === "cover_letter")
  );
  const standard = plan.decisions.filter((decision) => !special.includes(decision));
  const results = [];

  if (standard.length) {
    results.push(...await greenhouse.fill(page, { ...plan, decisions: standard }, log, options));
  }

  for (const decision of special) {
    if (!decision.safeToFill) {
      log("field_skipped", { fieldId: decision.fieldId, label: decision.label, reason: decision.reason, required: decision.required });
      results.push({ fieldId: decision.fieldId, filled: false, reason: decision.reason });
      continue;
    }
    let result;
    if (decision.type === "select") {
      result = await fillWorkableSelect(page, decision, log, options);
    } else if (decision.type === "radio") {
      result = await fillWorkableRadioGroup(page, decision, log);
    } else if (decision.type === "tel") {
      result = await fillWorkablePhone(page, decision, log);
    } else if (decision.key === "coverLetter" && decision.fieldId === "cover_letter") {
      result = await clearWorkableCoverLetterTextarea(page, decision, log);
    } else {
      result = { filled: false, reason: "unsupported_workable_field" };
    }
    if (result.filled) {
      log("field_filled", { fieldId: decision.fieldId, key: decision.key, label: decision.label, sensitive: decision.sensitive });
    } else {
      log("field_skipped", { fieldId: decision.fieldId, label: decision.label, reason: result.reason, required: decision.required });
    }
    results.push({ fieldId: decision.fieldId, ...result });
  }

  return results;
}

module.exports = {
  name: "workable",
  detect,
  extract,
  fill,
  nextButton: greenhouse.nextButton,
  submitButton: greenhouse.submitButton,
};
