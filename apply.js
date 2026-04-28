const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { loadProfile } = require("./lib/profile");
const { loadAnswers } = require("./lib/answers");
const { readJobs, writeJson, createLogger } = require("./lib/io");
const { createAnswerPlan, validatePlan, validateResume } = require("./lib/answerPlan");
const { detectAdapter } = require("./platforms");
const { normalizeText } = require("./lib/text");

const ROOT = __dirname;
const SUBMIT_MODE = process.argv.includes("--submit");
const KEEP_OPEN = process.argv.includes("--keep-open") || !SUBMIT_MODE;
const JOB_LIMIT = parseLimitArg(process.argv.slice(2));
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
  UNKNOWN: "failed_unknown_error",
};

function parseLimitArg(args) {
  const limitIndex = args.indexOf("--limit");
  if (limitIndex === -1) return null;

  const rawLimit = args[limitIndex + 1];
  const limit = Number(rawLimit);
  if (!rawLimit || !Number.isInteger(limit) || limit < 1) {
    throw new Error("--limit must be a positive whole number.");
  }
  return limit;
}

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
const log = createLogger(LOG_FILE, SUBMIT_MODE);

async function saveScreenshot(page, jobIndex, label) {
  const filename = `${String(jobIndex).padStart(2, "0")}-${Date.now()}-${label}.png`;
  const filePath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filePath, fullPage: true });
  log("screenshot_saved", { label, filePath });
  return filePath;
}

async function hasHumanVerification(page) {
  for (const frame of page.frames()) {
    const widgets = frame.locator("iframe[src*='recaptcha'], iframe[src*='hcaptcha'], .g-recaptcha, .h-captcha");
    const widgetCount = await widgets.count().catch(() => 0);
    for (let i = 0; i < widgetCount; i += 1) {
      if (await widgets.nth(i).isVisible().catch(() => false)) return true;
    }

    const challengeTexts = frame.getByText(/verify you are human|human verification|i'?m not a robot|captcha verification/i);
    const textCount = await challengeTexts.count().catch(() => 0);
    for (let i = 0; i < textCount; i += 1) {
      if (await challengeTexts.nth(i).isVisible().catch(() => false)) return true;
    }
  }
  return false;
}

async function loadPage(page, url) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      return true;
    } catch (error) {
      log("page_load_retry", { attempt, url, error: error.message });
    }
  }
  return false;
}

function blockerStatus(blockers) {
  if (blockers.some((blocker) => /resume/.test(blocker.reason))) return FINAL_STATUS.RESUME_MISSING;
  if (blockers.some((blocker) => /sensitive|legal|human_verification/.test(blocker.reason))) return FINAL_STATUS.SENSITIVE;
  return FINAL_STATUS.MISSING_REQUIRED;
}

function fillFailuresAsBlockers(plan, fillResults) {
  const byId = new Map(fillResults.map((result) => [result.fieldId, result]));
  return plan.decisions
    .filter((decision) => decision.required && decision.safeToFill)
    .filter((decision) => !byId.get(decision.fieldId)?.filled)
    .map((decision) => ({
      reason: byId.get(decision.fieldId)?.reason || "required_fill_failed",
      label: decision.label,
      fieldId: decision.fieldId,
    }));
}

function fieldIdentity(field) {
  return [field.fieldId, field.selector, field.id, field.name, normalizeText(field.label)].filter(Boolean).join("|");
}

async function extractPlanAndFill(page, adapter, profile, answers, jobIndex, step) {
  const schema = await adapter.extract(page);
  const schemaPath = path.join(RUN_DIR, `job-${jobIndex}-step-${step}-form-schema.json`);
  writeJson(schemaPath, schema);
  log("form_schema_extracted", {
    jobIndex,
    step,
    platform: schema.platform,
    fieldsCount: schema.fields.length,
    schemaPath,
  });

  const plan = createAnswerPlan(schema, profile, answers);
  const planPath = path.join(RUN_DIR, `job-${jobIndex}-step-${step}-answer-plan.json`);
  writeJson(planPath, plan);
  log("answer_plan_created", {
    jobIndex,
    step,
    decisionsCount: plan.decisions.length,
    manualReviewCount: plan.manualReview.length,
    planPath,
  });

  const resumeBlocker = validateResume(plan);
  const manualBlockers = validatePlan(plan);
  const fillResults = await adapter.fill(page, plan, log);
  const fillBlockers = fillFailuresAsBlockers(plan, fillResults);
  const blockers = [...manualBlockers, ...(resumeBlocker ? [resumeBlocker] : []), ...fillBlockers];

  if (!blockers.length) {
    await page.waitForTimeout(500);
    const knownFields = new Set(schema.fields.map(fieldIdentity));
    const dynamicSchema = await adapter.extract(page);
    const dynamicFields = dynamicSchema.fields.filter((field) => !knownFields.has(fieldIdentity(field)));

    if (dynamicFields.length) {
      const dynamicOnlySchema = { ...dynamicSchema, fields: dynamicFields };
      const dynamicSchemaPath = path.join(RUN_DIR, `job-${jobIndex}-step-${step}-dynamic-form-schema.json`);
      writeJson(dynamicSchemaPath, dynamicOnlySchema);
      log("dynamic_form_schema_extracted", {
        jobIndex,
        step,
        platform: dynamicSchema.platform,
        fieldsCount: dynamicFields.length,
        schemaPath: dynamicSchemaPath,
      });

      const dynamicPlan = createAnswerPlan(dynamicOnlySchema, profile, answers);
      const dynamicPlanPath = path.join(RUN_DIR, `job-${jobIndex}-step-${step}-dynamic-answer-plan.json`);
      writeJson(dynamicPlanPath, dynamicPlan);
      log("dynamic_answer_plan_created", {
        jobIndex,
        step,
        decisionsCount: dynamicPlan.decisions.length,
        manualReviewCount: dynamicPlan.manualReview.length,
        planPath: dynamicPlanPath,
      });

      const dynamicFillResults = await adapter.fill(page, dynamicPlan, log);
      blockers.push(...validatePlan(dynamicPlan), ...fillFailuresAsBlockers(dynamicPlan, dynamicFillResults));
    }
  }

  return {
    schema,
    plan,
    blockers,
    schemaPath,
    planPath,
  };
}

