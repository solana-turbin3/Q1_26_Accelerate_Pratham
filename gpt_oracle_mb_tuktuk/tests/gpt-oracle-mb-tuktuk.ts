import * as anchor from "@coral-xyz/anchor";
import * as dns from "dns";
dns.setDefaultResultOrder("ipv4first");
import { Program, Wallet } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { SYSTEM_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/native/system";
import { GptOracleMbTuktuk } from "../target/types/gpt_oracle_mb_tuktuk";
import { init as initTuktuk, taskQueueAuthorityKey } from "@helium/tuktuk-sdk";

describe("gpt-oracle-mb-tuktuk", () => {
  const connection = new anchor.web3.Connection(
    "https://devnet.helius-rpc.com/?api-key=e327c5e3-7e6f-4bcc-b9da-835d3d9a8025",
    {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 60000,
    }
  );

  const provider = new anchor.AnchorProvider(
    connection,
    anchor.AnchorProvider.env().wallet,
    { preflightCommitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const wallet = provider.wallet as Wallet;
  const program = anchor.workspace.GptOracleMbTuktuk as Program<GptOracleMbTuktuk>;

  const ORACLE_PROGRAM_ID = new PublicKey("LLMrieZMpbJFwN52WgmBNMxYojrpRVYXdC1RCweEbab");
  const TUKTUK_PROGRAM_ID = new PublicKey("tuktukUrfhXT6ZT77QTU8RQtvgL967uRuVagWF57zVA");
  const TASK_QUEUE = new PublicKey("UwdRmurFA11isBpDNY9HNcoL95Pnt4zNYE2cd1SQwn2");

  const getUserAccountPda = () =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("user"), wallet.publicKey.toBuffer()],
      program.programId
    );

  const getCounterPda = () =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("counter")],
      ORACLE_PROGRAM_ID
    );

  const getLlmContextPda = (count: number) =>
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("test-context"),
        new Uint8Array(new Uint32Array([count]).buffer),
      ],
      ORACLE_PROGRAM_ID
    );

  const getInteractionPda = (context: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("interaction"),
        wallet.publicKey.toBuffer(),
        context.toBuffer(),
      ],
      ORACLE_PROGRAM_ID
    );

  const getQueueAuthorityPda = () =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("queue_authority")],
      program.programId
    );

  describe("Initialization", () => {
    it("Initializes agent if not already created", async () => {
      const [userAccountPda] = getUserAccountPda();
      const [counterPda] = getCounterPda();

      // Check if already initialized
      const userAccountInfo = await provider.connection.getAccountInfo(userAccountPda);
      if (userAccountInfo) {
        console.log("Agent already initialized, skipping...");
        return;
      }

      const counterInfo = await provider.connection.getAccountInfo(counterPda);
      const count = counterInfo!.data.readUInt32LE(8);
      console.log("Counter:", count);

      const [llmContextPda] = getLlmContextPda(count);

      const tx = await program.methods
        .initialize()
        .accountsPartial({
          payer: wallet.publicKey,
          userAccount: userAccountPda,
          counter: counterPda,
          llmContext: llmContextPda,
          oracleProgram: ORACLE_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        })
        .rpc();

      console.log("Initialize tx:", tx);
    });
  });

  describe("Interaction", () => {
    it("Interacts with LLM", async () => {
      const [userAccountPda] = getUserAccountPda();
      const userAccount = await program.account.userAccount.fetch(userAccountPda);

      const llmContextPda = userAccount.context;
      const [interactionPda] = getInteractionPda(llmContextPda);

      const tx = await program.methods
        .askOracle()
        .accountsPartial({
          interaction: interactionPda,
          payer: wallet.publicKey,
          systemProgram: SYSTEM_PROGRAM_ID,
          oracleProgram: ORACLE_PROGRAM_ID,
          userAccount: userAccountPda,
          llmContext: llmContextPda,
        })
        .rpc();

      console.log("Interaction tx:", tx);
    });
  });

  describe("Schedule", () => {
    it("Schedules ask_oracle via TukTuk", async () => {
      const tuktukProgram = await initTuktuk(provider);
      const [userAccountPda] = getUserAccountPda();
      const [queueAuthority] = getQueueAuthorityPda();

      const userAccount = await program.account.userAccount.fetch(userAccountPda);
      const llmContextPda = userAccount.context;
      const [interactionPda] = getInteractionPda(llmContextPda);

      // Register queue authority if not already
      const tqAuthPda = taskQueueAuthorityKey(TASK_QUEUE, queueAuthority)[0];
      const tqAuthInfo = await provider.connection.getAccountInfo(tqAuthPda);
      if (!tqAuthInfo) {
        console.log("Registering queue authority...");
        const builder = tuktukProgram.methods
          .addQueueAuthorityV0()
          .accounts({
            payer: wallet.publicKey,
            queueAuthority,
            taskQueue: TASK_QUEUE,
          });
        let regTx = await builder.transaction();
        regTx.feePayer = wallet.publicKey;
        regTx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
        regTx = await wallet.signTransaction(regTx);
        const rawRegTx = regTx.serialize();
        const regTxId = await provider.connection.sendRawTransaction(rawRegTx, { skipPreflight: true });
        await provider.connection.confirmTransaction(regTxId, "confirmed");
        console.log("Registered:", regTxId);
      } else {
        console.log("Queue authority already registered.");
      }

      // Find free task id from bitmap
      // Find free task id from bitmap
      const tqRaw = await tuktukProgram.account.taskQueueV0.fetch(TASK_QUEUE);
      let taskId = 0;
      for (let i = 0; i < tqRaw.capacity; i++) {
        const byteIdx = Math.floor(i / 8);
        const bitIdx = i % 8;
        if ((tqRaw.taskBitmap[byteIdx] & (1 << bitIdx)) === 0) {
          taskId = i;
          break;
        }
      }

      const taskIdBuf = Buffer.alloc(2);
      taskIdBuf.writeUInt16LE(taskId);
      const [taskAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("task"), TASK_QUEUE.toBuffer(), taskIdBuf],
        TUKTUK_PROGRAM_ID
      );
      const [tqAuthorityPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("task_queue_authority"),
          TASK_QUEUE.toBuffer(),
          queueAuthority.toBuffer(),
        ],
        TUKTUK_PROGRAM_ID
      );

      console.log("task_id:", taskId);
      console.log("task:", taskAccount.toBase58());

      const builder = program.methods
        .schedule(taskId)
        .accountsPartial({
          payer: wallet.publicKey,
          interaction: interactionPda,
          userAccount: userAccountPda,
          contextAccount: llmContextPda,
          taskQueue: TASK_QUEUE,
          taskQueueAuthority: tqAuthorityPda,
          task: taskAccount,
          queueAuthority,
          tuktukProgram: TUKTUK_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        });
      let tx = await builder.transaction();
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
      tx = await wallet.signTransaction(tx);
      const rawTx = tx.serialize();
      const txid = await provider.connection.sendRawTransaction(rawTx, { skipPreflight: true });
      await provider.connection.confirmTransaction(txid, "confirmed");

      console.log("Schedule tx:", txid);
      console.log(
        `\nhttps://explorer.solana.com/address/${program.programId.toBase58()}?cluster=devnet`
      );

      console.log("\n   ⏳ Waiting 15 seconds for GPT Oracle callback...");
      await new Promise((resolve) => setTimeout(resolve, 15000));

      const sigs = await provider.connection.getSignaturesForAddress(program.programId, { limit: 10 });
      console.log("   🔍 Checking logs for Oracle Response...");
      for (const sigInfo of sigs) {
        const txInfo = await provider.connection.getTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
        if (txInfo && txInfo.meta && txInfo.meta.logMessages) {
          const logs = txInfo.meta.logMessages.join('\n');
          if (logs.includes("Response: ")) {
            const match = logs.match(/Response: "(.*?)"/);
            if (match) {
              console.log("\n   🤖 GPT Oracle Response 🤖");
              console.log(`   "${match[1]}"\n`);
              break;
            }
          }
        }
      }
    });
  });

  describe("Teardown", () => {
    it("Closes User Account and Reclaims Rent", async () => {
      const [userAccountPda] = getUserAccountPda();

      const tx = await program.methods
        .closeUser()
        .accountsPartial({
          payer: wallet.publicKey,
          userAccount: userAccountPda,
        })
        .rpc();

      console.log("✅ User Account Closed! Rent reclaimed. Tx:", tx);
    });
  });
});
