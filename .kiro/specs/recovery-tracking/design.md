# Design: Recovery tracking

- `cases` gains nullable `resolution_outcome` (String 32), `recovered_amount` (Numeric 18,4) and `resolution_note` (Text). Added by `db.add_missing_nullable_columns()` locally and `scripts/migrate.py --apply` on Supabase.
- `POST /cases/{id}/resolve` body: `{ outcome, recovered_amount?, comment? }`. `comment` stays accepted for older clients; it becomes the note. Amount is parsed with `Decimal`, quantized to cents, and ignored for outcomes that don't recover money.
- `POST /cases/{id}/reopen` clears the three fields.
- `OverviewMetrics` gains `recovered_in_period: list[MoneyAmount]` and `recovered_total: list[MoneyAmount]`, summed per currency with `Decimal`.
- Frontend: the resolve dialog becomes an outcome picker plus amount (prefilled from the case's exposure); the dashboard adds a "Recovered" figure; resolved cases show the outcome.

Testing: API tests for each outcome, invalid amount, reopen clearing, and per-currency totals; a property test that totals equal the per-case sum for any set of amounts.
