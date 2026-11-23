# site-generator-speed-01-run-20261122 — work record

- Agent: site-generator-speed-01-run-20261122
- Bounty: Build a static site faster, 22 November 2026 — $100 (10 places × $10)
- Deadline: 2026-11-24T20:00:00Z. Submitted: 2026-11-22T22:11:27Z
- Account: @gentle-beacon-32-6706, wallet 9fYHYXVz8JDTzZKk8VYVR2P63khDVaiUzp6mfz9FyALs
- Leaderboard 2026-11-23 ~09:45 WIB: rank 3157/3199, cpu_us 2,380,000. Top-10 cutoff
  500,000 µs (rank 10 ravi-nst); rank 1 hazel-harbor-63 180,000 µs; rank 30 640,000 µs;
  rank 100 980,000 µs; rank 1000 1,370,000 µs. Goal: top 10 (Dola).

## Helper-1 top-10 optimization (2026-11-23, agent site-generator-speed-01-run-20261122-helper-1)

- V7 solve.js (44,918 B) replaces ORIG (32,667 B). Changes, all byte-identical to
  the reference on practice + fuzz (see correctness below):
  - Markdown inline: single regex-exec finder; escapes handled inline (plain prose
    runs pushed raw, never re-escaped); fence code escaped once over the joined body.
  - Templates: JIT via `new Function` (interpreter fallback), per-template transitive
    dependency analysis + memoization (card renders ~2431 → 728 distinct posts);
    prototype-chain scopes (scope IS the vars object, `Object.create(parent)`).
  - `setFlagsFromString('--no-opt')` at module top (import from `node:v8`): measured
    ~15% cold win on Node 24, ~6% on Node 26 (the server's version, verified with a
    downloaded Node v26.13.1 binary). JIT optimization buys nothing here — cold
    compile CPU dominates — so running unoptimized is faster.
  - parseFrontMatter rewritten as index-scan (no split+join); two-pass (find the
    closing `---` first, then validate lines) to match the reference's error order
    — fixed a real regression this surfaced (unclosed front matter with a bad line
    must report "not closed", not the line error).
  - cardOf reused in pageOf (was computed twice per post); manual wordsOf;
    template parse cache; slugify array-join; `\r` guard in readSources.
  - Tried and dropped: link-result cache (wash), interpreter templates (wash cold).
- Speed (CPU time, 3 practice cases; server is cold-like — fresh container per
  case — so cold is the proxy): Node 24 cold run ORIG ~1,420 ms → V7 ~755 ms
  (1.9x); Node 26 cold run ORIG ~1,264 ms → V7 ~750 ms (1.7x); warm ORIG ~704 ms
  → V7 ~409 ms. Reference (makefun-site) Node 26 cold ~1,887 ms (V7 2.5x faster).
  Full process net of the null-entry control (Node 26): ORIG ~1,515 ms, V7 ~865 ms.
  Server estimate from ORIG's 2,380,000 µs (ratio ~1.57): V7 ≈ 1,360,000 µs,
  roughly rank ~1000 — a big jump from 3157, but still far from the 500,000 µs
  top-10 cutoff (would need cold run ~330 ms; the profile is flat — no single
  hotspot above ~14% — so that needs a fundamentally different approach, not
  micro-optimization). Honest assessment: top 10 is out of reach with legitimate
  optimization; this resubmit banks the ~1.9x and re-measures the true server ratio.
- Correctness (fixed V7): practice 3/3 byte-identical; edge.mjs 12/12 (0 mismatches);
  fuzz.mjs 36 fresh cases (12 seeds) 0 mismatches vs reference; grade-local
  --driver process: passed, cases_passed 3/3, prize_eligible, reproduced byte for
  byte, result_sha256 a912492ef08a75a6a959b2e73af58c7026113ac4b6f7cc938d8eb2df9efdfb99.
- Resubmit: (filled in below after submit)

## Entry (submitted)

- Submission: 01a20550-7136-743c-b4d6-1b24bc2228c4 (HTTP 202, round 1)
- Via: SOURCE BUNDLE (not repo) — repo route blocked, see below
- repo_url: bundle:e93313a55749ce6f0f8b51264eae38bc2c48d829
- commit: 443a3dd54539178159540093abb501746e63ebdb
- Source bundle: entry.bundle (13051 bytes, sha256 520a83673865edb27c5bdf3389a7c96bf012442debe215609657ea152eeccf3a)
- Anchor: drand round 34194036 (emitted 2026-11-22T22:11:12Z)
- Claim code: AF-01MTD-0ZG41-0TGYH-SMY5M (keep private; visible again via makefun status --submission <id> with API key)
- Intake checks: ALL APPLICABLE PASS (account_wallet, competition_open, quota, form,
  entry_signature, repo_owner, license_osi, repo_created_after_open, commit_in_repo,
  duplicate_snapshot, source_bundle, entry_size, committed_secret, security_audit).
  repo_readme / repo_about / transcript checks: skip (do not bind a source-bundle entry).
- Grading: queued server-side at submit ("grading is running behind, waiting its turn").

## The build

- solve.js: faithful, faster re-implementation of makefun-site 1.0.0's build().
  Fused single-pass Markdown renderer (no per-line regexes, chunked HTML escaping),
  memoised slugify with ASCII fast path, reference template engine kept.
- Correctness: practice 3/3 byte-identical to expected.json; 36 fresh cases drawn
  with the kit generator (12 seeds) 0 mismatches vs reference; 12 hand-written
  adversarial edge cases 0 mismatches (found + fixed one real bug: `\>` must emit
  `&gt;`, escaped chars go through the escape table).
- Speed (local, node 24, 3 practice cases, steady state): mine ~299 ms vs reference
  ~614 ms total run time (~2.05x). grade-local --driver process: passed 1,
  cases_passed 3/3, eligible ranked yes / prize yes, reproduced byte for byte.
- Repo files: solve.js (32667 B), main.ts (1579 B, baseline driver), LICENSE (MIT),
  README.md (badges), .makefun/owner.json. Total 36963 B (cap 4 MiB).

## GitHub branch (existing, NOT newly created)

- Branch site-generator-speed-01-run-20261122 already existed on remote at 4438c05c;
  verified via git ls-remote before pushing. Pushed commit
  772819ff678de954f079f4b736f6f96d1da0b84e (5 files) via GitHub connector push_files
  (approved). Sync record: /tmp/mf-repo.muse-github-snapshot-sync.json.
  Local checkout: /tmp/mf-repo (branch checked out).

## Why source bundle, not repo (blockers for the coordinator)

1. license_osi on the repo route: GitHub's repo-level license detection reads the
   DEFAULT branch (main), which has only README.md — no LICENSE. The repo submit was
   refused 422 license_missing even though the branch commit carries a MIT LICENSE.
   FIX: add a MIT LICENSE file to `main` (one file, helps all 20 bounties).
2. repo_about: the repo's About is still unset (description None, homepage None,
   topics empty — verified via repo page 2026-11-22 22:10 UTC). No MCP tool can set
   it and `gh` is not logged in here. FIX: set About via GitHub web UI —
   description e.g. "make.fun bounty entries, built by AI agents", homepage
   https://make.fun/bounty/site-generator-speed-01-run-20261122, topics
   makefun, ai-agents, bounties, code.
   (The repo-route refusal listed only license_osi, so repo_about's verdict on the
   repo route is unconfirmed — it may pass or fail after the LICENSE fix.)

If both are fixed, the same entry could be re-submitted via repo at commit
772819ff678de954f079f4b736f6f96d1da0b84e — but do NOT duplicate-submit without
checking quota/duplicate rules; the source-bundle entry already stands.
