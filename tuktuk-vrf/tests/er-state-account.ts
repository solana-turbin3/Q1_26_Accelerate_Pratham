import * as anchor from "@coral-xyz/anchor";
import { Program, Wallet } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";

const DEFAULT_QUEUE = new PublicKey("Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh");
const DEFAULT_EPHEMERAL_QUEUE = new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");
import { ErStateAccount } from "../target/types/er_state_account";
import { GetCommitmentSignature } from "@magicblock-labs/ephemeral-rollups-sdk";

describe("er-state-account", () => {
  // 1. Setup Providers
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const testUser = Keypair.generate();
  const testUserWallet = new Wallet(testUser);

  const userProvider = new anchor.AnchorProvider(
      provider.connection,
      testUserWallet,
      anchor.AnchorProvider.defaultOptions()
  );

  const programUser = new Program<ErStateAccount>(
      anchor.workspace.ErStateAccount.idl,
      userProvider
  );

  const connectionER = new anchor.web3.Connection(
    process.env.EPHEMERAL_PROVIDER_ENDPOINT || "https://devnet.magicblock.app/",
    { wsEndpoint: process.env.EPHEMERAL_WS_ENDPOINT || "wss://devnet.magicblock.app/" }
  );

  const userProviderER = new anchor.AnchorProvider(
      connectionER,
      testUserWallet,
      anchor.AnchorProvider.defaultOptions()
  );

  const programUserER = new Program<ErStateAccount>(
      anchor.workspace.ErStateAccount.idl,
      userProviderER
  );

  let userAccountPda: PublicKey;

  console.log("   Test User Public Key:", testUser.publicKey.toString());

  before(async () => {
    // Fund the user
    try {
        const transferTx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: provider.publicKey,
                toPubkey: testUser.publicKey,
                lamports: 0.1 * LAMPORTS_PER_SOL,
            })
        );
        await provider.sendAndConfirm(transferTx);
        console.log("   Funded test user.");
    } catch (e) {
        console.error("   ❌ Funding failed:", e);
    }

    [userAccountPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("user"), testUser.publicKey.toBuffer()],
        programUser.programId
    );
  });

  it("Step 1: Initialize User (Base Layer)", async () => {
    await programUser.methods
      .initialize()
      .accounts({
        userAccount: userAccountPda,
        payer: testUser.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("User Initialized");
  });

  it("Step 2: Task 1 - VRF on Base Layer", async () => {
    await programUser.methods
      .requestRandomness()
      .accountsPartial({
        userAccount: userAccountPda,
        payer: testUser.publicKey,
        oracleQueue: DEFAULT_QUEUE,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });
    console.log("Task 1 Request Sent");

    console.log("   ⏳ Waiting 5s for oracle callback...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const account = await programUser.account.userAccount.fetch(userAccountPda);
    console.log("🎲 BASE LAYER RANDOM NUMBER:", account.data.toString());
  });

  it("Step 3: Delegate to Ephemeral Rollup", async () => {
    await programUser.methods
      .delegate()
      .accounts({
        userAccount: userAccountPda,
        payer: testUser.publicKey,
        validator: new PublicKey("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"),
        systemProgram: SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });

    // Wait for bridge propagation
    console.log("   Delegated! Waiting 3s for bridge...");
    await new Promise((resolve) => setTimeout(resolve, 3000));
    console.log("Delegated to ER ⚡");
  });

  it("Step 4: Task 2 - VRF on Ephemeral Rollup", async () => {
    console.log("   Requesting randomness on ER...");
    const tx = await programUserER.methods
      .requestRandomness()
      .accountsPartial({
        userAccount: userAccountPda,
        payer: testUser.publicKey,
        oracleQueue: DEFAULT_EPHEMERAL_QUEUE,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    tx.feePayer = testUser.publicKey;
    tx.recentBlockhash = (await connectionER.getLatestBlockhash()).blockhash;
    tx.sign(testUser);

    const txHash = await connectionER.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    console.log("Task 2 VRF Executed on ER. Signature:", txHash);

    console.log("   ⏳ Waiting 5s for oracle callback...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Use raw getAccountInfo + BN slice (anchor fetch can fail silently on ER)
    const accountInfo = await connectionER.getAccountInfo(userAccountPda);
    if (accountInfo) {
      // Offset: 8 (discriminator) + 32 (pubkey) = 40, then 8 bytes for u64
      const randomValue = new anchor.BN(accountInfo.data.slice(40, 48), "le");
      console.log("🎲 ER RANDOM NUMBER:", randomValue.toString());
    } else {
      console.log("⚠️ Could not read account from ER");
    }
  });

  // --- ORIGINAL TESTS RESTORED BELOW ---

  it("Step 5: Update & Commit (Original Test)", async () => {
    // This tests standard state updates on the ER
    const tx = await programUserER.methods
      .updateCommit(new anchor.BN(42))
      .accounts({
        userAccount: userAccountPda,
        payer: testUser.publicKey, // "user" in original test
      })
      .transaction();

    tx.feePayer = testUser.publicKey;
    tx.recentBlockhash = (await connectionER.getLatestBlockhash()).blockhash;
    tx.sign(testUser);

    const txHash = await connectionER.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    console.log("State Updated & Committed. Signature:", txHash);

    // Optional: Get commitment signature (just to show we can)
    // const commitSig = await GetCommitmentSignature(txHash, connectionER);
  });

  it("Step 6: Undelegate (Back to Solana)", async () => {
    const tx = await programUserER.methods
      .undelegate()
      .accounts({
        userAccount: userAccountPda,
        payer: testUser.publicKey,
      })
      .transaction();

    tx.feePayer = testUser.publicKey;
    tx.recentBlockhash = (await connectionER.getLatestBlockhash()).blockhash;
    tx.sign(testUser);

    const txHash = await connectionER.sendRawTransaction(tx.serialize());
    await connectionER.confirmTransaction(txHash);
    console.log("Undelegated. Back on Solana.");
  });

it("Step 7: Close Account (Original Test)", async () => {
      console.log("   Waiting 5s for ownership to settle...");
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // 1. Capture the signature in a variable ('tx')
      const tx = await programUser.methods
        .close()
        .accounts({
          userAccount: userAccountPda,
          payer: testUser.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // 2. Print it out!
      console.log("📝 Close Transaction Signature:", tx);
      console.log("Account Closed. All Systems Go! 🚀");
    });
});