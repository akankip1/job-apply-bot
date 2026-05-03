# Context: Job-Level Parallelism

## Goal

Process multiple job applications concurrently to reduce total run time. Currently 10 jobs
take ~10x the time of 1 job because they run sequentially.

## Current execution model - `apply.js`

```js
// Sequential loop in main()
for (let i = 0; i < jobs.length; i += 1) {
  const status = await processJob(context, jobs[i], profile, answers, i + 1);
  results.push({ url: jobs[i], status });
}
```

Each `processJob` call:
1. Opens a new `page` (browser tab) via `context.newPage()`
2. Navigates to the job URL
3. Loops through up to 8 form steps (extract → plan → fill → next)
4. Closes the page when done

Jobs are fully independent — separate URLs, separate forms, separate `fillHistory` sets.
No shared mutable state between jobs.

## What's safe to parallelize

- **Page creation** — `context.newPage()` creates isolated tabs within the same browser context.
- Playwright supports multiple concurrent pages.
- **Profile and answers** — read-only objects, safe to share across concurrent jobs.
- **`fillHistory`** — already scoped per job (created inside `processJob`).
- **File writes** — `writeJson` writes to job-specific paths (`job-${jobIndex}-step-...`).
- `log` uses `appendFileSync` which is atomic for small writes on all platforms.

## What needs fixing for parallelism

### 1. Embedder singleton race condition - `lib/embedClassify.js`

```js
let embedder = null;

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return embedder;
}
```

If two jobs call `classifyField` simultaneously before the embedder is loaded, both enter the
`if (!embedder)` branch and trigger two model loads. The second load may overwrite the first mi

**Fix:** Pre-warm the embedder once before the parallel loop starts. Add an `initEmbedder()`
export that forces the lazy load, call it in `main()` before processing jobs.

### 2. Console output interleaving

With concurrent jobs, `console.log` from the logger produces interleaved output:
```js
job_started: {"jobIndex":1,"url":"..."}
job_started: {"jobIndex":2,"url":"..."}
form_schema_extracted: {"jobIndex":2,...}
form_schema_extracted: {"jobIndex":1,...}
```

The log file (`log.jsonl`) is fine — each line is a complete JSON object with `jobIndex`.
But console output becomes unreadable.

**Fix:** Suppress per-event console output during parallel execution. Print a progress summary instead
(e.g., "Processing jobs 1-3..."). The detailed log is always in `log.jsonl`.

### 3. `KEEP_OPEN` behavior with parallel pages

Currently, when `KEEP_OPEN` is true (dry-run mode), pages stay open for manual review.
With 3 concurrent jobs, 3 tabs stay open simultaneously — this is actually fine and useful for review.
No change needed.

## What NOT to change

- **Multi-step forms within a job** — steps are sequential by nature (fill → click Next → fill next page).
- Cannot parallelize.
- **The persistent browser context** — shared cookies/sessions across tabs is desirable
- (logged-in state persists). Don't use separate browser contexts per job.
- **The `--submit` safety gate** — must remain intact regardless of concurrency.
- **Adapter code** — `platforms/*.js` operates on a single `page` object. No changes needed.
- **Answer planning** — `lib/answerPlan.js` and friends are stateless functions. Safe as-is.

## Rate limiting consideration

ATS platforms (Greenhouse, Ashby) may throttle or block rapid concurrent requests from the same IP.
Default concurrency should be conservative (2). Maximum should be capped (5). Users can tune via
`--concurrency N`.