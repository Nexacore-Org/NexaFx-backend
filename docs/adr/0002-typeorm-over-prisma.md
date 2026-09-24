# ADR 0002: TypeORM over Prisma

## Status
Accepted

## Context
We needed an ORM for our PostgreSQL database. The primary options considered were:
- TypeORM (traditional ORM with entity classes)
- Prisma (modern schema-first ORM with Prisma Client)

Key requirements:
- Good integration with NestJS
- Support for complex migrations
- Type safety
- Transactional operations (critical for financial applications)
- Familiarity for our development team

## Decision
We chose **TypeORM** as our ORM.

## Consequences

### Positive
- Excellent official integration with NestJS (@nestjs/typeorm)
- Entity-first approach using TypeScript decorators
- Full control over SQL queries when needed
- Mature ecosystem and extensive documentation
- Good support for migrations and transactions
- Familiar patterns for developers coming from traditional ORMs

### Negative
- More boilerplate compared to Prisma
- Less focus on developer experience (DX) than Prisma
- Schema is defined in code, not in a separate Prisma schema file

### Neutral
- Both ORMs support TypeScript, so type safety is still achievable
- Migration approach is different but both are manageable
