# Persistent Todo Queue 🦀

This is a fast, Rust-based Cliff/Command-Line Todo Application built as part of the **Turbin3 Q1 2026 Accelerate** curriculum (Challenge 2).

## Architecture & Requirements

This project focuses heavily on fundamental data structures and safe deterministic disk serialization.

- **Storage Type**: The application states are completely tracked and stored in a serialized `.bin` disk file instead of JSON or external Databases to prevent schema/Serde bloat.
- **Serialization Engine**: The project explicitly uses the **Borsh** standard (`BorshSerialize`, `BorshDeserialize`) to encode/decode the generic structures instantly when reading/writing from disk on restarts.
- **Queue Implementation**: To manage the actual Todos, it uses a fully generic double-stack (`inbox` & `outbox`) **FIFO Queue** implementation. We explicitly chose not to use the standard library `VecDeque` directly to manually prove the algorithmic complexity of a 2-stack queue.

## Usage Guide

Run the CLI passing the supported arguments to the binary via `cargo run -- <command>`.

### 1. Add a Task

This enqueues a new item into the struct, stamping it with an increasing `id` and unix `created_at` timestamp before serializing immediately to disk.

```bash
cargo run -- add "Buy groceries"
```

### 2. List Tasks

Iterates backwards from the outbox into the inbox to correctly output all active tasks in explicit FIFO order:

```bash
cargo run -- list
```

### 3. Complete Tasks

Dequeues the oldest task currently buffered in the queue and marks it complete, overwriting the disk state seamlessly.

```bash
cargo run -- done
```

### 4. Peek Next

Peek the upcoming task in the stack without actually popping it from the queue:

```bash
cargo run -- next
```
