use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ConsumeRandomness<'info> {
    #[account(mut)]
    pub user_account: Account<'info, UserAccount>,

    #[account(address = ephemeral_vrf_sdk::consts::VRF_PROGRAM_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> ConsumeRandomness<'info> {
    pub fn handler(ctx: Context<Self>, randomness: [u8; 32]) -> Result<()> {
        let random_value = u64::from_le_bytes(randomness[0..8].try_into().unwrap());

        msg!("The Oracle sent us: {}", random_value);

        ctx.accounts.user_account.data = random_value;

        Ok(())
    }
}
