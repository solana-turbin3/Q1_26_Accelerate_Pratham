#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

// These imports are needed for the transfer_hook discriminator
use spl_discriminator::SplDiscriminate;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

// Declare your modules
mod constants;
mod error;
mod instructions;
mod state;

// Re-export instructions for cleaner access
use instructions::*;

declare_id!("EYVecuixLRK1FBoX36HWCNrQBjZvTPFJz2qaGG8ovua");

#[program]
pub mod whitelist_transfer_hook {
    use super::*;

    // 1. Initialize config (set admin)
    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        ctx.accounts.initialize_config(&ctx.bumps)
    }

    // 2. Add to whitelist
    pub fn add_to_whitelist(ctx: Context<AddToWhiteList>, address: Pubkey) -> Result<()> {
        // Call the handler - which method?
        ctx.accounts.add_to_whitelist(address, &ctx.bumps)
    }

    // 3. Remove from whitelist
    pub fn remove_from_whitelist(ctx: Context<RemoveFromWhiteList>, address: Pubkey) -> Result<()> {
        // Call the handler
        ctx.accounts.remove_from_whitelist(address)
    }

    // 4. Create mint with TransferHook extension
    pub fn init_mint(ctx: Context<TokenFactory>, decimals: u8) -> Result<()> {
        // Call the handler
        ctx.accounts.init_mint(decimals)
    }

    // 5. Initialize extra account meta list
    pub fn initialize_transfer_hook(ctx: Context<InitializeExtraAccountMetaList>) -> Result<()> {
        // Call the handler
        ctx.accounts.initialize_extra_account_meta_list(&ctx.bumps)
    }

    // 6. THE MAGIC - Token-2022 looks for this discriminator!
    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        ctx.accounts.transfer_hook(amount)
    }
}
