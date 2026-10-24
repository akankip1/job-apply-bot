const DEFAULT_SUCCESS_TEXT = [
  /application (?:has been )?submitted/i,
  /application (?:was|has been) received/i,
  /thank you for (?:applying|your application)/i,
  /thanks for applying/i,
  /we(?:'ve| have) received your application/i,
];

const VALIDATION_SELECTOR = [
  "[aria-invalid='true']",
  "[role='alert']",
  ".field-error",
  ".error-message",
  "[data-testid*='error']",
].join(", ");

async function visibleSelector(frame, selector) {
  const locator = frame.locator(selector);
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}

async function findTextEvidence(frame, patterns) {
  const text = await frame.locator("body").innerText({ timeout: 1000 }).catch(() => "");
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

async function inspectSubmission(page, options) {
  for (const frame of page.frames()) {
    for (const selector of options.successSelectors || []) {
      if (await visibleSelector(frame, selector)) {
        return { confirmed: true, evidence: { type: "selector", value: selector, frameUrl: frame.url() } };
      }
    }

    const textEvidence = await findTextEvidence(frame, [...(options.successTexts || []), ...DEFAULT_SUCCESS_TEXT]);
    if (textEvidence) {
      return { confirmed: true, evidence: { type: "text", value: textEvidence, frameUrl: frame.url() } };
    }
  }

  const currentUrl = page.url();
  if (
    options.successUrl &&
    currentUrl !== options.beforeUrl &&
    options.successUrl.test(currentUrl)
  ) {
    return { confirmed: true, evidence: { type: "url", value: currentUrl } };
  }

  for (const frame of page.frames()) {
    if (await visibleSelector(frame, VALIDATION_SELECTOR)) {
      return { confirmed: false, reason: "validation_error_visible" };
    }
  }

  return { confirmed: false, reason: "confirmation_not_found" };
}

async function verifySubmission(page, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10000;
  const pollMs = options.pollMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  let result;

  do {
    result = await inspectSubmission(page, options);
    if (result.confirmed || result.reason === "validation_error_visible") return result;
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(Math.min(pollMs, Math.max(0, deadline - Date.now())));
  } while (Date.now() <= deadline);

  return result || { confirmed: false, reason: "confirmation_not_found" };
}

module.exports = {
  verifySubmission,
};
