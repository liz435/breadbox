-- ── Scrub legacy malformed tool-call blocks from agent_runs ────────────
--
-- Prior to the in-app sanitizer (mid-stream + write-side), a model could
-- emit a `tool-call` block with non-object `input` (null, array, etc.)
-- and the value persisted into `agent_runs.data.messages`. On the next
-- request that replayed history, Anthropic rejected the whole request
-- with `messages.N.content.M.tool_use.input: Input should be an object`
-- → 500.
--
-- The application code now prevents new bad data from landing. This
-- migration nukes the `messages` array on any rows that still hold a
-- malformed block. Rationale for "nuke" vs "surgical rebuild":
--
--   • `messages` is only consumed by `buildModelMessagesFromRuns` as
--     a fallback for runs missing `assistantText`. The canonical record
--     is `assistantText`. Clearing `messages` on a completed run has
--     zero impact on replay correctness.
--   • The sanitizer would otherwise need to be re-implemented in
--     PL/pgSQL with orphan tool-result detection — fragile, hard to
--     review, run-once code.
--
-- The query is idempotent: re-running on a clean DB matches 0 rows.

do $$
declare
  affected int;
begin
  update public.agent_runs
  set data = jsonb_set(data, '{messages}', '[]'::jsonb)
  where data->'messages' @? '$[*].content[*] ? (@.type == "tool-call" && (@.input == null || @.input.type() != "object"))';
  get diagnostics affected = row_count;
  raise notice 'sanitize_legacy_tool_use: cleared messages on % row(s)', affected;
end $$;
