# Features

This directory holds **feature modules** — vertical slices of functionality.

It is intentionally empty in the foundations scaffold. No Fantasy Premier
League features are implemented yet.

## Conventions

Add one folder per feature, and keep it self-contained:

```
features/
  team/
    components/     # feature-only components
    hooks/          # feature-only hooks (e.g. useTeam)
    services/       # feature API calls, built on src/services/api
    types.ts        # feature types (often Zod-inferred)
    index.ts        # public API barrel for the feature
```

Guidelines:

- **Reuse the framework.** Compose shared primitives from `src/components`,
  data helpers from `src/services/api`, and state from `src/store`.
- **Keep imports one-directional.** Features may import from shared modules;
  shared modules must never import from features.
- **Co-locate.** Everything a feature needs lives under its own folder so it
  can be reasoned about (and removed) in isolation.
