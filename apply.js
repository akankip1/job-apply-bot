const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = __dirname;
const PROFILE_FILE = path.join(ROOT, "sravya_narayana_application_profile.md");
const FALLBACK_PROFILE_FILE = path.join(ROOT, "application_profile.md");
const JOBS_FILE = path.join(ROOT, "jobs.txt");
const SUBMIT_MODE = process.argv.includes("--submit");
const KEEP_OPEN = process.argv.includes("--keep-open") || !SUBMIT_MODE;
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const RUN_DIR = path.join(ROOT, "runs", RUN_ID);
const SCREENSHOT_DIR = path.join(RUN_DIR, "screenshots");
const LOG_FILE = path.join(RUN_DIR, "log.jsonl");
const USER_DATA_DIR = path.join(ROOT, ".browser-profile");

const FINAL_STATUS = {
  DRY_RUN: "dry_run_completed",
  SUBMITTED: "submitted",
  MISSING_REQUIRED: "blocked_missing_required_field",
  SENSITIVE: "blocked_sensitive_field",
  RESUME_MISSING: "blocked_resume_missing",
  PAGE_LOAD: "failed_page_load",
  SELECTOR: "failed_selector",
  UNKNOWN: "failed_unknown_error",
};

const SAFE_NEXT_RE = /^(next|continue|save and continue|review|review application|proceed|go to next|next step)$/i;
const SUBMIT_RE = /^(submit|submit application|send application|complete application|finish)$/i;
const DANGEROUS_RE = /(withdraw|delete|remove|cancel application|discard|reset)/i;

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function log(event, data = {}) {
  const row = {
    timestamp: new Date().toISOString(),
    mode: SUBMIT_MODE ? "submit" : "dry-run",
    event,
    ...data,
  };
  fs.appendFileSync(LOG_FILE, `${JSON.stringify(row)}\n`, "utf8");
  console.log(`${event}: ${JSON.stringify(data)}`);
}

function clean(value) {
  if (!value) return "";
  const trimmed = value.replace(/\r/g, "").trim();
  if (!trimmed || trimmed === "-" || /^n\/?a$/i.test(trimmed)) return "";
  return trimmed;
}

function parseMarkdownTable(markdown) {
  const values = new Map();
  for (const line of markdown.split(/\n/)) {
    if (!line.trim().startsWith("|") || /^[-|\s]+$/.test(line.replace(/\|/g, ""))) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => clean(cell));
    if (cells.length < 2) continue;
    const key = cells[0].toLowerCase();
    const value = cells.slice(1).join(" | ");
    if (!key || !value || key === "field" || key === "question" || key === "link type") continue;
    values.set(key, value);
  }
  return values;
}

