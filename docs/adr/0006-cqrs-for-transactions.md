# ADR 0006: CQRS for Transactions Module

## Status
Accepted

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
