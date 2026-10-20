# Decision-Model Integration for SubMind — Path Forward

Date: 2026-10-18. Status: proposal / research complete, build not started.

## 1. What this is about

TypeSafe's **Jev** is a "System One" decision model: instead of generating text, it
evaluates typed questions against a state and returns structured answers — a
**choice** from a list, a **score** on a rubric, or a **noul** (yes/no as a
probability) — each with probabilities and a confidence value that code can
branch on. No text generation, no parsing.

Jev itself is proprietary and hosted-only (no weights, no self-host;
$0.042 per million input tokens, output free). There is no free local Jev.
This document lays out how SubMind gets the same capability locally for free,
and what to do with it once it exists.

## 2. The landscape (researched 2026-10-18)

| Model | Access | Size | Primitives | Local speed | Notes |
|---|---|---|---|---|---|
| Jev 1.13 (TypeSafe) | Closed API | undisclosed | choice / score / noul | 70–500 ms | Reference. 64K context. |
| **Decider-2b** (Mapika) | Open weights (HF) | 2B | choice (2–255) / score (2–10) / noul | ~190 ms / 5 questions (RTX 4090) | **Recommended.** ~5% below Jev accuracy per independent S1Bench. `pip install decider-ai`; HTTP server speaks Jev's wire format; GGUF build runs under llama.cpp. |
| Laya (Convai Innovations) | Apache 2.0 | 421M | choice / score / noul | ~33 ms (GPU) | `pip install laya`; `laya-serve` speaks `POST /v1/systemone`. Tiny, CPU-friendly — but 62.5% accuracy on the same bench and a 512-token context. |
| Reflex-4b | Apache 2.0 | 4B | choice / score / noul | 2–3× faster than Jev | ~5% less accurate than Jev. |
| djev | Hosted (djev.dev) | undisclosed | Jev-like | slightly faster than Jev | Closest to Jev on accuracy; not local. |
| Simplejev-qwen38-27b | Open weights | 27B | Jev-like | — | Best open accuracy, but needs 27B-class hardware. |

Caveats: the benchmark numbers come primarily from one independent bench
(S1Bench, bench.jakecuth.com) plus vendor-reported figures — treat them as
indicative, not gospel. This space is weeks old; expect churn.

## 3. Recommendation

**Decider-2b** as the local engine: best accuracy of the local options, up to
~8K context, and the GGUF path lets it run on the llama.cpp infrastructure
already in the lab. **Laya** is the fallback if GPU headroom is the
constraint (it runs fine on CPU).

Both expose Jev's wire format locally, so the SubMind integration below works
identically for either — and for the real Jev API later.

## 4. Integration architecture

New package **`@submind/protocol-decision`**, mirroring the existing
`protocol-muse` / `protocol-hermes` / `protocol-codex` pattern:

- **Types** (Jev-shaped): `DecisionState`, `ChoiceQuestion`,
  `ScoreQuestion`, `NoulQuestion`, and `DecisionAnswer` carrying
  `choice` / `probabilities` / `confidence`, `score`, or `noul`.
- **`DecisionBackend` interface**: a single `decide(state, questions)`
  method. Two implementations:
  - `LocalDecisionBackend` — HTTP client pointed at the local server
    (`laya-serve` or the decider server), base URL configurable.
  - `TypeSafeBackend` — the real Jev API (base URL + API key).
  - Switching engines = changing the base URL. No calling-code changes.
- Follows repo conventions: pnpm workspace, strict `tsc`, vitest tests,
  same entity/ID style as the other protocol layers.

## 5. Use cases in SubMind

Concrete places the operator console needs fast, typed judgment:

1. **Task triage / routing (Choice).** Incoming task → which agent queue
   (Hermes / Codex / Muse)? Confidence-gated: auto-route above threshold,
   operator review below it.
2. **Urgency detection (Noul).** "Is this session stuck / on fire?" Drives
   the console's attention view instead of manual scanning.
3. **Output quality gating (Score).** Rate an agent's draft 0–2 against a
   rubric; auto-accept high-confidence passes, flag the rest for review.
4. **Session attention ranking (Choice/Score).** Which of N sessions needs
   the operator right now, ordered by score.
5. **Next-step selection (Choice).** Agent asks "which tool / queue next?"
   as a typed question rather than a free-text guess.
6. **Pre-tool safety checks (Noul).** Grounding / policy questions before
   sensitive actions ("does this plan touch production?").
7. **Calibration-driven autonomy.** Confidence thresholds define the
   boundary between what automates and what escalates — the boring,
   reliable kind of gating.

## 6. Phased path forward

- **Phase 0 — Validate.** Get Decider-2b running locally (`pip install
  decider-ai` + its HTTP server, or the GGUF build under llama.cpp). Run
  all three primitives against sample SubMind states; sanity-check latency
  on available hardware.
- **Phase 1 — Package.** Build `@submind/protocol-decision`: types,
  `LocalDecisionBackend`, vitest tests. Mirror the `protocol-muse`
  structure.
- **Phase 2 — Upgrade path.** Add `TypeSafeBackend` behind the same
  interface; engine selection via config/env.
- **Phase 3 — Console wiring.** Surface decisions in the operator UI:
  triage view, confidence badges, escalation queue.
- **Phase 4 — Tune.** Log decisions, calibrate thresholds on real traffic,
  measure precision at the chosen gates.

## 7. Open decisions (Addison)

- Engine: Decider-2b (recommended) vs Laya.
- Host: top-ison Python server vs desktopison llama.cpp GGUF path.
- Whether to get a Jev API key later for the hosted upgrade path
  ($0.042/M input tokens; $5/mo console credit).
- Which use case to wire first (recommendation: task triage, §5.1).

## 8. Key links

- TypeSafe docs: https://docs.typesafe.ai/introduction
- Laya: https://github.com/NandhaKishorM/laya (Apache 2.0)
- Decider-2b: https://huggingface.co/Mapika/decider-2b
- Decider GGUF + llama.cpp server: https://huggingface.co/cosetoenor/decider-2b-GGUF
- Independent benchmark: bench.jakecuth.com (via @ItsCuthulhu, Sep 2026)
