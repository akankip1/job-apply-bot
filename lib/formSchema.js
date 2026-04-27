const { normalizeText } = require("./text");

const CONTROL_SELECTOR = "input:not([type='hidden']), textarea, select";
const FIELD_CONTAINER_SELECTOR = "[data-testid], [role='group'], fieldset, .field, .form-field, .application-question, div, section, li";

function compactText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\*/g, "*")
    .trim();
}

function dedupeWords(value) {
  const text = compactText(value);
  const half = Math.floor(text.length / 2);
  if (text.length > 8 && text.slice(0, half).trim() === text.slice(half).trim()) {
    return text.slice(0, half).trim();
  }
  return text;
}

async function getElementMeta(locator, index, frameUrl) {
  // Run label discovery in the browser context so native label relationships,
  // wrapping labels, and nearby question text are captured consistently.
  return locator.evaluate((el, args) => {
    const labels = [];
    const id = el.getAttribute("id") || "";

    if (el.labels) labels.push(...Array.from(el.labels).map((label) => label.innerText));
    if (id) {
      const explicit = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (explicit) labels.push(explicit.innerText);
    }
    const wrappingLabel = el.closest("label");
    if (wrappingLabel) labels.push(wrappingLabel.innerText);
    const fieldset = el.closest("fieldset");
    const legend = fieldset ? fieldset.querySelector("legend")?.innerText : "";
    const parent = el.closest(args.fieldContainerSelector) || el.parentElement;
    const nearbyText = parent ? parent.innerText : "";
    const options = el.tagName.toLowerCase() === "select"
      ? Array.from(el.options).map((option) => ({ label: option.textContent.trim(), value: option.value }))
      : [];
    const rect = el.getBoundingClientRect();

    return {
      frameUrl: args.frameUrl,
      index: args.index,
      tag: el.tagName.toLowerCase(),
      type: (el.getAttribute("type") || el.tagName).toLowerCase(),
      id,
      name: el.getAttribute("name") || "",
      placeholder: el.getAttribute("placeholder") || "",
      ariaLabel: el.getAttribute("aria-label") || "",
      label: [legend, ...labels].filter(Boolean).join(" "),
      nearbyText,
      required: el.required || el.getAttribute("aria-required") === "true" || /\*/.test([legend, ...labels, nearbyText].join(" ")),
      disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
      visible: !!(rect.width && rect.height),
      value: el.value || "",
      options,
    };
  }, { index, frameUrl, fieldContainerSelector: FIELD_CONTAINER_SELECTOR }, { timeout: 2000 });
}

function stableSelector(field) {
  if (field.id) return `[id="${String(field.id).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
  if (field.name) return `[name="${field.name.replace(/"/g, '\\"')}"]`;
  return null;
}

function cleanField(raw) {
  const labelSource = raw.label || raw.ariaLabel || raw.placeholder || raw.nearbyText || raw.id || raw.name || "";
  const label = dedupeWords(labelSource);
  return {
    fieldId: raw.id || raw.name || `${raw.frameUrl}#field-${raw.index}`,
    frameUrl: raw.frameUrl,
    index: raw.index,
    selector: stableSelector(raw),
    id: raw.id,
    name: raw.name,
    label,
    normalizedLabel: normalizeText(label),
    type: raw.type === "textarea" ? "textarea" : raw.type,
    tag: raw.tag,
    required: !!raw.required,
    options: raw.options || [],
    visible: raw.visible,
    disabled: raw.disabled,
  };
}

async function extractFieldsFromFrame(frame) {
  const frameUrl = frame.url();
  const controls = frame.locator(CONTROL_SELECTOR);
  const count = await controls.count();
  const fields = [];
  for (let index = 0; index < count; index += 1) {
    const locator = controls.nth(index);
    let raw;
    try {
      raw = await getElementMeta(locator, index, frameUrl, { timeout: 2000 });
    } catch {
      continue;
    }
    const field = cleanField(raw);
    if (field.visible && !field.disabled) fields.push(field);
  }
  return fields;
}

module.exports = {
  extractFieldsFromFrame,
};
