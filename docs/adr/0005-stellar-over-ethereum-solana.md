# ADR 0005: Stellar over Ethereum/Solana

## Status
Accepted

## Context
We needed to choose a blockchain network for our currency exchange platform's on-chain operations. The primary options considered were:
- Ethereum (largest ecosystem, smart contract support)
- Solana (high speed, low fees)
- Stellar (purpose-built for payments and asset exchange)

Key requirements for our use case:
- Fast transaction settlement
- Low transaction fees
- Built-in support for multiple assets
- Regulatory compliance and stability
- Good developer experience and SDKs

## Decision
We chose **Stellar** as our blockchain network.

## Consequences

### Positive
- Purpose-built for cross-border payments and asset exchange
- Very fast (3-5 second settlement)
- Extremely low fees (fractions of a cent)
- Built-in decentralized exchange (DEX)
- Focus on regulatory compliance
- Excellent documentation and SDKs (including JavaScript/TypeScript)
- Mature and stable network

### Negative
- Smaller ecosystem compared to Ethereum
- Less general-purpose than Ethereum/Solana
- Fewer DeFi applications

### Neutral
- Smart contract support via Soroban (Stellar's smart contract platform)
- Good fit for our specific currency exchange use case
