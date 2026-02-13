use crate::state::*;
use anchor_lang::prelude::*;
use ephemeral_vrf_sdk::anchor::vrf;
use ephemeral_vrf_sdk::instructions::{create_request_randomness_ix, RequestRandomnessParams};
use ephemeral_vrf_sdk::types::SerializableAccountMeta;

#[vrf]
#[derive(Accounts)]
pub struct RequestRandomness<'info> {
    #[account(mut)]
    pub user_account: Account<'info, UserAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: The oracle queue
    #[account(mut, address = ephemeral_vrf_sdk::consts::DEFAULT_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> RequestRandomness<'info> {
    pub fn handler(ctx: Context<RequestRandomness>) -> Result<()> {
        // 1. Define the parameters for the request
        let params = RequestRandomnessParams {
            payer: ctx.accounts.payer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),

            // The ID of our program
            callback_program_id: crate::ID,

            // 🎯 THE CHALLENGE:
            // We need the discriminator specifically for the "ConsumeRandomness" instruction.
            // In Anchor, you can access this using: instruction::[InstructionName]::DISCRIMINATOR
            callback_discriminator: crate::instruction::ConsumeRandomness::DISCRIMINATOR.to_vec(),

            caller_seed: [0; 32], // A simple seed for now
            accounts_metas: Some(vec![SerializableAccountMeta {
                pubkey: ctx.accounts.user_account.key(),
                is_signer: false,
                is_writable: true,
            }]),
            ..Default::default()
        };

        let ix = create_request_randomness_ix(params);

        ctx.accounts
            .invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;

        Ok(())
    }
}
