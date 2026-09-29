# Architectural & Implementation Decisions

Record decisions, trade-offs, and deviations from SPEC.md here.

| Date       | Phase   | Decision                              | Rationale                                                                                                                                                                                                                                                                |
| ---------- | ------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-09-29 | Phase 0 | Initialize DECISIONS.md               | Track technical choices and deviations as required by SPEC Section 0.2.                                                                                                                                                                                                  |
| 2026-09-29 | Phase 3 | Refine `audit_logs_immutable` trigger | PostgreSQL foreign key ON DELETE SET NULL cascades on users and projects execute an internal UPDATE on audit_logs. Refined trigger to allow foreign key nullification of user_id/project_id while keeping audit_logs strictly append-only against tampering or deletion. |
