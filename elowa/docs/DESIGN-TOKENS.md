# Design tokens

elowa's visual language is defined **once** and consumed everywhere. There are two coordinated
files:

- **`src/index.css`** — the source of truth for token *values*, declared as CSS custom
  properties on `:root`.
- **`tailwind.config.ts`** — maps those variables onto Tailwind's `theme` so you write
  `bg-primary`, `text-muted-foreground`, `rounded-2xl`, `shadow-card`, etc.

> **Rule:** components must not hard-code colours, radii, shadows or font families. Always use a
> token utility. This keeps the product coherent and makes re-theming (or dark mode) a
> single-file change.

## Colour

Colours are stored as **HSL channel triplets** (e.g. `158 28% 29%`) so they compose with opacity
via `hsl(var(--token) / <alpha>)` (Tailwind: `bg-primary/90`).

### Brand & surfaces

| Token | Role | Feel |
| --- | --- | --- |
| `--canvas` | Backdrop behind the mobile shell | Warm greige |
| `--background` | App background | Warm off-white / cream |
| `--foreground` | Primary text | Warm charcoal |
| `--card` | Card surface | Near-white, faintly warm |
| `--muted` / `--muted-foreground` | Subtle surfaces / secondary text | |
| `--primary` | **Brand** — deep muted green | Calm, premium |
| `--primary-soft` | Tinted brand surface / selected states | |
| `--secondary` | Warm beige surface | |
| `--accent` / `--accent-foreground` | Soft coral / blush | |

### Botanical accent palette

Used for illustration accents, tags, calendar markers and sparklines — never as large fills.

| Token | Colour |
| --- | --- |
| `--coral` | Soft coral / blush |
| `--lilac` | Muted lilac |
| `--sage` | Pale sage |
| `--beige` | Warm beige |

### Semantic status (calm, non-alarming)

| Token | Use |
| --- | --- |
| `--success` | Positive trends |
| `--warning` | "Watch" insights |
| `--attention` | Reserved for the **"seek medical advice"** callout style and destructive actions |

### Deliberately avoided

Clinical NHS-style blue · loud gradients · neon · excessive pink · childish wellness
aesthetics · menstrual-app clichés · flower overload · obvious fertility symbolism.

## Radius

A single base radius `--radius: 1.25rem` drives the scale (`rounded-sm … rounded-3xl`).
Cards use `rounded-2xl`; pills/buttons use `rounded-full`. Soft, rounded, friendly.

## Typography

Two families, mapped to `font-display` and `font-sans`:

- **Display** — *Fraunces* (a warm, editorial serif) for headings → premium, human.
- **Body** — *Plus Jakarta Sans* for everything else → highly readable.

Fonts load from Google Fonts with a system-font fallback, so the app degrades gracefully
offline. Headings (`h1–h3`) automatically use the display serif via base styles.

## Elevation

Three subtle, **warm-tinted** shadows (`shadow-card`, `shadow-raised`, `shadow-nav`) built on
`--shadow-color`. Elevation is intentionally understated — depth comes from soft shadows and
generous whitespace, not borders or heavy contrast.

## Spacing & layout

Standard Tailwind spacing scale. Screens use consistent horizontal padding (`px-5`) via the
`Screen` wrapper and generous vertical rhythm. Large areas of whitespace are a feature.

## Motion

Two gentle keyframes (`fade-in`, `scale-in`). **All** animation and transitions are neutralised
under `prefers-reduced-motion: reduce` (see `src/index.css`).

## Accessibility baked into tokens

- A global `:focus-visible` ring (`--ring`) gives every keyboard-focusable element a visible
  focus state.
- Interactive control sizes (buttons, chips, rows) meet the **44px** minimum touch target.
- State is never conveyed by colour alone — selected/severity states always pair colour with an
  icon, label, size or position.
