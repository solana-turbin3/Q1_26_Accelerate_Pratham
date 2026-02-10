#[cfg(test)]
mod tests {

    use {
        anchor_lang::{
            prelude::msg,
            solana_program::{
                clock::Clock,
                program_pack::Pack,
                system_instruction,
                sysvar::{Sysvar, SysvarId},
            },
            AccountDeserialize, InstructionData, ToAccountMetas,
        },
        anchor_spl::{
            associated_token::{self, spl_associated_token_account},
            token::spl_token,
        },
        litesvm::LiteSVM,
        litesvm_token::{
            spl_token::ID as TOKEN_PROGRAM_ID, CreateAssociatedTokenAccount, CreateMint, MintTo,
        },
        solana_account::Account,
        solana_address::Address,
        solana_instruction::Instruction,
        solana_keypair::Keypair,
        solana_message::Message,
        solana_native_token::LAMPORTS_PER_SOL,
        solana_pubkey::Pubkey,
        solana_rpc_client::rpc_client::RpcClient,
        solana_sdk_ids::system_program::ID as SYSTEM_PROGRAM_ID,
        solana_signer::Signer,
        solana_transaction::Transaction,
        std::{path::PathBuf, str::FromStr},
    };

    static PROGRAM_ID: Pubkey = crate::ID;

    // Setup function to initialize LiteSVM and create a payer keypair
    // Also loads an account from devnet into the LiteSVM environment (for testing purposes)
    fn setup() -> (LiteSVM, Keypair) {
        // Initialize LiteSVM and payer
        let mut program = LiteSVM::new();
        let payer = Keypair::new();

        // Set initial clock
        let mut clock = Clock::default();
        clock.unix_timestamp = 1000000;
        program.set_sysvar(&clock);

        // Airdrop some SOL to the payer keypair
        program
            .airdrop(&payer.pubkey(), 10 * LAMPORTS_PER_SOL)
            .expect("Failed to airdrop SOL to payer");

        // Load program SO file
        let so_path =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy/anchor_escrow.so");

        let program_data = std::fs::read(so_path).expect("Failed to read program SO file");

        program.add_program(PROGRAM_ID, &program_data);

        // Example on how to Load an account from devnet
        // LiteSVM does not have access to real Solana network data since it does not have network access,
        // so we use an RPC client to fetch account data from devnet
        let rpc_client = RpcClient::new("https://api.devnet.solana.com");
        let account_address =
            Address::from_str("DRYvf71cbF2s5wgaJQvAGkghMkRcp5arvsK2w97vXhi2").unwrap();
        let fetched_account = rpc_client
            .get_account(&account_address)
            .expect("Failed to fetch account from devnet");

        // Set the fetched account in the LiteSVM environment
        // This allows us to simulate interactions with this account during testing
        program
            .set_account(
                payer.pubkey(),
                Account {
                    lamports: fetched_account.lamports,
                    data: fetched_account.data,
                    owner: Pubkey::from(fetched_account.owner.to_bytes()),
                    executable: fetched_account.executable,
                    rent_epoch: fetched_account.rent_epoch,
                },
            )
            .unwrap();

        msg!("Lamports of fetched account: {}", fetched_account.lamports);

        // Return the LiteSVM instance and payer keypair
        (program, payer)
    }

