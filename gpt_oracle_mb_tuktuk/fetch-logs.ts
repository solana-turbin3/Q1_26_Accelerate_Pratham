import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import * as dns from "dns";
dns.setDefaultResultOrder("ipv4first");

async function main() {
  console.log("Fetching logs from Helius RPC...");
  const connection = new Connection(
    "https://devnet.helius-rpc.com/?api-key=e327c5e3-7e6f-4bcc-b9da-835d3d9a8025",
    "confirmed"
  );
  const programId = new PublicKey("FkXQUHMpyf5YT3o7ZWRbxfGryjA5LW6SLTiz9LGSp22b");

  const sigs = await connection.getSignaturesForAddress(programId, { limit: 20 });
  
  let found = false;
  for (const sig of sigs) {
    const tx = await connection.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (tx && tx.meta && tx.meta.logMessages) {
      const logs = tx.meta.logMessages.join("\n");
      if (logs.includes("Response: ")) {
        const match = logs.match(/Response: "(.*?)"/);
        if (match) {
            console.log("✅ FOUND GPT RESPONSE IN TX:", sig.signature);
            console.log("\n🤖 ORACLE RESPONSE 🤖");
            console.log(`"${match[1]}"\n`);
            found = true;
            break;
        }
      }
    }
  }
  
  if (!found) {
      console.log("❌ Could not find the response in the last 20 transactions. The Oracle node might be down or heavily delayed on Devnet.");
  }
}
main().catch(console.error);
