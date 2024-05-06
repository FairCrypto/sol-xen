use anchor_lang::{
    prelude::*,
};
use anchor_spl::{
    token::{Token, Mint, MintTo, TokenAccount},
    metadata::{create_metadata_accounts_v3, CreateMetadataAccountsV3, Metadata, mpl_token_metadata},
    token::{mint_to},
    associated_token::AssociatedToken,
};
use sha3::{Digest, Keccak256};
use std::mem::size_of;
use mpl_token_metadata::{types::DataV2};

declare_id!("Ete9c11LWE3rVU7vB9nAMsrUmQBPuyixdwSJCsjgqWXe");

const MAX_HASHES: u8 = 72;
const HASH_PATTERN: &str = "420";
const SUPERHASH_PATTERN: &str = "42069";
const SUPERHASH_X: u16 = 500;
const AMP_START: u16 = 300;
const AMP_CYCLE_SLOTS: u64 = 10_000;

// TODO: lock to a specifig admin key
// const ADMIN_KEY: &str = "somesecretadminkey";

#[program]
pub mod sol_xen {
    use super::*;

    pub fn create_mint(ctx: Context<InitTokenMint>, metadata: InitTokenParams) -> Result<()> {

        msg!("Global last slot check: {}", ctx.accounts.global_xn_record.last_amp_slot);
        require!(ctx.accounts.global_xn_record.last_amp_slot == 0, SolXenError::MintIsAlreadyActive);

        // initialize global state
        ctx.accounts.global_xn_record.amp = AMP_START;
        ctx.accounts.global_xn_record.last_amp_slot = Clock::get().unwrap().slot;
        ctx.accounts.global_xn_record.nonce = ctx.accounts.admin.key.to_bytes()[0..4].try_into().unwrap();

        let seeds = &["mint".as_bytes(), &[ctx.bumps.mint_account]];
        let signer = [&seeds[..]];

        let token_data: DataV2 = DataV2 {
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadata.uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        let metadata_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                payer: ctx.accounts.admin.to_account_info(),
                update_authority: ctx.accounts.admin.to_account_info(),
                mint: ctx.accounts.mint_account.to_account_info(),
                metadata: ctx.accounts.metadata.to_account_info(),
                mint_authority: ctx.accounts.mint_account.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
            &signer
        );

        create_metadata_accounts_v3(
            metadata_ctx,
            token_data,
            false,
            true,
            None,
        )?;

        Ok(())
    }

    pub fn mint_tokens(ctx: Context<MintTokens>, _eth_account: EthAccount) -> Result<()> {

        msg!("Global txs check: {}", ctx.accounts.global_xn_record.txs);

        // Get the current slot number
        let slot = Clock::get().unwrap().slot;
        
        require!(slot > 0, SolXenError::ZeroSlotValue);
        require!(ctx.accounts.global_xn_record.amp > 0, SolXenError::MintIsNotActive);

        // update global AMP state if required
        if slot - ctx.accounts.global_xn_record.last_amp_slot > AMP_CYCLE_SLOTS {
            ctx.accounts.global_xn_record.amp -= 1;
            ctx.accounts.global_xn_record.last_amp_slot = slot;
        }

        // Find hashes
        let nonce = ctx.accounts.global_xn_record.nonce;
        let (hashes, superhashes) = find_hashes(slot, nonce);

        // Calculate solXEN tokens
        let points = 1_000_000_000 * (ctx.accounts.global_xn_record.amp as u64) * (hashes as u64) 
            + 1_000_000_000 * (ctx.accounts.global_xn_record.amp as u64) * (SUPERHASH_X as u64) * (superhashes as u64);

        // Mint solXEN tokens to user
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
        ctx.accounts.user_xn_record.hashes += hashes;
        ctx.accounts.user_xn_record.superhashes += superhashes;
        
        // Update global points
        ctx.accounts.global_xn_record.points += points as u128;
        ctx.accounts.global_xn_record.hashes += hashes as u32;
        ctx.accounts.global_xn_record.superhashes += superhashes as u32;
        ctx.accounts.global_xn_record.txs += 1;
        ctx.accounts.global_xn_record.nonce = ctx.accounts.user.key.to_bytes()[0..4].try_into().unwrap();

        // Emit hash tx record
        emit!(HashEvent {
            slot,
            user: *ctx.accounts.user.key,
            eth_account: _eth_account.address,
            hashes,
            superhashes,
            points
        });

        Ok(())
    }
}

// TODO 1: add checks to lock this method to a specific (admin) Key
// TODO 2: after the Token Mint is launched, remove authority from it (First Principles)
// DONE 3: add metadata support (https://github.com/solana-developers/program-examples/blob/main/tokens/pda-mint-authority/anchor/programs/token-minter/src/instructions/create.rs)
#[derive(Accounts)]
#[instruction(params: InitTokenParams)]
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
        mint::decimals = params.decimals,
        mint::authority = mint_account.key(),
        mint::freeze_authority = mint_account.key(),
    )]
    pub mint_account: Account<'info, Mint>,
    /// CHECK: Address validated using constraint
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct InitTokenParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
}

#[derive(Accounts)]
#[instruction(_eth_account: EthAccount)]
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
        ],
        bump
    )]
    pub user_xn_record: Box<Account<'info, UserXnRecord>>,
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
    pub hashes: u8,
    pub superhashes: u8
}

#[account]
#[derive(InitSpace)]
pub struct GlobalXnRecord {
    pub amp: u16,
    pub last_amp_slot: u64,
    pub points: u128,
    pub hashes: u32,
    pub superhashes: u32,
    pub txs: u32,
    pub nonce: [u8; 4]
}

pub fn find_hashes(slot: u64, nonce: [u8; 4]) -> (u8, u8) {
    let current_slot = slot;
    msg!("Current slot: {}", current_slot);
    let mut hashes = 0;
    let mut superhashes = 0;

    for i in 0..MAX_HASHES {
        let mut hasher = Keccak256::new();
        hasher.update(nonce.as_slice());
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

#[event]
pub struct HashEvent {
    slot: u64,
    user: Pubkey,
    eth_account: [u8; 20],
    hashes: u8,
    superhashes: u8,
    points: u64
}

#[error_code]
pub enum SolXenError {
    #[msg("solXEN Mint has been already initialized")]
    MintIsAlreadyActive,
    #[msg("solXEN Mint has not yet started or is over")]
    MintIsNotActive,
    #[msg("Slot value is Zero")]
    ZeroSlotValue
}


