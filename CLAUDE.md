# Claude Code Instructions

## File Reading

Never read entire files speculatively. Use `Grep` to locate the relevant symbol or line first, then use `Read` with `offset` and `limit` to read only that section. Only read a full file if the task genuinely requires understanding the whole thing.
