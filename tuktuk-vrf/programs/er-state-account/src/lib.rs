#![allow(unexpected_cfgs)]
#![allow(deprecated)]

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

mod instructions;
mod state;

use instructions::*;

declare_id!("2RuRYnQYofQLhnCJ3Ywo9atAD7xiiCK3MkaHR8ryYoSC");

#[ephemeral]
#[program]
pub mod er_state_account {

    use super::*;

    pub fn initialize(ctx: Context<InitUser>) -> Result<()> {
        ctx.accounts.initialize(&ctx.bumps)?;

        Ok(())
    }

    pub fn update(ctx: Context<UpdateUser>, new_data: u64) -> Result<()> {
        ctx.accounts.update(new_data)?;

        Ok(())
    }

    pub fn update_commit(ctx: Context<UpdateCommit>, new_data: u64) -> Result<()> {
        ctx.accounts.update_commit(new_data)?;

        Ok(())
    }

    pub fn delegate(ctx: Context<Delegate>) -> Result<()> {
        ctx.accounts.delegate()?;

        Ok(())
    }

    pub fn undelegate(ctx: Context<Undelegate>) -> Result<()> {
        ctx.accounts.undelegate()?;

        Ok(())
    }

    pub fn close(ctx: Context<CloseUser>) -> Result<()> {
        ctx.accounts.close()?;

        Ok(())
    }

    pub fn request_randomness(ctx: Context<RequestRandomness>) -> Result<()> {
        ctx.accounts.request_randomness()?;
        Ok(())
    }

    pub fn consume_randomness(ctx: Context<ConsumeRandomness>, randomness: [u8; 32]) -> Result<()> {
        ctx.accounts.consume_randomness(randomness)?;
        Ok(())
    }

    pub fn schedule<'info>(
        ctx: Context<'_, '_, 'info, 'info, Schedule<'info>>,
        task_id: u16,
        compiled_tx: CompiledTransactionArg,
    ) -> Result<()> {
        ctx.accounts
            .schedule(task_id, compiled_tx, ctx.bumps, ctx.remaining_accounts)?;
        Ok(())
    }
}
