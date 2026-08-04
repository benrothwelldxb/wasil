# Analytics / events pipeline

The first vertebra of the learning flywheel (see
`docs/reviews/architecture-debate.md`): capture the engagement signal a future
ranker will train on. Client-side and provider-agnostic today; a real backend
sink is a one-line swap.

## Usage

```ts
import { track } from '@/lib/analytics';

track({ name: 'journey_selected', journeyId, rank, kind, score, badges });
```

`track()` builds an envelope (`event`, `timestamp`, `sessionId`, `appVersion`)
and hands it to the active `AnalyticsSink`. It never throws — analytics must
never break the app.

## Sinks (the swappable seam — mirrors the logger)

- `loggerSink` — forwards to the structured logger (the dev default).
- `noopSink` — drops everything (the production default until a real sink is set).
- `createMemorySink()` — captures envelopes in memory (tests/debug).
- Install a real sink at app boot: `setAnalyticsSink(mySegmentSink)`. No call
  site changes — every `track()` starts flowing to it.

The default is chosen from `env.isDev`; production emits nothing until a sink is
configured, so no events leave the browser by accident.

## Event taxonomy (`src/lib/analytics/events.ts`)

The search → select → intent funnel:

| Event | Fired from | Key fields |
| --- | --- | --- |
| `search_submitted` | SearchForm submit | route, budget, pax, cabin, preferences |
| `search_completed` | ResultsPage (on data) | providerId, journeyCount, hasStopover, topScore |
| `journey_selected` | JourneyCard click | journeyId, **rank**, kind, score, badges |
| `journey_viewed` | JourneyDetailPage load | journeyId, kind, score |
| `hotel_swapped` | Stopover hotel change | journeyId, cityIata |
| `booking_intent` | "Book this journey" | journeyId, kind, totalUsd |

## Rules

- **No PII.** No names, emails, or free text in payloads. `providerId` is
  internal telemetry and is never rendered in the UI.
- **Add an event** by extending the `AnalyticsEvent` union in `events.ts` and
  calling `track()` at the site. The union is exhaustive, so TypeScript flags any
  malformed payload.
- **Determinism:** analytics reads the wall clock and generates ids — which is
  why it lives in `lib/`, never in the deterministic `domain/` core.
