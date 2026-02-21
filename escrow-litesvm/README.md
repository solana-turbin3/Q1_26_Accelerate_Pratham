# Escrow (LiteSVM Edition)

A standard bidirectional SPL-Token Escrow execution program built explicitly to test blazing fast iterations exclusively with **LiteSVM**.

## Features

- **LiteSVM Environment**: Does not utilize bulky `solana-test-validator` setups. Compiles and asserts purely in simulated Rust memory for absolute maximum continuous-integration testing speeds.
- **Bi-Directional Swaps**: Users can Make or Take token agreements.
- **Native Lockups**: Uses timestamp assertions (`creation_time`) to strictly lock deposits for _5 Days_ post Make, enabling users to `Refund` immediately after maturity or execute `Take` before then.

## Testing Setup

Since LiteSVM runs in isolated generic CPU memory, it does not rely on local RPC connections.
Therefore, simply use:

```
cargo test-sbf
```

There are no external RPC connection issues and test suites are 100% stable with no manual skips needed.
