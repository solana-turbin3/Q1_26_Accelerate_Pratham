# Generic Storage (Multiple Serialization Formats) 🦀

This project solves **Challenge 1** of the Turbin3 Accelerate curriculum. It demonstrates how to build a generic `Storage<T, S>` backend that handles dynamic payload conversion across entirely different encoding standards with zero-cost abstractions over the heap.

## Architecture

1. **`Serializer<T>` Trait**: We define an interface requiring implementations for `to_bytes` and `from_bytes`, returning explicit `Result<Vec<u8>, String>` wrappers. This guarantees consistent API boundaries regardless of whether the internal library uses Serde, Borsh, or custom macros.
2. **`Storage<T, S>`**: The primary container holds a raw `Option<Vec<u8>>` and tracks the generic `T` datatype entirely at compile-time via `PhantomData<T>`. This ensures zero-runtime overhead while still strictly enforcing type safety upon load/save operations.

## Serialization Libraries Handled

The test payloads seamlessly bounce between the following three serializers on the exact same datatype simultaneously:

1. **Borsh**: Direct `BorshSerialize` and `BorshDeserialize` implementations.
2. **JSON**: Standard `serde_json` encoding.
3. **Wincode**: The hyper-optimized binary parser natively implemented by Solana's Anza team. It avoids generic `serde` dependencies in favor of aggressively optimized `SchemaWrite` and `SchemaRead` macro evaluations (`wincode::serialize`).

## Usage & Tests

To verify the generics successfully map through `PhantomData` to validate the three respective macro layers, run the internal test suite:

```bash
cargo test
```
