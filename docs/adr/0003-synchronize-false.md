# ADR 0003: synchronize: false is a Hard Rule

## Status
Accepted

## Context
TypeORM has a `synchronize` option that automatically creates database tables based on entity definitions. While convenient for development, this feature is extremely dangerous for production.

Key concerns:
- Automatic schema changes can cause data loss
- No audit trail of schema changes
- Risk of accidental production schema modifications
- Difficult to roll back changes
- Violates DevOps best practices for database management

## Decision
We will **never use `synchronize: true`** in any environment (development, staging, or production). All schema changes **must** be made through TypeORM migrations.

## Consequences

### Positive
- Full control over all schema changes
- Audit trail of every database modification
- Safe rollbacks using migration revert
- Better collaboration and review of schema changes
- Follows industry best practices for database management

### Negative
- Slightly more work for developers (must create migrations)
- Requires discipline to always use migrations

### Neutral
- Migrations are a standard practice in most professional projects
- Our automated setup script runs migrations automatically
