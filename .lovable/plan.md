# Fix: Demo day scores not displaying in the table

## Root cause (confirmed)

In `src/pages/ModDashboard.tsx`, the effect at lines 958–968 that builds `scoreValues` from `demoScores` only depends on `activeBatchId`. It runs once on mount when `demoScores` is still `[]`, then never re-runs after the async fetch resolves. The table reads from `scoreValues` and stays empty even though the DB has scores. The student progress modal is unaffected because it reads `demoScores` directly as a prop.

DB queries already confirmed Bhagya has 8 score rows correctly tied to Demo Day 01 and 02 in the right batch.

## Changes — single file: `src/pages/ModDashboard.tsx`

`useRef` is already imported (line 1). No import change needed.

### 1. Add ref next to score state (after line 364)

```ts
const initializedBatchRef = useRef<string | null>(null);
```

### 2. Replace the effect at lines 958–968 with:

```ts
// Initialize scoreValues from demoScores when:
//  1. The active batch changed (new batch loaded), OR
//  2. We haven't initialized this batch yet AND demoScores now has data
//     (async fetch completed after the initial mount).
// The "scoreValues empty" gate prevents wiping in-progress typing on
// subsequent demoScores updates (e.g. after a debounced upsert).
useEffect(() => {
  const shouldInit =
    initializedBatchRef.current !== activeBatchId ||
    (initializedBatchRef.current === activeBatchId &&
      Object.keys(scoreValues).length === 0 &&
      demoScores.length > 0);
  if (!shouldInit) return;

  const vals: Record<string, string> = {};
  for (const s of demoScores) {
    const key = `${s.demo_day_id}|${s.student_id}|${s.criterion}`;
    if (Number(s.score) !== 0) vals[key] = String(s.score);
  }
  setScoreValues(vals);
  initializedBatchRef.current = activeBatchId;
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeBatchId, demoScores]);
```

## Why this is safe

- **Async fetch**: when `demoScores` transitions from `[]` to populated, `scoreValues` is still `{}` and the batch matches → effect runs and seeds values.
- **In-progress typing not wiped**: `updateScoreValue` immediately sets a key on `scoreValues`, so `Object.keys(scoreValues).length === 0` is false. Subsequent `demoScores` updates from the debounced upsert response will not re-init.
- **Batch switch**: `initializedBatchRef.current !== activeBatchId` triggers re-init from the new batch's `demoScores` (cached or freshly fetched).
- **Admin read-only view**: Inherits the fix automatically because `AdminDashboard` reuses `ModDashboard`.

## Verification

- Anne → "Apr 2026 · Batch 11 - April 20th" → Demo Day 01 row for Bhagya shows 4, 4, 3, 4 / 15.
- Demo Day 02: 4, 3, 4, 4 / 15. Demo Day 03: empty.
- Modal still shows the same values.
- Typing a new score saves and persists across refresh.
- Switching batches and back: scores still display.
- No console errors.

No other files are touched.
