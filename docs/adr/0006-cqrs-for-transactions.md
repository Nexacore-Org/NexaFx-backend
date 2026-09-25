# ADR 0006: CQRS for Transactions Module

## Status
Superseded

## Context
The transactions module is the core of our currency exchange platform. It needs to:
- Process complex financial transactions
- Provide high performance for read operations
- Maintain audit logs of all activities
- Ensure data consistency across operations

Command Query Responsibility Segregation (CQRS) is a pattern that separates read operations from write operations.

## Decision
We will implement **CQRS** for the transactions module.

## Consequences

### Positive
- Optimized read and write models for their specific purposes
- Better scalability (reads and writes can scale independently)
- Improved auditability and event sourcing capabilities
- Clear separation of concerns
- Easier to implement complex business logic

### Negative
- Increased complexity compared to a simple CRUD approach
- More code to maintain
- Requires careful synchronization between read and write models

### Neutral
- NestJS has good support for CQRS via @nestjs/cqrs package
- Good fit for financial applications where audit trails are critical

## Reality
This decision was **not implemented**. The transactions module was built as a
conventional NestJS service/controller/repository stack instead of CQRS. A
full-text search of `src/` finds no `CommandBus`, `QueryBus`, `@CommandHandler`,
`@QueryHandler`, or any `@nestjs/cqrs` import; `src/transactions/` is a plain
service layer.

We chose the conventional approach because:
- The module is large and already has many dependent features (fees, ledger,
  rate-alerts, KYC limits, path-payment routing) built directly against
  `TransactionsService`; a CQRS migration would have touched all of them.
- The read/write scaling and event-sourcing benefits CQRS offers were not
  needed at the current scale, so the added complexity was not justified.
- A partial migration (some writes through a bus, others not) would be worse
  than a consistent service layer, so the pattern was dropped entirely rather
  than adopted piecemeal.

This ADR is therefore marked **Superseded**. If CQRS is revisited later, it
should be a new ADR that supersedes this one and covers the full migration.
