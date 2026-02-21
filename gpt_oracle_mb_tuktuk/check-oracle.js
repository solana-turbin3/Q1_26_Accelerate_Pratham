const { Connection, PublicKey } = require("@solana/web3.js");

async function main() {
  const connection = new Connection(
    "https://devnet.helius-rpc.com/?api-key=e327c5e3-7e6f-4bcc-b9da-835d3d9a8025",
    "confirmed",
  );
  const oracleId = new PublicKey("LLMrieZMpbJFwN52WgmBNMxYojrpRVYXdC1RCweEbab");

  console.log("Checking recent Oracle transactions on Devnet...");
  const sigs = await connection.getSignaturesForAddress(oracleId, { limit: 5 });

  if (sigs.length === 0) {
    console.log("No recent transactions found for the Oracle.");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  console.log(`Latest Oracle Transaction: ${sigs[0].signature}`);
  if (sigs[0].blockTime) {
    const diffSecs = now - sigs[0].blockTime;
    const diffStr =
      diffSecs < 60
        ? `${diffSecs} seconds ago`
        : `${Math.floor(diffSecs / 60)} minutes ago`;
    console.log(`Time since last transaction: ${diffStr}`);
  } else {
    console.log("Transaction is pending confirmation.");
  }
}
main().catch(console.error);
