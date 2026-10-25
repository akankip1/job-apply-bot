const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { loadProfile } = require("./lib/profile");
const { loadAnswers } = require("./lib/answers");
const { loadConfig } = require("./lib/config");
const { readJobs, writeJson, writeJsonAtomic, createLogger } = require("./lib/io");
const { statusToBucket } = require("./lib/runResults");
const { createAnswerPlan, validatePlan, validateResume } = require("./lib/answerPlan");
const { initEmbedder } = require("./lib/embedClassify");
const { hasHumanVerification, waitForHumanVerification } = require("./lib/humanVerification");
const { installDryRunGuard } = require("./lib/dryRunGuard");
const { detectAdapter } = require("./platforms");

const ROOT = __dirname;
const SUBMIT_MODE = process.argv.includes("--submit");
const KEEP_OPEN = process.argv.includes("--keep-open") || !SUBMIT_MODE;
const WAIT_FOR_HUMAN = SUBMIT_MODE && process.argv.includes("--keep-open");
const JOB_LIMIT = parseLimitArg(process.argv.slice(2));
const CONCURRENCY = parseConcurrencyArg(process.argv.slice(2));
const PERSON = parsePersonArg(process.argv.slice(2));
const DATA_DIR = path.join(ROOT, "people", PERSON);
const CONFIG = loadConfig(PERSON);
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const RUN_DIR = path.join(DATA_DIR, "runs", RUN_ID);
const LOG_FILE = path.join(RUN_DIR, "log.jsonl");
const USER_DATA_DIR = path.join(DATA_DIR, ".browser-profile");

