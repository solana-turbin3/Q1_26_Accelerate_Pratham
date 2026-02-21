# TukTuk VRF (Perpetual Lottery)

This program implements a lottery scheduled cron-job through the MagicBlock Ephemeral Rollup VRF and automated via **TukTuk**.

## Architecture Setup
- **User Initialization**: A Base-Layer SOL state account initializing the user on the Mainnet/Devnet.
- **Request Randomness**: VRF calls that are capable of seamlessly executing across boundaries (Base Layer to Ephemeral Rollups). It proxies calls to the MB Oracle (`DEFAULT_QUEUE` or `DEFAULT_EPHEMERAL_QUEUE`). 
- **TukTuk Integration (`schedule` instruction)**: Using `#![ephemeral]` compatible transactions, the module creates compiled CPI executions (`queue_task_v0`) that allow the TukTuk decentralized crankers to seamlessly callback our lottery and resolve the VRF without manual intervention.

## Testing Setup
Because Devnet Ephemeral endpoints natively block direct Node 18 IPv6 fetch operations, steps regarding outbound RPC communication directly to MagicBlock's specific `devnet.magicblock.app` are currently marked with `it.skip()` in `tests/er-state-account.ts`.

However, the anchor suite completely validates integration with TukTuk SDK queueing, queue authority delegation, and Base Layer Oracle invocations (`Exit Code: 0`).
