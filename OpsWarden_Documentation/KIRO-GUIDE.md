# Kiro Development Guide
## Building OpsWarden with Specs, Steering, Hooks, Crew, MCP, and Tests

**Purpose:** Make Kiro usage deliberate, reproducible, and visible in the repository for Kiroween 2026 judging.

The repository must contain the `.kiro/` directory at its root and must not ignore it in `.gitignore`.

---

## 1. Recommended `.kiro` structure

```text
.kiro/
  specs/
    opswarden-mvp/
      requirements.md
      design.md
      tasks.md
  steering/
    product.md
    architecture.md
    coding-standards.md
    security.md
  hooks/
    backend-tests.kiro.hook
    frontend-checks.kiro.hook
    security-checks.kiro.hook
  agents/
    backend-architect.md
    frontend-engineer.md
    qa-engineer.md
    security-reviewer.md
```

Use the exact file formats and hook/agent configuration schema supported by the Kiro version being used. Treat the filenames above as an organizational proposal, not a claim about a universal configuration syntax.

## 2. Spec-driven development

Create a Kiro spec for the MVP before asking Kiro to implement broad features.

### Requirements spec should include
- User stories.
- Functional requirements.
- Non-functional requirements.
- Acceptance criteria.
- Explicit non-goals.
- Security and approval constraints.
- Error and recovery states.

### Design spec should include
- Architecture boundaries.
- Database entities.
- API contracts.
- Agent workflow and tool permissions.
- UI screens and states.
- Test strategy.

### Tasks spec should include
- Small implementation tasks.
- Dependencies.
- Expected files/modules.
- Tests required.
- Acceptance checks.

Ask Kiro to implement one task or vertical slice at a time. Review the diff and run tests before moving on.

## 3. Steering documents

### `product.md`
Include:
- OpsWarden product vision.
- Initial user segment.
- MVP boundary.
- Terminology.
- Product principles: evidence first, human control, explainability.

### `architecture.md`
Include:
- Modular monolith structure.
- Frontend/backend responsibilities.
- Database and tenant model.
- Document pipeline.
- Deterministic comparison engine.
- Agent orchestration boundaries.
- Approval and integration pattern.

### `coding-standards.md`
Include:
- TypeScript strict mode.
- Python typing and formatting.
- Pydantic request/response schemas.
- Database migrations.
- Decimal-safe money calculations.
- Error handling and structured logging.
- Test expectations.
- No secrets in code or logs.

### `security.md`
Include:
- Tenant isolation requirements.
- Server-side authorization.
- Private document storage.
- Untrusted document and prompt-injection handling.
- Tool allowlists.
- Human approval for side effects.
- Idempotency and audit requirements.

## 4. Hooks to configure

Configure hooks using Kiro's supported hook interface. Good automation candidates:

| Hook | Trigger concept | Action |
|---|---|---|
| Backend test hook | Backend files change | Run formatter/linter and focused pytest |
| Frontend validation hook | Frontend files change | Run lint, typecheck, and relevant tests |
| Security review hook | Auth, upload, agent, or integration code changes | Ask for a security-focused review and run targeted checks |
| Spec consistency hook | Requirements or API schema changes | Check docs/contracts/tests for drift |

Hooks should be fast enough to be useful. Avoid triggering expensive full suites on every tiny edit.

## 5. Custom development agents

### Backend architect
Responsibilities:
- Review module boundaries.
- Design API and database changes.
- Enforce typed contracts.
- Identify migration and tenant-isolation risks.

Restrictions:
- Must not weaken authorization to make tests pass.
- Must not introduce unbounded agent execution.

### Frontend engineer
Responsibilities:
- Implement screens from `DESIGN.md`.
- Use reusable components.
- Handle loading, empty, error, and approval states.
- Preserve accessibility and responsive behavior.

Restrictions:
- Must not hardcode fake production metrics.
- Must not treat frontend checks as security controls.

### QA engineer
Responsibilities:
- Create unit, integration, property-based, and end-to-end tests.
- Test failure paths and state transitions.
- Verify seeded demo scenarios.

Restrictions:
- Must not modify expected results simply to make failing tests pass without explaining the change.

### Security reviewer
Responsibilities:
- Review auth, tenant scope, uploads, prompt injection, agent tools, and external actions.
- Identify trust-boundary violations.
- Propose concrete mitigations and tests.

Restrictions:
- Must not approve a change solely because it passes lint or unit tests.

## 6. Kiro Crew collaboration

If using Kiro Crew, divide work by stable boundaries:

- Backend track: API, database, processing pipeline.
- Frontend track: app shell, cases, evidence, approvals.
- QA/security track: tests, threat review, demo verification.

Agree on API contracts and types before parallel implementation. Avoid multiple agents editing the same files simultaneously. Use one integrator to review changes and resolve conflicts.

## 7. MCP opportunities

Potential MCP integrations:
- GitHub: inspect issues, pull requests, and repository status.
- Email provider: create or send approved supplier communications.
- Document service: invoke extraction or OCR capabilities.
- Project tracker: create follow-up tasks.

For the MVP, implement only integrations that directly improve the demo. MCP tools must be narrowly scoped and permissioned. An MCP connection does not bypass OpsWarden's approval gate.

## 8. Powers

Use relevant Kiro powers if available for the chosen stack, such as frontend framework, backend framework, database, testing, or deployment expertise. Record:
- Which power was used.
- What task it accelerated.
- What code or workflow it influenced.
- What the team reviewed or changed afterward.

Do not claim use of a power, Crew, MCP server, hook, or custom agent unless it was actually configured and used.

## 9. Property-based testing

Prioritize invariants:
- Equal quantities should not create a quantity mismatch.
- Invoice quantity above received quantity should create the configured finding.
- Reordering records with stable identifiers should not change comparison outcomes.
- A rejected approval cannot execute.
- A changed action payload cannot use an old approval.
- A non-member cannot access a case.
- Retrying a completed action cannot duplicate the external side effect.

Use the property-testing library appropriate to the language (for example, Hypothesis in Python).

## 10. Suggested Kiro task prompt

> Read `README.md`, `PRD.md`, `DESIGN.md`, `ARCHITECTURE.md`, `API-CONTRACTS.md`, and `SECURITY.md`, plus all applicable `.kiro/steering` files. Work only on the specified task. Before editing, summarize the relevant requirements, affected modules, security implications, and tests. Implement the smallest complete change consistent with the architecture. Do not invent product behavior, hardcode production metrics, weaken tenant isolation, bypass approval gates, or give agents unrestricted tools. Add or update tests. Run the focused test suite and report exact commands, results, remaining risks, and files changed. If requirements conflict or a decision is missing, ask before making a high-impact assumption.

## 11. Evidence for the Kiroween submission

Maintain a short engineering log containing:
- Spec iterations and what changed.
- Steering files and how they shaped output.
- Hooks configured and the checks they automated.
- Custom agents and their concrete responsibilities.
- Crew tasks and how conflicts were coordinated.
- MCP integrations and permission boundaries.
- Property-based tests and bugs/invariants they covered.
- Examples of where Kiro output was reviewed or corrected.

The final write-up should be truthful and specific. Show actual repository artifacts and a short demo of the development workflow where useful.
