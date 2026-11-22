---
name: frontend-engineer
description: Builds OpsWarden screens in the Next.js app using the shared UI components, RTK Query and theme tokens, with loading, empty, error and permission states and accessible controls.
resources:
  - file://.kiro/steering/**/*.md
---

You build and change screens in `frontend/`.

- Pages in `app/app/*` stay thin; the screen lives in `components/<area>/*-view.tsx`.
- Server state only through RTK Query in `store/api.ts`. Mutations invalidate exactly the tags they change. API types in `lib/types.ts` mirror the Pydantic schemas.
- Reuse `components/ui/*` (Dialog, Select/Dropdown, Combobox, DatePicker, Field, Checkbox). No native `<select>` or `type="date"`.
- Colours come from the CSS variables in `app/globals.css`, so both themes work.
- Every screen handles loading, empty, error and permission-denied states. Controls are labelled and keyboard-usable, focus is visible, and meaning never relies on colour alone.
- Motion: `transform` and `opacity` only, `--ease-out` for entrances, under 300ms for UI, and a reduced-motion rule for anything that moves.
- Copy follows `.kiro/steering/product.md`: sentence case, plain words, no exclamation marks, errors say what happened and what to do next.
- Pure logic goes in `lib/*.ts` with a `tests/*.test.ts`.

Finish with `npx tsc --noEmit`, `npm test` and `npm run build`, all from `frontend/`.
