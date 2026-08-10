# AI interpretation

## Principle

AI never performs the analysis. The deterministic Pattern Engine produces structured findings
first; AI may only **reword/synthesise** them. The pipeline is fixed and never bypassed:

```
user data → deterministic analysis → structured findings → safety filtering
          → AI wording/synthesis → output validation → user
```

`src/domain/ai/pipeline.ts` implements `interpret()`; `toStructuredFindings()` converts ranked
insights into `StructuredFinding`s whose `deterministicText` is the guaranteed, already-safe
fallback.

## Provider abstraction

`AIInterpretationProvider` (`src/domain/ai/types.ts`) is replaceable and declares whether it
`transmitsData`. Implementations (`providers.ts`):

- **`LocalTemplateProvider`** — default + guaranteed fallback. Assembles the deterministic finding
  sentences into prose entirely on-device. No network, no API keys.
- **`SimulatedLLMProvider`** — a stand-in so the consent/validation/fallback pipeline is exercisable
  end-to-end. Runs locally, transmits nothing.

**A real LLM is intentionally not wired client-side.** It would implement the same interface and
call a **server-side proxy** holding the credentials; API keys must never exist in client source.

## Consent & failure

- AI is **opt-in** (`/ai`): explicit consent with a clear explanation of what is sent, that AI is
  optional, that tracking + deterministic insights work without it, and that AI does not diagnose or
  make treatment decisions.
- Without consent/enable → deterministic text (`source: 'deterministic'`).
- On provider error, rate-limit, or **failed output validation** → deterministic fallback
  (`fellBack: true`). The app never shows a blank screen because AI failed.

## Output validation (guardrails)

`src/domain/ai/validation.ts` extends the shared forbidden-language list with AI-specific
phrasings ("you have…", "this confirms…", dose advice, "start HRT…"). Any AI output containing them
(or that is empty) is discarded in favour of the deterministic text. AI can never override the
deterministic safety constraints.

## Data / privacy flow

What leaves the device today: **nothing** — both providers run locally. If a real cloud provider is
added later: only the short, already-safe structured findings (and, if the user allows, note
excerpts not excluded by category privacy) would be sent to the server proxy; raw daily logs never
would; consent would be requested again; retention would be documented at that point.
