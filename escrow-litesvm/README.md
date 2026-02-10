# Anchor Escrow (LiteSVM Version)

This project implements a secure Escrow program on Solana using the Anchor framework, featuring a **5-day lockup period** for both taking and refunding assets.

## Implementation Details

### Instructions

- **Make**: Creates an escrow, depositing Asset A into a vault. Sets a `creation_time` timestamp.
- **Take**: Taker deposits Asset B to Maker and withdraws Asset A from the vault.
  - **Lockup**: Can only be executed **5 days after** creation.
- **Refund**: Maker can withdraw Asset A if the offer expires or they choose to cancel.
  - **Lockup**: Can only be executed **5 days after** creation.

### State

- **Escrow**: Stores `creation_time` (Unix timestamp) to enforce the lockup.

## Testing

The project uses **LiteSVM** for fast, lightweight testing without a local validator.

### Running Tests

To run the full test suite:

```bash
anchor build
cargo test -- --nocapture
```

### Test Coverage (`tests/mod.rs`)

- `test_make`: Verifies escrow creation and state initialization.
- `test_take`:
  - Verifies that `take` fails properly if attempted before 5 days (`EscrowLocked`).
  - Simulates time travel (warping clock) to verify success after 5 days.
- `test_refund`:
  - Verifies that `refund` fails properly if attempted before 5 days (`EscrowLocked`).
  - Simulates time travel and verifies success after 5 days.
