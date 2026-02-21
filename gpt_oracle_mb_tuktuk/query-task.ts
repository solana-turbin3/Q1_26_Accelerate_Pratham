import { Connection, PublicKey } from "@solana/web3.js";
import * as dns from "dns";
dns.setDefaultResultOrder("ipv4first");

async function main() {
  const connection = new Connection(
    "https://devnet.helius-rpc.com/?api-key=e327c5e3-7e6f-4bcc-b9da-835d3d9a8025",
    "confirmed"
  );
  
  const TUKTUK_PROGRAM_ID = new PublicKey("tuktukUrfhXT6ZT77QTU8RQtvgL967uRuVagWF57zVA");
  const TASK_QUEUE = new PublicKey("UwdRmurFA11isBpDNY9HNcoL95Pnt4zNYE2cd1SQwn2");

  const taskIdBuf = Buffer.alloc(2);
  taskIdBuf.writeUInt16LE(0);
  const [taskAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), TASK_QUEUE.toBuffer(), taskIdBuf],
    TUKTUK_PROGRAM_ID
  );

  console.log("Checking Task PDA:", taskAccount.toBase58());
  const accountInfo = await connection.getAccountInfo(taskAccount);
  
  if (accountInfo) {
      console.log("⚠️ Task is STILL on-chain. It has NOT been executed by TukTuk yet.");
      console.log("Data length:", accountInfo.data.length);
  } else {
      console.log("✅ Task PDA does NOT exist! This means TukTuk successfully cranked it and deleted the queue memory.");
  }
}
main().catch(console.error);
