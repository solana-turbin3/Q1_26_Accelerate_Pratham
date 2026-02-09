use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::spl_token_2022::{
        extension::{
            transfer_hook::TransferHookAccount, BaseStateWithExtensionsMut,
            PodStateWithExtensionsMut,
        },
        pod::PodAccount,
    },
    token_interface::{Mint, TokenAccount},
};

use crate::{
    constants::{EXTRA_ACCOUNT_METAS_SEED, WHITELIST_ENTRY_SEED},
    error::ErrorCode,
    state::Whitelist,
};

#[derive(Accounts)]
pub struct TransferHook<'info> {
    #[account(
      token::mint = mint,
      token::authority = owner,
    )]
    pub source_token: InterfaceAccount<'info, TokenAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: owner of the source token can be SystemAccount or PDA owned by another program
    pub owner: UncheckedAccount<'info>,

    /// CHECK: extra account meta list account
    #[account(
      seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
      bump
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    /// CHECK: whitelist entry account
    #[account(
        seeds = [WHITELIST_ENTRY_SEED, source_token.owner.as_ref()],
        bump = whitelist.bump,
    )]
    pub whitelist: Account<'info, Whitelist>,
}

impl<'info> TransferHook<'info> {
    pub fn transfer_hook(&mut self, _amount: u64) -> Result<()> {
        self.check_is_transferring()?;

        if self.whitelist.address != self.source_token.owner {
            msg!("Invalid transfer: Source token owner is not whitelisted");
        } else {
            msg!("Valid transfer: Source token owner is whitelisted");
        }
        msg!("Transfer hook executed");
        Ok(())
    }

    fn check_is_transferring(&self) -> Result<()> {
        let source_account_info = self.source_token.to_account_info();
        let mut account_data_ref = source_account_info.try_borrow_mut_data()?;

        let mut account = PodStateWithExtensionsMut::<PodAccount>::unpack(*account_data_ref)
            .map_err(|_| ProgramError::InvalidAccountData)?;

        let extension = account
            .get_extension_mut::<TransferHookAccount>()
            .map_err(|_| ProgramError::InvalidAccountData)?;
        if !bool::from(extension.transferring) {
            msg!("❌ Not in transfer context");
            return Err(ErrorCode::InvalidAccountData.into());
        }
        Ok(())
    }
}
