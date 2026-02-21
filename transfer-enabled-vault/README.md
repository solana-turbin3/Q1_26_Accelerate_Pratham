# Transfer Enabled Vault (Transfer Hook)

This program represents an advanced **Token-2022 Transfer Hook** vault implementing a hybrid Deposit/Withdraw mechanism.

## Features

- **Token2022 Interfaces**: Utilizing `spl-transfer-hook-interface` and `spl-tlv-account-resolution` for cutting-edge token extensions.
- **Deposit Mechanism**: A strict ledger update mechanism (`UserAccount.amount`), requiring the client to execute the actual token transfer instead of the program executing a CPI.
- **Withdraw Mechanism**: Instead of transferring out directly, the program uses the `approve` token instruction to allow the user to delegate the transfer from the vault to themselves via a PDA signature.
- **Dynamic Meta-Lists**: Calculates and allocates `ExtraAccountMetaList` accounts dynamically using raw instruction invokers `invoke_signed`.

## Testing

To test this program, run `cargo test-sbf` or `anchor test`. Because this does not rely on Ephemeral Rollups or TukTuk SDK components, there are no `it.skip` boundaries necessary. All tests validate successfully.
