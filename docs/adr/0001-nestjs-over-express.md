# ADR 0001: NestJS over Express

## Status
Accepted

## Context
We needed to choose a backend framework for our Node.js-based currency exchange platform. The primary options considered were:
- Express (minimalist, unopinionated)
- NestJS (opinionated, TypeScript-first)

Key requirements:
- Scalable architecture for financial applications
- Strong TypeScript support
- Built-in support for dependency injection
- Easy testing and maintainability
- Good ecosystem for REST APIs, GraphQL, and WebSockets

## Decision
We chose **NestJS** as our backend framework.

## Consequences

### Positive
- Strong architectural patterns (modules, controllers, providers, guards, interceptors)
- First-class TypeScript support with type safety
- Built-in dependency injection for better testability
- Large ecosystem and active community
- Supports REST APIs, GraphQL, WebSockets, and microservices
- Official support for TypeORM and other key libraries
- Better code organization and maintainability

### Negative
- Steeper learning curve compared to Express
- More boilerplate for simple applications
- Larger dependency footprint

### Neutral
- Opinionated structure means less choice but more consistency
