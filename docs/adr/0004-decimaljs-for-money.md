# ADR 0004: Decimal.js for Money (Not Floats)

## Status
Accepted

## Context
Financial applications require precise arithmetic for currency values. Using JavaScript's native `number` type (which is a double-precision float) can lead to precision errors:

```javascript
0.1 + 0.2 === 0.30000000000000004 // true
```

This is unacceptable for a currency exchange platform where precision is critical.

Options considered:
- JavaScript `number` (float)
- `bigint` (integers representing cents)
- `decimal.js` (arbitrary precision decimals)

## Decision
We will use **decimal.js** for all monetary calculations.

## Consequences

### Positive
- Perfect precision for financial calculations
- Supports arbitrary precision
- Easy to use API
- Good integration with PostgreSQL (stores as `DECIMAL` type)
- Prevents common floating-point bugs

### Negative
- Slightly more overhead than native numbers
- One more dependency to manage

### Neutral
- We already had decimal.js installed in the project
- TypeORM supports decimal.js with custom transformers
