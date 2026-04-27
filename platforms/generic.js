const { extractFieldsFromFrame } = require("../lib/formSchema");
const greenhouse = require("./greenhouse");

async function extract(page) {
  const fields = [];
  for (const frame of page.frames()) {
    fields.push(...await extractFieldsFromFrame(frame));
  }
  return {
    platform: "generic",
    pageUrl: page.url(),
    jobTitle: await page.locator("h1").first().innerText({ timeout: 1000 }).catch(() => ""),
    company: "",
    fields,
  };
}

module.exports = {
  name: "generic",
  detect: () => true,
  extract,
  fill: greenhouse.fill,
  nextButton: greenhouse.nextButton,
  submitButton: greenhouse.submitButton,
};
