# GPT Oracle with MagicBlock & TukTuk

This project serves as an integration layer between a **Solana LLM Oracle** and the **MagicBlock/TukTuk** decentralized scheduler.

## Functionality

This program allows users to completely automate prompt execution on-chain:

1. **Agent Initialization**: It creates an oracle Context PDA that holds prompt interactions.
2. **Oracle Requesting**: It initiates `ask_oracle` instructions mapped directly to the ChatGPT model.
3. **Task Queuing**: With the `schedule` instruction, users can delegate an unresolved LLM prompt interaction directly to the TukTuk cranks. When the oracle eventually fires the callback (which often takes blocks depending on AI inference time), TukTuk executes the deferred processing.

## Testing Setup

The test suite in `tests/gpt-oracle-mb-tuktuk.ts` natively signs and wraps transactions to bypass builder mismatches in the NPM SDK. It completely maps the initialization, Oracle interaction, and Queue Authority delegation correctly.
