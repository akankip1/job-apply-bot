# Prompt: Job-Level Parallelism

## Objective

Add `--concurrency N` flag to process multiple job applications in parallel browser tabs.
Default 1 (sequential, current behavior). Max 5.

## Before you start

Read `Specs/parallelism/CONTEXT.md` for what's safe to parallelize and what needs fixing,
then `Specs/parallelism/PLAN.md` for the task list.

## Tasks (5 total, single session)

1. Add `initEmbedder()` export to `lib/embedClassify.js` — pre-warm the lazy singleton
2. Add `--concurrency N` flag parsing to `apply.js`
3. Call `await initEmbedder()` in `main()` before the job loop
4. Replace sequential loop with batched `Promise.all` in `main()`, quiet console during parallel runs
5. Update `README.md` and `DEVELOPMENT.md`

## Rules

- CommonJS only (`require`/`module.exports`)
- Run `node --check <file>` after each file change
- Do NOT modify: `lib/answerPlan.js`, `lib/answerPolicy.js`, `lib/llmAnswerPlanner.js`,
- `lib/formSchema.js`, `lib/text.js`, `lib/config.js`, `lib/profile.js`, `lib/answers.js`, `platforms/*.js`
- Only modify `lib/embedClassify.js` (add export), `lib/io.js` (quiet flag on logger),
- `apply.js` (concurrency logic)
- `--concurrency 1` must produce identical behavior to the current sequential loop
- The `--submit` safety gate must remain intact
- `processJob()` must not be modified — it already creates per-job page and fillHistory
- The `log()` function must always write to `log.jsonl` regardless of quiet mode — only
- `console.log` is suppressed

## Verification

```bash
node --check lib/embedClassify.js
node --check lib/io.js
node --check apply.js
# Functional test: run with --concurrency 1 (should behave identically to before)
# Functional test: run with --concurrency 2 --limit 4 (should process 2 batches of 2)
```