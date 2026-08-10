# Domain model

All types live in **`src/domain/models.ts`**. They are deliberately **backend-agnostic**: opaque
string IDs, ISO date strings, no ORM/framework types. Display metadata and ordered scales
(labels, icons, ordinals) live separately in **`src/domain/constants.ts`** so the data shapes stay
pure.

## Conventions

- `Id = string` — opaque identifiers.
- Dates are `IsoDate` = `"YYYY-MM-DD"` strings (see `src/lib/date.ts`); datetimes are ISO strings.
- Ordered scales are string unions with a metadata table for label/order, so comparisons and UI
  ordering have one source of truth.

## Entities

| Model | Purpose | Key fields |
| --- | --- | --- |
| **User** | The person using the app | `displayName`, `age`, `pinnedSymptomIds`, `onboardingReason`, `preferences` |
| **UserPreferences** | Settings | `remindersEnabled`, `reminderTime`, `cycleTrackingEnabled` |
| **Symptom** | A trackable symptom *definition* (catalogue) | `key`, `label`, `category`, `icon` |
| **SymptomEntry** | One symptom reading inside a check-in | `symptomId`, `severity` |
| **DailyCheckIn** | A day's overall record | `wellbeing`, `symptoms[]`, `contextTagIds[]`, `note?`, `flaggedUnusual` |
| **DailyNote** | A standalone dated note | `date`, `text` |
| **ContextTag** | A "what changed?" tag definition | `key`, `label`, `group`, `icon` |
| **CycleEntry** | An observed menstrual cycle | `startDate`, `bleedEndDate?`, `lengthDays?` |
| **PeriodEntry** | A single period day | `date`, `flow` |
| **TreatmentEvent** | An HRT/medication/lifestyle change | `date`, `category`, `title`, `description?`, `dosage?`, `clinicianNote?` |
| **Insight** | An illustrative pattern card | `kind`, `tone`, `title`, `body`, `framing?`, `isExample`, `spark?` |
| **AppointmentSummary** | The one-page visit summary | `rangeStart/End`, `mostDisruptiveSymptoms[]`, `cycleSummary`, `treatmentEventIds[]`, `symptomTrendNote`, `discussionPoints[]` |
| **LearningArticle** | Educational content | `title`, `slug`, `summary`, `category`, `body[]`, `reviewedBy?`, `reviewedAt?`, `sources[]` |

## Ordered scales

| Scale | Values (ordered) |
| --- | --- |
| `WellbeingLevel` | `great` → `okay` → `not_great` → `rough` |
| `Severity` | `none` → `mild` → `moderate` → `strong` → `severe` |
| `FlowLevel` | `spotting` → `light` → `medium` → `heavy` |

## Categorisations

- `SymptomCategory` — `sleep`, `mood`, `energy`, `vasomotor`, `pain`, `digestive`, `cognitive`,
  `cycle`, `genitourinary`, `other`.
- `TreatmentCategory` — `hrt`, `medication`, `supplement`, `lifestyle`, `other`.
- `LearnCategory` — the ten Learn hub topics.
- `ContextTagGroup` — `lifestyle`, `health`, `treatment`.
- `InsightKind` / `InsightTone` — drive card iconography and framing.
- `OnboardingReason` — the eight "what made you download this" answers.

## Notes for future phases

- `Insight.isExample` is `true` for every card in Phase 0 and gates the "Example" badge. Real
  computed insights would set it `false`.
- `TreatmentEvent` intentionally carries `dosage` and `clinicianNote` so the timeline can later be
  overlaid against symptom trends and shared with a clinician.
- `LearningArticle` exposes `reviewedBy` / `reviewedAt` / `sources` so professionally-reviewed
  content can display provenance without any UI change.
- `AppointmentSummary` references treatment events by id (`treatmentEventIds`) rather than
  embedding them — the same normalisation a backend would use.
