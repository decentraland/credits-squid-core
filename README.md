# Decentraland Credits Squid

This [Subsquid](https://subsquid.io) processor tracks Decentraland Credits activity on the blockchain. It indexes and provides easy access to information about credit grants, consumption, transfers, and validations.

## Overview

Decentraland Credits are a mechanism to grant users credits that can be used within the Decentraland ecosystem. This squid tracks:

- **Credit Grants**: When credits are granted to users, including amount and expiration date
- **Credit Consumption**: How credits are consumed, including partial consumption and the reason
- **Credit Transfers**: Transfer of credits between users
- **Credit Validations**: Validation events that verify credit validity

## Schema

The squid tracks the following entities:

- `CreditGrant`: Records when credits are granted to users
  - Includes amount, expiration date, and remaining balance
  - Tracks status (ACTIVE, EXPIRED, CONSUMED)

- `CreditConsumption`: Tracks credit usage
  - Links to the original grant
  - Records amount consumed and reason

- `CreditValidation`: Records credit validation events
  - Verifies if credits are still valid
  - Includes validation reason if applicable

- `CreditTransfer`: Tracks credit transfers between users
  - Records from/to addresses
  - Links to the original grant

## Usage

1. Install dependencies:
   ```bash
   npm ci
   ```

2. Build the project:
   ```bash
   npm run build
   ```

3. Start the processor:
   ```bash
   npm start
   ```

## GraphQL API

After starting the processor, you can query the indexed data using GraphQL at `http://localhost:4350/graphql`.

Example query:
```graphql
query {
  creditGrants(where: { status_eq: "ACTIVE" }) {
    id
    user
    amount
    remainingAmount
    expirationDate
    consumptions {
      amount
      reason
    }
  }
}
```

## Development

This squid is built using [Subsquid](https://subsquid.io) framework. For more information about squid development, refer to the [Subsquid documentation](https://docs.subsquid.io/).

## License

This project is licensed under the [MIT License](LICENSE).
