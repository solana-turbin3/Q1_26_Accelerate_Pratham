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
    pub fn request_randomness(&mut self) -> Result<()> {
        let params = RequestRandomnessParams {
            payer: self.payer.key(),
            oracle_queue: self.oracle_queue.key(),
            callback_program_id: crate::ID,
            callback_discriminator: crate::instruction::ConsumeRandomness::DISCRIMINATOR.to_vec(),
            caller_seed: [0; 32],
            accounts_metas: Some(vec![SerializableAccountMeta {
                pubkey: self.user_account.key(),
                is_signer: false,
                is_writable: true,
            }]),
            ..Default::default()
        };

        let ix = create_request_randomness_ix(params);

        self.invoke_signed_vrf(&self.payer.to_account_info(), &ix)?;

        Ok(())
    }
}
