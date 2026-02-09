# Whitelist Transfer Hook

A Solana program that implements a **Token-2022 Transfer Hook** to enforce whitelist-based transfer restrictions.

## 🎯 What It Does

Every token transfer is automatically validated by the hook. Only whitelisted addresses can send tokens - enforced at the protocol level, bypassing is impossible.

```
User A → transfer_checked() → Token-2022 → YOUR HOOK → ✅/❌ → Complete/Reject
```

## 📁 Project Structure

```
programs/whitelist-transfer-hook/src/
├── lib.rs                      # Program entry points
├── constants.rs                # PDA seeds
├── error.rs                    # Custom errors
├── state/
│   ├── config.rs               # Admin configuration
│   └── whitelist.rs            # Whitelist entry per address
└── instructions/
    ├── initialize_config.rs    # Set admin
    ├── whitelist_operations.rs # Add/remove from whitelist
    ├── mint_token.rs           # Create Token-2022 mint with hook
    ├── init_extra_account_meta.rs # Configure hook's extra accounts
    └── transfer_hook.rs        # The actual hook validation
```

## 🔧 Instructions

| Instruction                | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `initialize_config`        | Set the admin who can manage whitelist             |
| `add_to_whitelist`         | Add an address to the whitelist                    |
| `remove_from_whitelist`    | Remove an address from whitelist                   |
| `init_mint`                | Create Token-2022 mint with TransferHook extension |
| `initialize_transfer_hook` | Set up ExtraAccountMetaList for the hook           |
| `transfer_hook`            | Called automatically by Token-2022 on transfers    |

## 🚀 Build & Test

```bash
# Build
anchor build

# Test
anchor test
```

## 📖 How Transfer Hooks Work

1. **Mint Creation**: Create a Token-2022 mint with `TransferHook` extension pointing to this program
2. **ExtraAccountMetaList**: Initialize to tell Token-2022 which accounts the hook needs
3. **Whitelist Setup**: Admin adds addresses to whitelist (creates PDAs)
4. **Automatic Enforcement**: Every `transfer_checked()` call triggers the hook

## 🔐 Security

- `check_is_transferring()` ensures hook is only called during actual transfers
- PDA-based whitelist prevents unauthorized modifications
- Admin-gated whitelist management

## 📚 Built With

- [Anchor](https://www.anchor-lang.com/) - Solana development framework
- [SPL Token-2022](https://spl.solana.com/token-2022) - Token program with extensions
- [SPL Transfer Hook Interface](https://docs.rs/spl-transfer-hook-interface) - Hook interface

---

_Turbin3 Q1 2026 Accelerated Builders - Assignment 1_
