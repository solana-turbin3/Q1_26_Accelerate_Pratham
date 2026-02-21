#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

mod instructions;
mod state;

use instructions::*;

declare_id!("FkXQUHMpyf5YT3o7ZWRbxfGryjA5LW6SLTiz9LGSp22b");

#[program]
pub mod gpt_oracle_mb_tuktuk {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize(ctx)
    }

    pub fn ask_oracle(ctx: Context<AskOracle>) -> Result<()> {
        instructions::ask_oracle(ctx)
    }

    pub fn receive_answer(ctx: Context<ReceiveAnswerContext>, response: String) -> Result<()> {
        instructions::receive_answer(ctx, response)
    }

    pub fn close_user(ctx: Context<CloseUser>) -> Result<()> {
        instructions::close_user(ctx)
    }

    pub fn schedule(ctx: Context<Schedule>, task_id: u16) -> Result<()> {
        ctx.accounts.schedule(task_id, &ctx.bumps)
    }
}
