import * as dns from "dns";
dns.setDefaultResultOrder("ipv4first");
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  init,
  createTaskQueue,
  getTaskQueueForName,
  compileTransaction,
  taskQueueAuthorityKey,
  taskKey,
} from "@helium/tuktuk-sdk";
import { ErStateAccount } from "../target/types/er_state_account";

// VRF Oracle Queue on devnet
const DEFAULT_QUEUE = new PublicKey(
  "G9eLe2CBmLGUTMVbSsJmoGNE4VCXB7XT3TmSwXMiySk2"
);

// TukTuk Program ID
const TUKTUK_PROGRAM_ID = new PublicKey(
  "tuktukUrfhXT6ZT77QTU8RQtvgL967uRuVagWF57zVA"
);

// TukTuk Config PDA
const TUKTUK_CONFIG = PublicKey.findProgramAddressSync(
  [Buffer.from("tuktuk_config")],
  TUKTUK_PROGRAM_ID
)[0];

describe("Perpetual Lottery Cron", () => {
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
  const program = anchor.workspace.ErStateAccount as Program<ErStateAccount>;
  const payer = provider.wallet as anchor.Wallet;

  const queueName = `lottery_${Math.floor(Date.now() / 1000)}`;
  let taskQueuePda: PublicKey;

  // User Account PDA
  const [userAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user"), payer.publicKey.toBuffer()],
    program.programId
  );

  // Queue Authority PDA (our program's)
  const [queueAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("queue_authority")],
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
        const builder = await createTaskQueue(tuktukProgram, {
            name: queueName,
            minCrankReward: new anchor.BN(10_000),
            capacity: 10,
            lookupTables: [],
            staleTaskAge: 60 * 60 * 48,
          });
        let tx = await builder.transaction();
        tx.feePayer = payer.publicKey;
        tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
        tx = await payer.signTransaction(tx);
        const rawTx = tx.serialize();
        const txid = await provider.connection.sendRawTransaction(rawTx, { skipPreflight: true });
        await provider.connection.confirmTransaction(txid);
        const tqPubkey = (await builder.pubkeys()).taskQueue;
        taskQueuePda = tqPubkey!;
        console.log("✅ Task Queue Created:", taskQueuePda.toBase58());
      } catch (e: any) {
        console.log("⚠️ Queue creation error full stack:", e.stack || e);
        console.log("Original error:", e);
        resolved = await getTaskQueueForName(tuktukProgram, queueName);
        if (resolved) {
          taskQueuePda = resolved;
          console.log("   Found existing queue:", taskQueuePda.toBase58());
        } else {
          throw e;
        }
      }
    }

    // Ensure payer's queue authority exists
    const payerQueueAuthority = taskQueueAuthorityKey(
      taskQueuePda,
      payer.publicKey
    )[0];
    const payerQueueAuthorityAccount =
      await tuktukProgram.account.taskQueueAuthorityV0.fetchNullable(
        payerQueueAuthority
      );
    if (!payerQueueAuthorityAccount) {
      console.log("   Adding payer queue authority...");
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

    // Ensure our program's queue_authority PDA is also registered
    // (needed for on-chain CPI — the PDA signs the queue_task_v0 call)
    const programQueueAuthority = taskQueueAuthorityKey(
      taskQueuePda,
      queueAuthorityPda
    )[0];
    const programQueueAuthorityAccount =
      await tuktukProgram.account.taskQueueAuthorityV0.fetchNullable(
        programQueueAuthority
      );
    if (!programQueueAuthorityAccount) {
      console.log("   Adding program PDA queue authority...");
      await tuktukProgram.methods
        .addQueueAuthorityV0()
        .accounts({
          payer: payer.publicKey,
          queueAuthority: queueAuthorityPda,
          taskQueue: taskQueuePda,
        })
        .rpc({ skipPreflight: true });
      console.log("   ✅ Program Queue Authority added!");
    }
  });

  it("Initializes User Account (if needed)", async () => {
    // Schedule instruction requires an initialized UserAccount PDA
    const userAccount = await program.account.userAccount.fetchNullable(
      userAccountPda
    );
    if (!userAccount) {
      await program.methods
        .initialize()
        .accountsPartial({
          user: payer.publicKey,
          userAccount: userAccountPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ skipPreflight: true });
      console.log("✅ User Account Initialized:", userAccountPda.toBase58());
    } else {
      console.log("✅ User Account already exists:", userAccountPda.toBase58());
    }
  });

  it("Schedules VRF Task via On-Chain Instruction", async () => {
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

    // Compile for TukTuk format
    const { transaction: compiledTx, remainingAccounts } = compileTransaction(
      [ix],
      []
    );

    // TukTuk's queue_task_v0 reads remaining_accounts from CPI context
    // and extends compiled_tx.accounts with them — so we pass accounts=[]
    // in the compiled tx and forward remainingAccounts via our program's remaining_accounts

    // Find next available task ID
    const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(
      taskQueuePda
    );
    let taskId = 0;
    for (let i = 0; i < taskQueueAcc.capacity; i++) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx = i % 8;
      if ((taskQueueAcc.taskBitmap[byteIdx] & (1 << bitIdx)) === 0) {
        taskId = i;
        break;
      }
    }

    // Derive task PDA
    const [taskPda] = taskKey(taskQueuePda, taskId);

    // Derive TukTuk's task queue authority PDA
    const [tuktukTaskQueueAuthority] = taskQueueAuthorityKey(
      taskQueuePda,
      queueAuthorityPda
    );

    console.log("📋 Schedule details:");
    console.log("   Task Queue:", taskQueuePda.toBase58());
    console.log("   Task PDA:", taskPda.toBase58());
    console.log("   Task ID:", taskId);
    console.log("   Queue Authority (our PDA):", queueAuthorityPda.toBase58());
    console.log(
      "   TukTuk Task Queue Authority:",
      tuktukTaskQueueAuthority.toBase58()
    );

    try {
      // Build the schedule instruction call
      const scheduleCall = program.methods
        .schedule(taskId, compiledTx)
        .accountsPartial({
          user: payer.publicKey,
          userAccount: userAccountPda,
          taskQueue: taskQueuePda,
          taskQueueAuthority: tuktukTaskQueueAuthority,
          task: taskPda,
          queueAuthority: queueAuthorityPda,
          systemProgram: SystemProgram.programId,
          tuktukProgram: TUKTUK_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts);

      // Simulate first to see logs
      console.log("🔍 Simulating schedule transaction...");
      try {
        const simResult = await scheduleCall.simulate();
        console.log("✅ Simulation passed!");
        if (simResult.events) console.log("Events:", simResult.events);
      } catch (simErr: any) {
        console.error("❌ Simulation failed:", simErr.message);
        if (simErr.simulationResponse?.logs) {
          console.error("Simulation logs:");
          simErr.simulationResponse.logs.forEach((l: string) =>
            console.error("  ", l)
          );
        }
        if (simErr.logs) {
          console.error("Error logs:");
          simErr.logs.forEach((l: string) => console.error("  ", l));
        }
        throw simErr;
      }

      // If simulation passes, send the transaction
      const tx = await scheduleCall.rpc({ skipPreflight: false });
      console.log(`✅ VRF Task Scheduled On-Chain! Tx: ${tx}`);
    } catch (e: any) {
      console.error("❌ Schedule error:", e.message || JSON.stringify(e, null, 2));
      if (e.logs) console.error("Logs:", e.logs);
      throw e;
    }
  });
});