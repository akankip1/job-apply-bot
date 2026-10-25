const SAFE_NEXT_RE = /^(application|next|continue|save and continue|review|review application|proceed|go to next|next step)$/i;
const FINAL_SUBMIT_RE = /^(submit|submit application|send application|complete application|finish|apply|apply now)$/i;

function isSafeDryRunSubmitText(text) {
  return SAFE_NEXT_RE.test(String(text || "").trim());
}

async function installDryRunGuard(context) {
  await context.addInitScript(({ safeNextSource, safeNextFlags, finalSubmitSource, finalSubmitFlags }) => {
    const safeNextPattern = new RegExp(safeNextSource, safeNextFlags);
    const finalSubmitPattern = new RegExp(finalSubmitSource, finalSubmitFlags);
    const controlText = (control) => String(
      control?.innerText || control?.value || control?.getAttribute?.("aria-label") || ""
    ).trim();

    Object.defineProperty(HTMLFormElement.prototype, "submit", {
      configurable: false,
      value() {
        window.__jobApplyBotBlockedSubmission = true;
      },
    });

    document.addEventListener("click", (event) => {
      const control = event.target?.closest?.("button, input[type='submit'], input[type='image'], a[role='button']");
      if (!control) return;

      const text = controlText(control);
      const tag = control.tagName.toLowerCase();
      const type = String(control.getAttribute("type") || "").toLowerCase();
      const submitsForm = (tag === "button" && (!type || type === "submit")) || tag === "input";
      if ((submitsForm || finalSubmitPattern.test(text)) && !safeNextPattern.test(text)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.__jobApplyBotBlockedSubmission = true;
      }
    }, true);

    document.addEventListener("submit", (event) => {
      const submitter = event.submitter;
      const text = controlText(submitter);

      if (!submitter || !safeNextPattern.test(text)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.__jobApplyBotBlockedSubmission = true;
      }
    }, true);
  }, {
    safeNextSource: SAFE_NEXT_RE.source,
    safeNextFlags: SAFE_NEXT_RE.flags,
    finalSubmitSource: FINAL_SUBMIT_RE.source,
    finalSubmitFlags: FINAL_SUBMIT_RE.flags,
  });
}

module.exports = {
  installDryRunGuard,
  isSafeDryRunSubmitText,
};