function section(markdown, startHeading) {
  const re = new RegExp(`^#+\\s+${startHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  const match = markdown.match(re);
  if (!match) return "";
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const next = rest.search(/\n#\s+/);
  return clean(next >= 0 ? rest.slice(0, next) : rest);
}

function parseResumePath(markdown) {
  const codeBlock = markdown.match(/## Resume[\s\S]*?```(?:text)?\s*([\s\S]*?)```/i);
  const raw = clean(codeBlock ? codeBlock[1] : "");
  if (!raw) return "";
  if (/^file:\/\//i.test(raw)) {
    try {
      return decodeURIComponent(new URL(raw).pathname).replace(/^\/([A-Za-z]:\/)/, "$1").replace(/\//g, path.sep);
    } catch {
      return raw.replace(/^file:\/\/\//i, "").replace(/\//g, path.sep);
    }
  }
  return raw;
}

function firstSectionValue(markdown, heading, label) {
  const content = section(markdown, heading);
  const re = new RegExp(`\\*\\*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\*\\*\\s*([^\\n]+)`, "i");
  const match = content.match(re);
  return clean(match ? match[1] : "");
}

function parseProfile() {
  const profilePath = fs.existsSync(PROFILE_FILE) ? PROFILE_FILE : FALLBACK_PROFILE_FILE;
  if (!fs.existsSync(profilePath)) throw new Error("No application profile file found.");
  const markdown = fs.readFileSync(profilePath, "utf8");
  const table = parseMarkdownTable(markdown);
  const location = table.get("location") || "";
  const [city = "", state = "", country = ""] = location.split(",").map((part) => clean(part));
  const workExperience = section(markdown, "Work Experience");
  const education = section(markdown, "Education");
  const skills = section(markdown, "Skills").replace(/^##\s+/gm, "").replace(/^- /gm, "").trim();
  const resumePath = parseResumePath(markdown);

  return {
    profilePath,
    table,
    standard: {
      firstName: table.get("first name") || "",
      lastName: table.get("last name") || "",
      preferredName: table.get("preferred name") || "",
      email: table.get("email address") || "",
      phone: table.get("phone number") || "",
      location,
      city,
      state,
      country,
      address: table.get("address") || "",
      postalCode: table.get("postal code") || "",
      linkedIn: table.get("linkedin url") || "",
      github: table.get("github url") || "",
      portfolio: table.get("portfolio url") || "",
      currentTitle: firstSectionValue(markdown, "Work Experience", "Title"),
      currentEmployer: firstSectionValue(markdown, "Work Experience", "Company"),
      workExperience,
      education,
      skills,
      resumePath,
    },
    sensitive: {
      ethnicity: table.get("what is your ethnicity?") || "",
      authorizedUS: table.get("are you authorized to work in the us?") || "",
      authorizedCanada: table.get("are you authorized to work in canada?") || "",
      authorizedUK: table.get("are you authorized to work in the united kingdom?") || "",
      sponsorship: table.get("will you now or in the future require sponsorship for employment visa status?") || "",
      disability: table.get("do you have a disability?") || "",
      lgbtq: table.get("do you identify as lgbtq+?") || "",
      gender: table.get("what is your gender?") || "",
      veteran: table.get("are you a veteran?") || "",
    },
  };
}

function readJobs() {
  if (!fs.existsSync(JOBS_FILE)) {
    fs.writeFileSync(JOBS_FILE, "# Add one job application URL per line.\n", "utf8");
    return [];
  }
  return fs
    .readFileSync(JOBS_FILE, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function normalizeText(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9+]+/g, " ").replace(/\s+/g, " ").trim();
}

function fieldText(meta) {
  return normalizeText([meta.label, meta.placeholder, meta.ariaLabel, meta.name, meta.id, meta.nearbyText].filter(Boolean).join(" "));
}

function classifyField(meta, profile) {
  const text = fieldText(meta);
  const type = (meta.type || "").toLowerCase();
  if (type === "file") return { key: "resume", value: profile.standard.resumePath, sensitive: false };

  const candidates = [
    [/preferred.*name|nickname/, "preferredName"],
    [/first.*name|given.*name/, "firstName"],
    [/last.*name|family.*name|surname/, "lastName"],
    [/email|e mail/, "email"],
    [/phone|mobile|telephone/, "phone"],
    [/postal|zip/, "postalCode"],
    [/address(?!.*email)/, "address"],
    [/\bcity\b/, "city"],
    [/\bstate\b|province|region/, "state"],
    [/\bcountry\b/, "country"],
    [/location/, "location"],
    [/linkedin|linked in/, "linkedIn"],
    [/github|git hub/, "github"],
    [/portfolio|website|personal site/, "portfolio"],
    [/current.*title|job title|position title/, "currentTitle"],
    [/current.*employer|current.*company|company name/, "currentEmployer"],
    [/work experience|employment history|professional experience|experience summary/, "workExperience"],
    [/education|school|university|degree/, "education"],
    [/skills|technologies|technical skills/, "skills"],
  ];

  for (const [re, key] of candidates) {
    if (re.test(text)) return { key, value: profile.standard[key] || "", sensitive: false };
  }

  const sensitive = [
    [/ethnic|race/, "ethnicity"],
    [/(authorized|eligible|legally).*work.*(u s|us|united states|usa)/, "authorizedUS"],
    [/(authorized|eligible|legally).*work.*canada/, "authorizedCanada"],
    [/(authorized|eligible|legally).*work.*(united kingdom|uk|u k|britain)/, "authorizedUK"],
    [/sponsor|visa|h[- ]?1b|immigration/, "sponsorship"],
    [/disab/, "disability"],
    [/lgbtq|sexual orientation/, "lgbtq"],
    [/gender|sex/, "gender"],
    [/veteran|military/, "veteran"],
    [/salary|compensation|background check|criminal|terms|certif|truthful|accurate/, ""],
  ];

  for (const [re, key] of sensitive) {
    if (re.test(text)) return { key, value: key ? profile.sensitive[key] || "" : "", sensitive: true };
  }

  return { key: "", value: "", sensitive: false };
}

async function getControlMeta(locator) {
  return locator.evaluate((el) => {
    const labels = [];
    if (el.labels) labels.push(...Array.from(el.labels).map((label) => label.innerText));
    const id = el.getAttribute("id");
    if (id) {
      const explicit = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (explicit) labels.push(explicit.innerText);
    }
    const wrappingLabel = el.closest("label");
    if (wrappingLabel) labels.push(wrappingLabel.innerText);
    const fieldset = el.closest("fieldset");
    const legend = fieldset ? fieldset.querySelector("legend")?.innerText : "";
    const parent = el.closest("[role='group'], .form-group, .field, div, section, li");
    const nearbyText = parent ? parent.innerText : "";
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      type: (el.getAttribute("type") || el.tagName).toLowerCase(),
      name: el.getAttribute("name") || "",
      id: id || "",
      placeholder: el.getAttribute("placeholder") || "",
      ariaLabel: el.getAttribute("aria-label") || "",
      label: [legend, ...labels].filter(Boolean).join(" "),
      nearbyText,
      required: el.required || el.getAttribute("aria-required") === "true",
      visible: !!(rect.width && rect.height),
      disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
      value: el.value || "",
    };
  });
}

async function fillText(locator, meta, value) {
  const type = (meta.type || "").toLowerCase();
  if (["checkbox", "radio", "file", "submit", "button", "hidden"].includes(type)) return false;
  await locator.fill(value, { timeout: 3000 });
  return true;
}

async function selectOption(locator, value) {
  const options = await locator.locator("option").evaluateAll((els) =>
    els.map((el) => ({ label: el.textContent.trim(), value: el.value }))
  );
  const wanted = normalizeText(value);
  const option =
    options.find((item) => normalizeText(item.label) === wanted) ||
    options.find((item) => normalizeText(item.label).includes(wanted)) ||
    options.find((item) => wanted.includes(normalizeText(item.label)));
  if (!option) return false;
  await locator.selectOption(option.value, { timeout: 3000 });
  return true;
}

async function clickChoice(locator, meta, value) {
  const wanted = normalizeText(value);
  if (!wanted) return false;
  const parent = locator.locator("xpath=ancestor::*[self::fieldset or @role='radiogroup' or @role='group' or self::div][1]");
  const choices = parent.getByText(new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"));
  if ((await choices.count()) > 0) {
    await choices.first().click({ timeout: 3000 });
    return true;
  }
  const ownText = normalizeText([meta.label, meta.nearbyText, meta.name, meta.id].join(" "));
  if (ownText.includes(wanted)) {
    await locator.check({ timeout: 3000 });
    return true;
  }
  return false;
}

async function uploadResume(locator, profile, jobState) {
  const resumePath = profile.standard.resumePath;
  if (!resumePath || !fs.existsSync(resumePath)) {
    jobState.blockers.push({ reason: "resume_file_missing", resumePath });
    log("resume_file_missing", { resumePath });
    return false;
  }
  await locator.setInputFiles(resumePath, { timeout: 5000 });
  jobState.resumeUploaded = true;
  log("resume_uploaded", { resumePath });
  return true;
}

async function inspectAndFill(page, profile, jobState) {
  const controls = page.locator("input:not([type='hidden']), textarea, select");
  const count = await controls.count();
  for (let i = 0; i < count; i += 1) {
    const locator = controls.nth(i);
    let meta;
    try {
      meta = await getControlMeta(locator);
    } catch (error) {
      log("field_skipped", { reason: "metadata_error", error: error.message });
      continue;
    }
    if (!meta.visible || meta.disabled) continue;
    const classification = classifyField(meta, profile);
    log("field_detected", { label: meta.label, name: meta.name, id: meta.id, type: meta.type, required: meta.required });

    if (!classification.key || !classification.value) {
      const reason = classification.sensitive ? "sensitive_field_needs_confirmation" : "unknown_question";
      log("field_skipped", { reason, label: meta.label, name: meta.name, required: meta.required });
      if (meta.required) {
        jobState.blockers.push({ reason: classification.sensitive ? "required_sensitive_field" : "required_unknown_field", label: meta.label || meta.name || meta.id });
      }
      continue;
    }

    try {
      if (classification.key === "resume") {
        await uploadResume(locator, profile, jobState);
      } else if (meta.tag === "select") {
        const selected = await selectOption(locator, classification.value);
        if (!selected) throw new Error(`No matching option for ${classification.value}`);
      } else if (["radio", "checkbox"].includes(meta.type)) {
        const clicked = await clickChoice(locator, meta, classification.value);
        if (!clicked) throw new Error(`No matching choice for ${classification.value}`);
      } else {
        await fillText(locator, meta, classification.value);
      }
      log("field_filled", { key: classification.key, label: meta.label, name: meta.name, sensitive: classification.sensitive });
    } catch (error) {
      log("field_skipped", { reason: "failed_selector", key: classification.key, label: meta.label, error: error.message });
      if (meta.required) jobState.blockers.push({ reason: "required_fill_failed", label: meta.label || meta.name || meta.id });
    }
  }
}

async function saveScreenshot(page, jobIndex, label) {
  const filename = `${String(jobIndex).padStart(2, "0")}-${Date.now()}-${label}.png`;
  const filePath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filePath, fullPage: true });
  log("screenshot_saved", { label, filePath });
}

async function visibleButtonByText(page, re) {
  const buttons = page.locator("button, input[type='submit'], input[type='button'], a[role='button']");
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const locator = buttons.nth(i);
    const meta = await locator.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        text: (el.innerText || el.value || el.getAttribute("aria-label") || "").trim(),
        disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
        visible: !!(rect.width && rect.height),
      };
    });
    if (!meta.visible || meta.disabled || DANGEROUS_RE.test(meta.text)) continue;
    if (re.test(meta.text)) return { locator, text: meta.text };
  }
  return null;
}

async function hasHumanVerification(page) {
  const bodyText = normalizeText(await page.locator("body").innerText({ timeout: 5000 }).catch(() => ""));
  return /(captcha|recaptcha|human verification|verify you are human|cloudflare)/.test(bodyText);
}

async function processJob(context, url, profile, jobIndex) {
  const page = await context.newPage();
  const jobState = { blockers: [], resumeUploaded: false, status: FINAL_STATUS.DRY_RUN };
  log("job_started", { jobIndex, url });

  try {
    let loaded = false;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        loaded = true;
        break;
      } catch (error) {
        log("page_load_retry", { attempt, url, error: error.message });
      }
    }
    if (!loaded) {
      jobState.status = FINAL_STATUS.PAGE_LOAD;
      return jobState.status;
    }

    for (let step = 0; step < 8; step += 1) {
      log("page_visited", { jobIndex, url: page.url() });
      await saveScreenshot(page, jobIndex, `page-${step}-opened`);

      if (await hasHumanVerification(page)) {
        jobState.blockers.push({ reason: "human_verification" });
        break;
      }

      await inspectAndFill(page, profile, jobState);
      await saveScreenshot(page, jobIndex, `page-${step}-filled`);

      if (jobState.blockers.length) break;

      const submitButton = await visibleButtonByText(page, SUBMIT_RE);
      if (submitButton) {
        await saveScreenshot(page, jobIndex, "before-final-submission");
        if (!SUBMIT_MODE) {
          jobState.status = FINAL_STATUS.DRY_RUN;
          log("submission_skipped_dry_run", { buttonText: submitButton.text });
          break;
        }
        await submitButton.locator.click({ timeout: 5000 });
        await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
        await saveScreenshot(page, jobIndex, "after-submission");
        jobState.status = FINAL_STATUS.SUBMITTED;
        log("submitted", { confirmationUrl: page.url() });
        break;
      }

      const nextButton = await visibleButtonByText(page, SAFE_NEXT_RE);
      if (!nextButton) {
        jobState.status = FINAL_STATUS.DRY_RUN;
        log("no_safe_next_button", { url: page.url() });
        break;
      }
      await nextButton.locator.click({ timeout: 5000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    }

    if (jobState.blockers.length) {
      const hasSensitive = jobState.blockers.some((blocker) => /sensitive|human_verification/.test(blocker.reason));
      jobState.status = hasSensitive ? FINAL_STATUS.SENSITIVE : FINAL_STATUS.MISSING_REQUIRED;
      await saveScreenshot(page, jobIndex, "blocked-manual-review");
      log("job_blocked", { blockers: jobState.blockers });
    }

    return jobState.status;
  } catch (error) {
    jobState.status = FINAL_STATUS.UNKNOWN;
    log("job_failed", { jobIndex, url, error: error.stack || error.message });
    return jobState.status;
  } finally {
    log("job_finished", { jobIndex, url, status: jobState.status, blockers: jobState.blockers });
    if (!KEEP_OPEN || jobState.status === FINAL_STATUS.SUBMITTED) await page.close().catch(() => {});
  }
}

async function main() {
  const profile = parseProfile();
  const jobs = readJobs();
  log("run_started", { profilePath: profile.profilePath, jobsCount: jobs.length, runDir: RUN_DIR });

  if (!jobs.length) {
    log("run_finished", { status: "no_jobs", message: "Add application URLs to jobs.txt." });
    return;
  }

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1366, height: 900 },
  });

  const results = [];
  try {
    for (let i = 0; i < jobs.length; i += 1) {
      const status = await processJob(context, jobs[i], profile, i + 1);
      results.push({ url: jobs[i], status });
    }
  } finally {
    if (!KEEP_OPEN) await context.close();
  }

  log("run_finished", { results });
  console.table(results);
  if (KEEP_OPEN) {
    console.log("Browser left open for review. Close it manually when finished.");
  }
}

main().catch((error) => {
  log("fatal_error", { error: error.stack || error.message });
  process.exitCode = 1;
});