async function processJob(context, url, profile, answers, jobIndex) {
  const page = await context.newPage();
  const jobState = { blockers: [], status: FINAL_STATUS.DRY_RUN };
  log("job_started", { jobIndex, url });

  try {
    const loaded = await loadPage(page, url);
    if (!loaded) {
      jobState.status = FINAL_STATUS.PAGE_LOAD;
      return jobState.status;
    }

    for (let step = 0; step < 8; step += 1) {
      log("page_visited", { jobIndex, step, url: page.url() });
      await saveScreenshot(page, jobIndex, `step-${step}-opened`);

      if (await hasHumanVerification(page)) {
        log("human_verification_possible", { jobIndex, step, url: page.url() });
      }

      const adapter = detectAdapter(page);
      log("adapter_selected", { jobIndex, step, adapter: adapter.name });
      const result = await extractPlanAndFill(page, adapter, profile, answers, jobIndex, step);
      await saveScreenshot(page, jobIndex, `step-${step}-filled`);

      if (result.blockers.length) {
        jobState.blockers.push(...result.blockers);
        break;
      }

      const submitButton = await adapter.submitButton(page);
      if (submitButton) {
        await saveScreenshot(page, jobIndex, "before-final-submission");
        if (!SUBMIT_MODE) {
          jobState.status = FINAL_STATUS.DRY_RUN;
          log("submission_skipped_dry_run", { buttonText: submitButton.text, frameUrl: submitButton.frameUrl });
          break;
        }
        await submitButton.locator.click({ timeout: 5000 });
        await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
        await saveScreenshot(page, jobIndex, "after-submission");
        jobState.status = FINAL_STATUS.SUBMITTED;
        log("submitted", { confirmationUrl: page.url() });
        break;
      }

      const nextButton = await adapter.nextButton(page);
      if (!nextButton) {
        jobState.status = FINAL_STATUS.DRY_RUN;
        log("no_safe_next_button", { url: page.url() });
        break;
      }
      await nextButton.locator.click({ timeout: 5000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    }

    if (jobState.blockers.length) {
      jobState.status = blockerStatus(jobState.blockers);
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
  const profile = loadProfile(ROOT);
  const { answersPath, answers } = loadAnswers(ROOT);
  const allJobs = readJobs(ROOT);
  const jobs = JOB_LIMIT ? allJobs.slice(0, JOB_LIMIT) : allJobs;
  log("run_started", {
    profilePath: profile.profilePath,
    answersPath,
    jobsAvailable: allJobs.length,
    jobsCount: jobs.length,
    jobLimit: JOB_LIMIT,
    runDir: RUN_DIR,
  });

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
      const status = await processJob(context, jobs[i], profile, answers, i + 1);
      results.push({ url: jobs[i], status });
    }
  } finally {
    if (!KEEP_OPEN) await context.close();
  }

  log("run_finished", { results });
  
  const statusMapping = {
    [FINAL_STATUS.SUBMITTED]: "applied",
    [FINAL_STATUS.DRY_RUN]: "applied",
    [FINAL_STATUS.MISSING_REQUIRED]: "failed",
    [FINAL_STATUS.SENSITIVE]: "failed",
    [FINAL_STATUS.RESUME_MISSING]: "failed",
    [FINAL_STATUS.PAGE_LOAD]: "failed",
    [FINAL_STATUS.UNKNOWN]: "failed",
  };

  const statusResults = results.map((r) => ({
    url: r.url,
    status: r.status,
    bucket: statusMapping[r.status] || "failed",
  }));

  const statusPath = path.join(RUN_DIR, "job-status.json");
  writeJson(statusPath, { results: statusResults });
  log("status_file_written", { statusPath });

  console.table(results);
  if (KEEP_OPEN) console.log("Browser left open for review. Close it manually when finished.");
}

main().catch((error) => {
  log("fatal_error", { error: error.stack || error.message });
  process.exitCode = 1;
});