const FINAL_STATUS = {
  DRY_RUN: "dry_run_completed",
  SUBMITTED: "submitted",
  SUBMISSION_UNVERIFIED: "submission_unverified",
  BLOCKED: "blocked",
  FAILED: "failed",
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

function parseConcurrencyArg(args) {
  const concurrencyIndex = args.indexOf("--concurrency");
  if (concurrencyIndex === -1) return 1;

  const rawConcurrency = args[concurrencyIndex + 1];
  const concurrency = Number(rawConcurrency);
  if (!rawConcurrency || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5) {
    throw new Error("--concurrency must be a whole number between 1 and 5.");
  }
  return concurrency;
}

function parsePersonArg(args) {
  const idx = args.indexOf("--person");
  if (idx === -1) throw new Error("--person <name> is required.");
  const name = args[idx + 1];
  if (!name || name.startsWith("--")) throw new Error("--person requires a name argument.");
  return name;
}

fs.mkdirSync(RUN_DIR, { recursive: true });
const log = createLogger(LOG_FILE, SUBMIT_MODE, { quiet: CONCURRENCY > 1 });


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

async function dismissCookieBanner(page) {
  const selectors = [
    "#onetrust-accept-btn-handler",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "button:has-text('Accept all')",
    "button:has-text('Accept cookies')",
    "button:has-text('Accept')",
    "[data-testid*='cookie'] button",
    ".cookie-consent button",
  ];

  for (const frame of page.frames()) {
    for (const selector of selectors) {
      const locator = frame.locator(selector);
      const count = await locator.count().catch(() => 0);
      for (let i = 0; i < count; i += 1) {
        const candidate = locator.nth(i);
        const visible = await candidate.isVisible({ timeout: 2000 }).catch(() => false);
        if (!visible) continue;
        await candidate.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(500);
        return true;
      }
    }
  }

  return false;
}

function blockerStatus(blockers) {
  return blockers.length ? FINAL_STATUS.BLOCKED : null;
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

  const plan = await createAnswerPlan(schema, profile, answers, { log });

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
  const fillResults = await adapter.fill(page, plan, log, { aliases: CONFIG.optionAliases || {} });
  const fillBlockers = fillFailuresAsBlockers(plan, fillResults);
  const blockers = [...manualBlockers, ...(resumeBlocker ? [resumeBlocker] : []), ...fillBlockers];

  if (!blockers.length) {
    for (let recheck = 1; recheck <= 2 && !blockers.length; recheck += 1) {
      await page.waitForTimeout(500);
      const recheckSchema = await adapter.extract(page);
      const recheckSchemaPath = path.join(RUN_DIR, `job-${jobIndex}-step-${step}-recheck-${recheck}-form-schema.json`);
      writeJson(recheckSchemaPath, recheckSchema);
      log("form_schema_rechecked", {
        jobIndex,
        step,
        recheck,
        platform: recheckSchema.platform,
        fieldsCount: recheckSchema.fields.length,
        schemaPath: recheckSchemaPath,
      });

      const recheckPlan = await createAnswerPlan(recheckSchema, profile, answers, { log });
      const recheckPlanPath = path.join(RUN_DIR, `job-${jobIndex}-step-${step}-recheck-${recheck}-answer-plan.json`);
      writeJson(recheckPlanPath, recheckPlan);
      const recheckFillResults = await adapter.fill(page, recheckPlan, log, { aliases: CONFIG.optionAliases || {} });
      const verificationResults = await adapter.verify(page, recheckPlan, log);
      const validationBlockers = await adapter.validationErrors(page);
      const recheckResumeBlocker = validateResume(recheckPlan);
      blockers.push(
        ...validatePlan(recheckPlan),
        ...(recheckResumeBlocker ? [recheckResumeBlocker] : []),
        ...fillFailuresAsBlockers(recheckPlan, recheckFillResults),
        ...fillFailuresAsBlockers(recheckPlan, verificationResults),
        ...validationBlockers
      );
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
  const jobState = {
    blockers: [],
    confirmationEvidence: null,
    status: FINAL_STATUS.DRY_RUN,
    submissionAttempted: false,
    submissionReason: null,
  };
  log("job_started", { jobIndex, url });

  try {
    const loaded = await loadPage(page, url);
    if (!loaded) {
      jobState.status = FINAL_STATUS.FAILED;
      return jobState;
    }

    if (await dismissCookieBanner(page)) {
      log("cookie_banner_dismissed", { jobIndex });
    } else {
      log("no_cookie_banner", { jobIndex });
    }

    for (let step = 0; step < 8; step += 1) {
      log("page_visited", { jobIndex, step, url: page.url() });

      if (await hasHumanVerification(page)) {
        log("human_verification_possible", { jobIndex, step, url: page.url() });
        if (WAIT_FOR_HUMAN) {
          console.log("Human verification detected. Complete it in the browser within 2 minutes.");
          const resolved = await waitForHumanVerification(page);
          log(resolved ? "human_verification_resolved" : "human_verification_timeout", { jobIndex, step, url: page.url() });
          if (!resolved) {
            jobState.blockers.push({ reason: "human_verification_required", label: "Human verification" });
            break;
          }
        } else {
          jobState.blockers.push({ reason: "human_verification_required", label: "Human verification" });
          break;
        }
      }

      const adapter = detectAdapter(page);
      log("adapter_selected", { jobIndex, step, adapter: adapter.name });
      const result = await extractPlanAndFill(page, adapter, profile, answers, jobIndex, step);

      if (result.blockers.length) {
        jobState.blockers.push(...result.blockers);
        break;
      }

      const submitButton = await adapter.submitButton(page);
      if (submitButton) {
        if (!SUBMIT_MODE) {
          jobState.status = FINAL_STATUS.DRY_RUN;
          log("submission_skipped_dry_run", { buttonText: submitButton.text, frameUrl: submitButton.frameUrl });
          break;
        }
        const beforeUrl = page.url();
        jobState.submissionAttempted = true;
        await submitButton.locator.click({ timeout: 5000 });
        await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
        const verification = await adapter.verifySubmission(page, { beforeUrl }).catch((error) => ({
          confirmed: false,
          reason: "verification_error",
          error: error.message,
        }));
        if (verification.confirmed) {
          jobState.status = FINAL_STATUS.SUBMITTED;
          jobState.confirmationEvidence = verification.evidence;
          log("submission_confirmed", { confirmationEvidence: verification.evidence, confirmationUrl: page.url() });
        } else {
          jobState.status = FINAL_STATUS.SUBMISSION_UNVERIFIED;
          jobState.submissionReason = verification.reason;
          log("submission_unverified", {
            confirmationUrl: page.url(),
            reason: verification.reason,
            error: verification.error,
          });
        }
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
      log("job_blocked", { blockers: jobState.blockers });
    } else if (jobState.status === FINAL_STATUS.DRY_RUN) {
      log("dry_run_verified", { message: "All required fields filled or planned. No blockers." });
    }

    return jobState;
  } catch (error) {
    jobState.status = jobState.submissionAttempted ? FINAL_STATUS.SUBMISSION_UNVERIFIED : FINAL_STATUS.FAILED;
    if (jobState.submissionAttempted) jobState.submissionReason = "submission_attempt_error";
    log("job_failed", { jobIndex, url, error: error.stack || error.message });
    return jobState;
  } finally {
    log("job_finished", { jobIndex, url, status: jobState.status, blockers: jobState.blockers });
    if (!KEEP_OPEN || [FINAL_STATUS.SUBMITTED, FINAL_STATUS.SUBMISSION_UNVERIFIED].includes(jobState.status)) {
      await page.close().catch(() => {});
    }
  }
}

async function main() {
  const profile = loadProfile(DATA_DIR);
  profile.nearbyCities = CONFIG.nearbyCities || {};
  const { answersPath, answers } = loadAnswers(DATA_DIR);
  const allJobs = readJobs(DATA_DIR);
  const jobs = JOB_LIMIT ? allJobs.slice(0, JOB_LIMIT) : allJobs;
  log("run_started", {
    person: PERSON || null,
    dataDir: DATA_DIR,
    profilePath: profile.profilePath,
    answersPath,
    jobsAvailable: allJobs.length,
    jobsCount: jobs.length,
    jobLimit: JOB_LIMIT,
    concurrency: CONCURRENCY,
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

  if (!SUBMIT_MODE) await installDryRunGuard(context);

  const results = [];
  try {
    await initEmbedder();
    log("embedder_initialized", {});

    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      const batch = jobs.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((url, j) => {
          const jobIndex = i + j + 1;
          return processJob(context, url, profile, answers, jobIndex)
            .then((jobState) => ({
              url,
              status: jobState.status,
              blockers: jobState.blockers,
              confirmationEvidence: jobState.confirmationEvidence,
              submissionReason: jobState.submissionReason,
            }));
        })
      );
      results.push(...batchResults);
      if (CONCURRENCY > 1) {
        console.log(`Completed jobs ${i + 1}-${i + batch.length} of ${jobs.length}`);
      }
    }
  } finally {
    if (!KEEP_OPEN) await context.close();
  }

  log("run_finished", { results });
  
  const statusResults = results.map((r) => ({
    url: r.url,
    status: r.status,
    bucket: statusToBucket(r.status),
    blockers: r.blockers,
    confirmationEvidence: r.confirmationEvidence,
    submissionReason: r.submissionReason,
  }));

  const statusPath = path.join(RUN_DIR, "job-status.json");
  writeJsonAtomic(statusPath, { results: statusResults });
  log("status_file_written", { statusPath });

  console.table(results);
  if (KEEP_OPEN) console.log("Browser left open for review. Close it manually when finished.");
}

main().catch((error) => {
  log("fatal_error", { error: error.stack || error.message });
  process.exitCode = 1;
});
