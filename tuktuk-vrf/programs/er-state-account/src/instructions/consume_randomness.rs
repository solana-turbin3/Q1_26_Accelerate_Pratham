use crate::state::*;
use anchor_lang::prelude::*;
use ephemeral_vrf_sdk::rnd::random_u8_with_range;

#[derive(Accounts)]
pub struct ConsumeRandomness<'info> {
    #[account(address = ephemeral_vrf_sdk::consts::VRF_PROGRAM_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,

    #[account(mut)]
    pub user_account: Account<'info, UserAccount>,
}

impl<'info> ConsumeRandomness<'info> {
    pub fn consume_randomness(&mut self, randomness: [u8; 32]) -> Result<()> {
        let random_value = random_u8_with_range(&randomness, 1, 100);
        msg!("The Oracle sent us: {}", random_value);
        self.user_account.data = random_value as u64;
        Ok(())
    }
}
