async function hasHumanVerification(page) {
  for (const frame of page.frames()) {
    const widgets = frame.locator("iframe[src*='recaptcha'], iframe[src*='hcaptcha'], .g-recaptcha, .h-captcha");
    const widgetCount = await widgets.count().catch(() => 0);
    for (let index = 0; index < widgetCount; index += 1) {
      if (await widgets.nth(index).isVisible().catch(() => false)) return true;
    }

    const challengeTexts = frame.getByText(/verify you are human|human verification|i'?m not a robot|captcha verification/i);
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
