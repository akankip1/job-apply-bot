# Plan: Job-Level Parallelism

Single session — 5 tasks.

## Task 1: Add `initEmbedder()` to `lib/embedClassify.js`

- [ ] Add and export an `initEmbedder()` function that forces the lazy embedder load:

async function initEmbedder() {
if (!embedder) {
embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
}
}

- [ ] Update `module.exports` to include `initEmbedder`
- [ ] `getEmbedder()` stays as-is — it still works for sequential mode and as a fallback
- [ ] Verify: `node --check lib/embedClassify.js`
- **File:** `lib/embedClassify.js`

## Task 2: Add `--concurrency` flag parsing to `apply.js`

- [ ] Add `parseConcurrencyArg(args)` - extracts `--concurrency N` from argv
- [ ] Validate: must be integer between 1 and 5, default 1
- [ ] Add `const CONCURRENCY = parseConcurrencyArg(process.argv.slice(2));` alongside existing arg parsing
- [ ] Verify: `node --check apply.js`
- **File:** `apply.js`

## Task 3: Pre-warm embedder in `main()` - `apply.js`

- [ ] Import `initEmbedder` from `./lib/embedClassify`
- [ ] Call `await initEmbedder()` in `main()` before the job processing loop, after profile/answers are loaded
- [ ] Log the event: `log("embedder_initialized", {})`
- [ ] This runs regardless of concurrency level — eliminates the race condition and also speeds up the
- first job in sequential mode
- [ ] Verify: `node --check apply.js`
- **File:** `apply.js`

## Task 4: Replace sequential loop with batched parallel execution - `apply.js`

- [ ] Replace the sequential `for` loop in `main()` with batched `Promise.all`:

for (let i = 0; i < jobs.length; i += CONCURRENCY) {
const batch = jobs.slice(i, i + CONCURRENCY);
const batchResults = await Promise.all(
batch.map((url, j) => {
const jobIndex = i + j + 1;
return processJob(context, url, profile, answers, jobIndex)
.then(status => ({ url, status }));
})
);
results.push(...batchResults);
}

- [ ] When `CONCURRENCY === 1`, this behaves identically to the current sequential loop (batch size 1)
- [ ] When `CONCURRENCY > 1`, suppress per-event `console.log` in the logger — add a `quiet` flag:
    - Modify `createLogger` in `lib/io.js` to accept an optional `quiet` parameter
    - When `quiet` is true, write to file only, skip `console.log`
    - Pass `quiet: CONCURRENCY > 1` when creating the logger
- [ ] After each batch completes, print a progress line: `console.log(\`Completed jobs ${i+1}-${i+batch.length} of ${jobs.length}\`)`
- [ ] Verify: `node --check apply.js` and `node --check lib/io.js`
- **Files:** `apply.js`, `lib/io.js`

## Task 5: Update docs and package.json

- [ ] `README.md` - add `--concurrency` to the Commands section:

# Process 3 jobs at a time
node apply.js --person john-doe --concurrency 3

- [ ] `DEVELOPMENT.md` - add a note about parallelism under Architecture or Notes:
    - Jobs are processed in batches of `--concurrency N` (default 1, max 5)
    - The embedder is pre-warmed before the loop to avoid race conditions
    - Console output is suppressed during parallel runs; check `log.jsonl` for details
    - ATS platforms may throttle concurrent requests; keep concurrency ≤ 3 for safety
- [ ] Verify: no syntax check needed for .md files
- **Files:** `README.md`, `DEVELOPMENT.md`

## Verification

```bash
node --check lib/embedClassify.js
node --check lib/io.js
node --check apply.js
# Functional test: run with --concurrency 1 (should behave identically to before)
# Functional test: run with --concurrency 2 --limit 4 (should process 2 batches of 2)
```