    #[test]
    fn test_make() {
        // Setup the test environment by initializing LiteSVM and creating a payer keypair
        let (mut program, payer) = setup();

        // Get the maker's public key from the payer keypair
        let maker = payer.pubkey();

        // Create two mints (Mint A and Mint B) with 6 decimal places and the maker as the authority
        // This done using litesvm-token's CreateMint utility which creates the mint in the LiteSVM environment
        let mint_a = CreateMint::new(&mut program, &payer)
            .decimals(6)
            .authority(&maker)
            .send()
            .unwrap();
        msg!("Mint A: {}\n", mint_a);

        let mint_b = CreateMint::new(&mut program, &payer)
            .decimals(6)
            .authority(&maker)
            .send()
            .unwrap();
        msg!("Mint B: {}\n", mint_b);

        // Create the maker's associated token account for Mint A
        // This is done using litesvm-token's CreateAssociatedTokenAccount utility
        let maker_ata_a = CreateAssociatedTokenAccount::new(&mut program, &payer, &mint_a)
            .owner(&maker)
            .send()
            .unwrap();
        msg!("Maker ATA A: {}\n", maker_ata_a);

        // Derive the PDA for the escrow account using the maker's public key and a seed value
        let escrow = Pubkey::find_program_address(
            &[b"escrow", maker.as_ref(), &123u64.to_le_bytes()],
            &PROGRAM_ID,
        )
        .0;
        msg!("Escrow PDA: {}\n", escrow);

        // Derive the PDA for the vault associated token account using the escrow PDA and Mint A
        let vault = associated_token::get_associated_token_address(&escrow, &mint_a);
        msg!("Vault PDA: {}\n", vault);

        // Define program IDs for associated token program, token program, and system program
        let asspciated_token_program = spl_associated_token_account::ID;
        let token_program = TOKEN_PROGRAM_ID;
        let system_program = SYSTEM_PROGRAM_ID;

        // Mint 1,000 tokens (with 6 decimal places) of Mint A to the maker's associated token account
        MintTo::new(&mut program, &payer, &mint_a, &maker_ata_a, 1000000000)
            .send()
            .unwrap();

        // Create the "Make" instruction to deposit tokens into the escrow
        let make_ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: crate::accounts::Make {
                maker: maker,
                mint_a: mint_a,
                mint_b: mint_b,
                maker_ata_a: maker_ata_a,
                escrow: escrow,
                vault: vault,
                associated_token_program: asspciated_token_program,
                token_program: token_program,
                system_program: system_program,
            }
            .to_account_metas(None),
            data: crate::instruction::Make {
                deposit: 10,
                seed: 123u64,
                receive: 10,
            }
            .data(),
        };

        // Create and send the transaction containing the "Make" instruction
        let message = Message::new(&[make_ix], Some(&payer.pubkey()));
        let recent_blockhash = program.latest_blockhash();

        let transaction = Transaction::new(&[&payer], message, recent_blockhash);

        // Send the transaction and capture the result
        let tx = program.send_transaction(transaction).unwrap();

        // Log transaction details
        msg!("\n\nMake transaction sucessfull");
        msg!("CUs Consumed: {}", tx.compute_units_consumed);
        msg!("Tx Signature: {}", tx.signature);

        // Verify the vault account and escrow account data after the "Make" instruction
        let vault_account = program.get_account(&vault).unwrap();
        let vault_data = spl_token::state::Account::unpack(&vault_account.data).unwrap();
        assert_eq!(vault_data.amount, 10);
        assert_eq!(vault_data.owner, escrow);
        assert_eq!(vault_data.mint, mint_a);

