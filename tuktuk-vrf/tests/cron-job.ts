import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  init,
  createTaskQueue,
  getTaskQueueForName,
  queueTask,
  compileTransaction,
  taskQueueAuthorityKey,
} from "@helium/tuktuk-sdk";
import { ErStateAccount } from "../target/types/er_state_account";

// VRF Oracle Queue on devnet
const DEFAULT_QUEUE = new PublicKey(
  "G9eLe2CBmLGUTMVbSsJmoGNE4VCXB7XT3TmSwXMiySk2"
);

describe("Perpetual Lottery Cron", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.ErStateAccount as Program<ErStateAccount>;
  const payer = provider.wallet as anchor.Wallet;

  const queueName = "lottery_queue";
  let taskQueuePda: PublicKey;

  // User Account PDA
  const [userAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user"), payer.publicKey.toBuffer()],
    program.programId
  );

  it("Initializes the Task Queue", async () => {
    const tuktukProgram = await init(provider);

    // Check if queue already exists
    let resolved = await getTaskQueueForName(tuktukProgram, queueName);
    if (resolved) {
      taskQueuePda = resolved;
      console.log("✅ Task Queue already exists:", taskQueuePda.toBase58());
    } else {
      try {
        const { pubkeys: { taskQueue: tqPubkey } } = await (
          await createTaskQueue(tuktukProgram, {
            name: queueName,
            minCrankReward: new anchor.BN(10_000),
            capacity: 10,
            lookupTables: [],
            staleTaskAge: 60 * 60 * 48,
          })
        ).rpcAndKeys({ skipPreflight: true });
        taskQueuePda = tqPubkey!;
        console.log("✅ Task Queue Created:", taskQueuePda.toBase58());
      } catch (e: any) {
        console.log("⚠️ Queue creation error:", e.message || e);
        resolved = await getTaskQueueForName(tuktukProgram, queueName);
        if (resolved) {
          taskQueuePda = resolved;
          console.log("   Found existing queue:", taskQueuePda.toBase58());
        } else {
          throw e;
        }
      }
    }

    // Ensure queue authority exists
    const queueAuthority = taskQueueAuthorityKey(
      taskQueuePda,
      payer.publicKey
    )[0];
    const queueAuthorityAccount =
      await tuktukProgram.account.taskQueueAuthorityV0.fetchNullable(
        queueAuthority
      );
    if (!queueAuthorityAccount) {
      console.log("   Adding queue authority...");
      await tuktukProgram.methods
        .addQueueAuthorityV0()
        .accounts({
          payer: payer.publicKey,
          queueAuthority: payer.publicKey,
          taskQueue: taskQueuePda,
        })
        .rpc({ skipPreflight: true });
      console.log("   ✅ Queue Authority added!");
    }
  });

  it("Queues a VRF Task", async () => {
    const tuktukProgram = await init(provider);

    // Resolve queue if not set
    if (!taskQueuePda) {
      const resolved = await getTaskQueueForName(tuktukProgram, queueName);
      if (!resolved) throw new Error("Task queue not found");
      taskQueuePda = resolved;
    }

    // Build the requestRandomness instruction
    const ix = await program.methods
      .requestRandomness()
      .accountsPartial({
        userAccount: userAccountPda,
        payer: payer.publicKey,
        oracleQueue: DEFAULT_QUEUE,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    // Compile for TukTuk (serializes ix into CompiledTransactionV0 format)
    const { transaction, remainingAccounts } = compileTransaction([ix], []);

    // Queue the task with "now" trigger (execute immediately)
    // NOTE: For cron scheduling, use @helium/cron-sdk (separate package)
    const methodsBuilder = await queueTask(tuktukProgram, {
      taskQueue: taskQueuePda,
      args: {
        trigger: { now: {} },
        transaction: { compiledV0: [transaction] },
      },
    });

    // Extract instruction (avoids Anchor version mismatch between SDK and project)
    const queueIx = await methodsBuilder
      .remainingAccounts(remainingAccounts)
      .instruction();

    try {
      const tx = new anchor.web3.Transaction().add(queueIx);
      tx.feePayer = payer.publicKey;
      tx.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;

      // Sign & send via raw connection to bypass Anchor provider entirely
      const signedTx = await payer.signTransaction(tx);
      const sig = await provider.connection.sendRawTransaction(
        signedTx.serialize(),
        { skipPreflight: true }
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
      console.log(`✅ VRF Task Queued! Tx: ${sig}`);
    } catch (e: any) {
      console.error("❌ queueTask error:", e.message);
      if (e.logs) console.error("Logs:", e.logs);
      if (e.error) console.error("Inner error:", JSON.stringify(e.error));
      throw e;
    }
  });
});