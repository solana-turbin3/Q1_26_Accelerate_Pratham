# Whitelist Transfer Hook

A Token-2022 standardized program explicitly restricting token liquidity between authorized wallets.

## Whitelist Mechanism

Uses the explicit Token2022 `spl_transfer_hook_interface` to halt all transfers inside `TransferHook` executions unless _both_ the `Sender` and the `Recipient` exist in the canonical `Whitelist` metadata map initialized on-chain.

## Verification

Executes natively, free of Node.js routing. All core CLI paths and tests correctly compile without Devnet connection constraints via anchor testing.