        let escrow_account = program.get_account(&escrow).unwrap();
        let escrow_data =
            crate::state::Escrow::try_deserialize(&mut escrow_account.data.as_ref()).unwrap();
        assert_eq!(escrow_data.seed, 123u64);
        assert_eq!(escrow_data.maker, maker);
        assert_eq!(escrow_data.mint_a, mint_a);
        assert_eq!(escrow_data.mint_b, mint_b);
        assert_eq!(escrow_data.receive, 10);
        assert!(escrow_data.creation_time > 0);
        msg!("Escrow creation time: {}", escrow_data.creation_time);
    }

    #[test]
    fn test_take() {
        let (mut program, payer) = setup();
        let maker = payer.pubkey();

        let mint_a = CreateMint::new(&mut program, &payer)
            .decimals(6)
            .authority(&maker)
            .send()
            .unwrap();

        let mint_b = CreateMint::new(&mut program, &payer)
            .decimals(6)
            .authority(&maker)
            .send()
            .unwrap();

        let maker_ata_a = CreateAssociatedTokenAccount::new(&mut program, &payer, &mint_a)
            .owner(&maker)
            .send()
            .unwrap();

        MintTo::new(&mut program, &payer, &mint_a, &maker_ata_a, 1000000000)
            .send()
            .unwrap();

        let seed: u64 = 123;
        let escrow = Pubkey::find_program_address(
            &[b"escrow", maker.as_ref(), &seed.to_le_bytes()],
            &PROGRAM_ID,
        )
        .0;

        let vault = associated_token::get_associated_token_address(&escrow, &mint_a);

        let associated_token_program = spl_associated_token_account::ID;
        let token_program = TOKEN_PROGRAM_ID;
        let system_program = SYSTEM_PROGRAM_ID;

        let make_ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: crate::accounts::Make {
                maker,
                mint_a,
                mint_b,
                maker_ata_a,
                escrow,
                vault,
                associated_token_program,
                token_program,
                system_program,
            }
            .to_account_metas(None),
            data: crate::instruction::Make {
                seed,
                deposit: 10,
                receive: 10,
            }
            .data(),
        };

        let message = Message::new(&[make_ix], Some(&payer.pubkey()));
        let tx = Transaction::new(&[&payer], message, program.latest_blockhash());
        program.send_transaction(tx).unwrap();

        msg!("Make executed - escrow created");

        let taker = Keypair::new();
        program
            .airdrop(&taker.pubkey(), 5 * LAMPORTS_PER_SOL)
            .unwrap();

        let taker_ata_b = CreateAssociatedTokenAccount::new(&mut program, &taker, &mint_b)
            .owner(&taker.pubkey())
            .send()
            .unwrap();

        MintTo::new(&mut program, &payer, &mint_b, &taker_ata_b, 1000000000)
            .send()
            .unwrap();

        // DON'T create it - let the program do init_if_needed
        let taker_ata_a = associated_token::get_associated_token_address(&taker.pubkey(), &mint_a);

        let maker_ata_b = associated_token::get_associated_token_address(&maker, &mint_b);

        // 1. Try to take immediately (should fail due to lockup)
        let take_ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: crate::accounts::Take {
                taker: taker.pubkey(),
                maker,
                mint_a,
                mint_b,
                taker_ata_a,
                taker_ata_b,
                maker_ata_b,
                escrow,
                vault,
                associated_token_program,
                token_program,
                system_program,
            }
            .to_account_metas(None),
            data: crate::instruction::Take {}.data(),
        };

        let message = Message::new(&[take_ix.clone()], Some(&taker.pubkey()));
        let tx = Transaction::new(&[&taker], message, program.latest_blockhash());
        assert!(program.send_transaction(tx).is_err());
        msg!("Take failed as expected (locked)");

        // 2. Warp time
        {
            let mut clock = program.get_sysvar::<Clock>();
            clock.unix_timestamp += 2000000;
            program.set_sysvar(&clock);
        }

        // 3. Retry Take with new blockhash
        // Note: Taker transaction uniqueness is handled by blockhash/nonce usually,
        // but here we just need a fresh blockhash or a unique ix if it fails with AlreadyProcessed.
        // Since the first passed (failed) transaction might be recorded, we might need a unique ix.
        // Let's force unique ix just in case.
        let unique_ix = system_instruction::transfer(&taker.pubkey(), &taker.pubkey(), 1);
        let message = Message::new(&[take_ix, unique_ix], Some(&taker.pubkey()));
        let tx = Transaction::new(&[&taker], message, program.latest_blockhash());
        program.send_transaction(tx).unwrap();

        msg!("Take executed");

        // === STEP 4: Verify Balances & State ===

        // 1. Verify Verification: Maker should have 10 Mint B
        let maker_b_account = program.get_account(&maker_ata_b).unwrap();
        let maker_b_data = spl_token::state::Account::unpack(&maker_b_account.data).unwrap();
        assert_eq!(maker_b_data.amount, 10);
        msg!("Maker received Mint B");

        // 2. Verify Verification: Taker should have 10 Mint A
        // We calculate address because we didn't store it from init_if_needed
        let taker_a_account = program.get_account(&taker_ata_a).unwrap();
        let taker_a_data = spl_token::state::Account::unpack(&taker_a_account.data).unwrap();
        assert_eq!(taker_a_data.amount, 10);
        msg!("Taker received Mint A");

        // 3. Verify Closure: Vault should use allow 0 lamports (closed)
        if let Some(account) = program.get_account(&vault) {
            assert_eq!(account.lamports, 0, "Vault should have 0 lamports");
        }
        msg!("Vault account closed");

        // 4. Verify Closure: Escrow should use allow 0 lamports (closed)
        if let Some(account) = program.get_account(&escrow) {
            assert_eq!(account.lamports, 0, "Escrow should have 0 lamports");
        }
        msg!("Escrow account closed");
    }

    #[test]
    fn test_refund() {
        let (mut program, payer) = setup();
        let maker = payer.pubkey();

        let mint_a = CreateMint::new(&mut program, &payer)
            .decimals(6)
            .authority(&maker)
            .send()
            .unwrap();

        let mint_b = CreateMint::new(&mut program, &payer)
            .decimals(6)
            .authority(&maker)
            .send()
            .unwrap();

        let maker_ata_a = CreateAssociatedTokenAccount::new(&mut program, &payer, &mint_a)
            .owner(&maker)
            .send()
            .unwrap();

        MintTo::new(&mut program, &payer, &mint_a, &maker_ata_a, 1000000000)
            .send()
            .unwrap();

        let seed: u64 = 123;
        let escrow = Pubkey::find_program_address(
            &[b"escrow", maker.as_ref(), &seed.to_le_bytes()],
            &PROGRAM_ID,
        )
        .0;

        let vault = associated_token::get_associated_token_address(&escrow, &mint_a);

        let associated_token_program = spl_associated_token_account::ID;
        let token_program = TOKEN_PROGRAM_ID;
        let system_program = SYSTEM_PROGRAM_ID;

        // Make
        let make_ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: crate::accounts::Make {
                maker,
                mint_a,
                mint_b,
                maker_ata_a,
                escrow,
                vault,
                associated_token_program,
                token_program,
                system_program,
            }
            .to_account_metas(None),
            data: crate::instruction::Make {
                seed,
                deposit: 10,
                receive: 10,
            }
            .data(),
        };

        let message = Message::new(&[make_ix], Some(&payer.pubkey()));
        let tx = Transaction::new(&[&payer], message, program.latest_blockhash());
        program.send_transaction(tx).unwrap();
        msg!("Make executed");

        // Refund Instruction
        let refund_ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: crate::accounts::Refund {
                maker,
                mint_a,
                maker_ata_a,
                escrow,
                vault,
                token_program,
                system_program,
            }
            .to_account_metas(None),
            data: crate::instruction::Refund {}.data(),
        };

        let message = Message::new(&[refund_ix.clone()], Some(&payer.pubkey()));
        let tx = Transaction::new(&[&payer], message, program.latest_blockhash());

        // 1. Try to refund immediately (should fail due to lockup)
        assert!(program.send_transaction(tx).is_err());
        msg!("Refund failed as expected (locked)");

        // 2. Warp time (5 days ~ 1,000,000 slots. Let's do 2,000,000 to be safe)
        // Manually update clock sysvar
        {
            let mut clock = program.get_sysvar::<Clock>();
            clock.unix_timestamp += 2000000;
            program.set_sysvar(&clock);
        }

        // 3. Retry Refund with new blockhash and unique instruction
        // We add a dummy transfer to self to change the transaction signature
        let unique_ix = system_instruction::transfer(&payer.pubkey(), &payer.pubkey(), 1);
        let message = Message::new(&[refund_ix, unique_ix], Some(&payer.pubkey()));
        let tx = Transaction::new(&[&payer], message, program.latest_blockhash());
        program.send_transaction(tx).unwrap();
        msg!("Refund executed successfully after lockup");

        // 1. Vault closed
        if let Some(account) = program.get_account(&vault) {
            assert_eq!(account.lamports, 0, "Vault should have 0 lamports");
        }
        msg!("Vault account closed");

        // 2. Escrow closed
        if let Some(account) = program.get_account(&escrow) {
            assert_eq!(account.lamports, 0, "Escrow should have 0 lamports");
        }
        msg!("Escrow account closed");

        // 3. Maker got tokens back
        // (Started with 1000000000, deposited 10, got 10 back -> should be 1000000000)
        let maker_a_account = program.get_account(&maker_ata_a).unwrap();
        let maker_a_data = spl_token::state::Account::unpack(&maker_a_account.data).unwrap();
        assert_eq!(maker_a_data.amount, 1000000000);
        msg!("Maker fully refunded");
    }
}
