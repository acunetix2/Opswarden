# Requirements: Recovery tracking

## Introduction
Closing a case today records only a comment. Finance teams need to know what each investigation was worth. Recovery tracking records how a case ended and how much was recovered, and shows the total on the dashboard.

## Requirement 1: Record the outcome when resolving
1.1 WHEN a reviewer resolves a case THE SYSTEM SHALL require an outcome: `recovered` (credit note or refund), `corrected_invoice`, `no_discrepancy`, or `written_off`.
1.2 WHEN the outcome is `recovered` or `corrected_invoice` THE SYSTEM SHALL accept a recovered amount as a non-negative decimal in the case currency.
1.3 WHEN the amount is not a valid non-negative number THE SYSTEM SHALL reject the request with `INVALID_AMOUNT`.
1.4 THE SYSTEM SHALL store the outcome, amount and note on the case and record them in the `case.resolved` audit event.

## Requirement 2: Reopening
2.1 WHEN a resolved case is reopened THE SYSTEM SHALL clear the outcome and amount (the audit trail keeps the earlier values).

## Requirement 3: Report the value
3.1 THE SYSTEM SHALL report on the overview the amount recovered in the selected period and in total, per currency, never adding different currencies together.
3.2 THE SYSTEM SHALL return the outcome and recovered amount with each case.
