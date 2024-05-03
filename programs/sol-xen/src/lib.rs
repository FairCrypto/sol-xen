use anchor_lang::{
    prelude::*,
    solana_program::entrypoint::ProgramResult,
};
use anchor_spl::{
    token::{Token, Mint, MintTo, TokenAccount},
    token::{mint_to},
    associated_token::AssociatedToken,
};
use sha3::{Digest, Keccak256};
use std::mem::size_of;

declare_id!("UZ5TP2fxktDMEPUiANhWFFQqG9Ve7wppB73UUSodH1F");

const MAX_HASHES: u8 = 70;
const HASH_PATTERN: &str = "420";
const SUPERHASH_PATTERN: &str = "42069";
const AMP_START: u16 = 300;
const AMP_CYCLE_SLOTS: u64 = 100_000;

#[program]
pub mod sol_xen {
    use super::*;

    pub fn create_mint(ctx: Context<InitTokenMint>) -> ProgramResult {

        // initialize global state
        ctx.accounts.global_xn_record.amp = AMP_START;
        ctx.accounts.global_xn_record.last_amp_slot = Clock::get().unwrap().slot;

        Ok(())
    }

    pub fn mint_tokens(ctx: Context<MintTokens>, _eth_account: EthAccount, _counter: u32) -> ProgramResult {

        msg!("Global txs check: {}", ctx.accounts.global_xn_record.txs);

        // Get the current slot number
        let slot = Clock::get().unwrap().slot;

        // update global AMP state if required
        if slot - ctx.accounts.global_xn_record.last_amp_slot > AMP_CYCLE_SLOTS {
            ctx.accounts.global_xn_record.amp -= 1;
        }

        // Find hashes
        let (hashes, superhashes) = find_hashes(slot);

        // Mint solXEN tokens
        let points = 1_000_000_000 * (ctx.accounts.global_xn_record.amp as u64) * (hashes as u64);
        let signer_seeds: &[&[&[u8]]] = &[&[b"mint", &[ctx.bumps.mint_account]]];
        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint_account.to_account_info(),
                    authority: ctx.accounts.mint_account.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                },
                signer_seeds
            ), // using PDA to sign
            points,
        )?;

        // Update user points
        ctx.accounts.user_xn_record.points += points as u128;

        // Update tx record
        msg!("Hex check: {}", hex::encode(_eth_account.address));
        ctx.accounts.user_xn_address_records.address = _eth_account.address;
        ctx.accounts.user_xn_address_records.hashes = hashes;
        ctx.accounts.user_xn_address_records.superhashes = superhashes;
        ctx.accounts.user_xn_address_records.key = ctx.accounts.user.key();

        // Update global points
        ctx.accounts.global_xn_record.points += points as u128;
        ctx.accounts.global_xn_record.hashes += hashes as u32;
        ctx.accounts.global_xn_record.superhashes += superhashes as u32;
        ctx.accounts.global_xn_record.txs += 1;

        msg!("Global points check: {}", ctx.accounts.global_xn_record.points);
        msg!("User points check: {}", ctx.accounts.user_xn_record.points);

        Ok(())
    }
}

// TODO 1: add checks to lock this method to a specific (admin) Key
// TODO 2: after the Token Mint is launched, remove authority from it (First Principles)
#[derive(Accounts)]
pub struct InitTokenMint<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init_if_needed,
        space = 8 + size_of::<GlobalXnRecord>(),
        seeds = [b"xn-global-counter"],
        bump,
        payer = admin,
    )]
    pub global_xn_record: Box<Account<'info, GlobalXnRecord>>,
    #[account(
        init_if_needed,
        seeds = [b"mint"],
        bump,
        payer = admin,
        mint::decimals = 9,
        mint::authority = mint_account.key(),
        mint::freeze_authority = mint_account.key(),
    )]
    pub mint_account: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(_eth_account: EthAccount, _counter: u32)]
pub struct MintTokens<'info> {
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint_account,
        associated_token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"xn-global-counter"],
        bump,
    )]
    pub global_xn_record: Box<Account<'info, GlobalXnRecord>>,
    #[account(
        init_if_needed,
        space = 8 + size_of::<UserXnRecord>(),
        payer = user,
        seeds = [
            b"sol-xen",
            _eth_account.address.as_ref(),
            user.key().as_ref()
        ],
        bump
    )]
    pub user_xn_record: Box<Account<'info, UserXnRecord>>,
    #[account(
        init,
        space = 8 + size_of::<XnAddressRecord>(),
        payer = user,
        seeds = [
            b"sol-xen-addr",
            _counter.to_be_bytes().as_ref()
        ],
        bump
    )]
    pub user_xn_address_records: Box<Account<'info, XnAddressRecord>>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"mint"], bump)]
    pub mint_account: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
#[derive(InitSpace)]
pub struct UserXnRecord {
    pub points: u128,
}

#[account]
#[derive(InitSpace)]
pub struct GlobalXnRecord {
    pub amp: u16,
    pub last_amp_slot: u64,
    pub points: u128,
    pub hashes: u32,
    pub superhashes: u32,
    pub txs: u32
}

#[account]
#[derive(InitSpace)]
pub struct XnAddressRecord {
    pub address: [u8; 20],
    // TODO: problems with serialization
    // #[max_len(40)]
    // pub address: String,
    pub key: Pubkey,
    pub hashes: u8,
    pub superhashes: u8
}

pub fn find_hashes(slot: u64) -> (u8, u8) {
    let current_slot = slot;
    msg!("Current slot: {}", current_slot);
    let mut hashes = 0;
    let mut superhashes = 0;

    for i in 0..MAX_HASHES {
        let mut hasher = Keccak256::new();
        hasher.update(slot.to_le_bytes());
        hasher.update(i.to_le_bytes());
        let result = hasher.finalize();
        let hex_string = format!("{:x}", result);
        if hex_string.contains(SUPERHASH_PATTERN) {
            msg!("Found '{}' in hash at iteration {}: {}", SUPERHASH_PATTERN, i, hex_string);
            superhashes += 1;
        } else if hex_string.contains(HASH_PATTERN) {
            msg!("Found '{}' in hash at iteration {}: {}", HASH_PATTERN, i, hex_string);
            hashes += 1;
        }
    }
    return (hashes, superhashes);
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
 pub struct EthAccount {
     pub address: [u8; 20],
}



