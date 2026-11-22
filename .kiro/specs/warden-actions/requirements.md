# Requirements: Warden proposes actions, people confirm

## Introduction
Warden answers questions but can't help finish work. This feature lets Warden propose a small set of actions that the user confirms with one click. Warden never runs anything itself.

## Requirement 1: Proposals only
1.1 WHEN the user asks Warden to do something it can help with THE SYSTEM SHALL return at most three proposed actions alongside the reply, chosen from: open a case, run the analysis on a case, prepare the supplier letter for a case.
1.2 THE SYSTEM SHALL NOT perform any action as part of the chat request.
1.3 WHEN the user confirms a proposed action THE SYSTEM SHALL perform it through the normal endpoint, with the normal permission and status checks.

## Requirement 2: Server-side validation of proposals
2.1 THE SYSTEM SHALL accept a proposal only if it names a case number that exists in the caller's workspace.
2.2 THE SYSTEM SHALL drop "run the analysis" unless the caller may edit cases, the case has documents and its status allows a new run.
2.3 THE SYSTEM SHALL drop "prepare the supplier letter" unless the caller may draft letters and the case has been analyzed and isn't closed.
2.4 THE SYSTEM SHALL remove the machine-readable action lines from the text shown to the user.

## Requirement 3: Voice
3.1 WHEN the conversation is by voice THE SYSTEM SHALL show proposed actions as buttons and SHALL NOT run them without a click.
