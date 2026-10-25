const CHALLENGE_WIDGET_SELECTOR = [
  "iframe[src*='recaptcha'][src*='/bframe']",
  "iframe[src*='recaptcha'][src*='/anchor']:not([src*='size=invisible'])",
  "iframe[src*='hcaptcha'][src*='challenge']",
  "iframe[src*='challenges.cloudflare.com'][title*='challenge' i]",
  ".g-recaptcha:not([data-size='invisible'])",
  ".h-captcha:not([data-size='invisible'])",
].join(", ");

const CHALLENGE_TEXT = /^\s*(verify you are human|human verification|i'?m not a robot|captcha verification)\s*[.!]?\s*$/i;

async function hasHumanVerification(page) {
  for (const frame of page.frames()) {
    const widgets = frame.locator(CHALLENGE_WIDGET_SELECTOR);
    const widgetCount = await widgets.count().catch(() => 0);
    for (let index = 0; index < widgetCount; index += 1) {
      if (await widgets.nth(index).isVisible().catch(() => false)) return true;
    }

    const challengeTexts = frame.getByText(CHALLENGE_TEXT);
    const textCount = await challengeTexts.count().catch(() => 0);
    for (let index = 0; index < textCount; index += 1) {
      if (await challengeTexts.nth(index).isVisible().catch(() => false)) return true;
    }
  }
  return false;
}

async function waitForHumanVerification(page, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120000;
  const pollMs = options.pollMs ?? 1000;
  const deadline = Date.now() + timeoutMs;

  while (await hasHumanVerification(page)) {
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(Math.min(pollMs, Math.max(0, deadline - Date.now())));
  }
  return true;
}

module.exports = {
  hasHumanVerification,
  waitForHumanVerification,
};
