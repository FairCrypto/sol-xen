use anchor_lang::{
    prelude::*,
};
use anchor_spl::{
    token::{Token, Mint, MintTo, TokenAccount},
    metadata::{create_metadata_accounts_v3, CreateMetadataAccountsV3, Metadata, mpl_token_metadata},
    token::{mint_to},
    associated_token::AssociatedToken,
};
use mpl_token_metadata::{types::DataV2};
use sol_xen_miner::UserSolXnRecord;

declare_id!("JAdTsCgmXdg36Y2cgfz5EMag5QbXn2tu2tGXbxm2jyz5");

// TODO: lock to a specifig admin key
// const ADMIN_KEY: &str = "somesecretadminkey";

#[program]
pub mod sol_xen_minter {
    use super::*;

    pub fn create_mint(_ctx: Context<InitTokenMint>, _metadata: InitTokenParams) -> Result<()> {

        /*
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
        */
        Ok(())
    }

    pub fn mint_tokens(ctx: Context<MintTokens>, _kind: u8, _minter_program_key: Pubkey) -> Result<()> {
        
        let points = ctx.accounts.user_record.points as u64;
        print!("Total points {} for {}", points, ctx.accounts.user.key.to_string());

        let current_token_balance = ctx.accounts.user_tokens_record.tokens_minted as u64;
        print!("Current balance {} for {}", current_token_balance, ctx.accounts.user.key.to_string());
        
        let token_account_seeds: &[&[&[u8]]] = &[&[b"mint", &[ctx.bumps.mint_account]]];
        if points > current_token_balance {
            // increment minted counter for user
            ctx.accounts.user_tokens_record.tokens_minted += (points - current_token_balance) as u128;
            
            // Mint solXEN tokens to user
            mint_to(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    MintTo {
                        mint: ctx.accounts.mint_account.to_account_info(),
                        authority: ctx.accounts.mint_account.to_account_info(),
                        to: ctx.accounts.user_token_account.to_account_info(),
                    },
                    token_account_seeds
                ), // using PDA to sign
                points - current_token_balance,
            )?;
        }

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
        seeds = [b"mint"],
        bump,
        payer = admin,
        mint::decimals = params.decimals,
        mint::authority = mint_account.key(),
        mint::freeze_authority = mint_account.key(),
    )]
    pub mint_account: Account<'info, Mint>,
    /// CHECK: Address validated using constraint
    // #[account(mut)]
    // pub metadata: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    // pub token_metadata_program: Program<'info, Metadata>,
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
#[instruction(_kind: u8, _minter_program_key: Pubkey)]
pub struct MintTokens<'info> {
    #[account(
        seeds = [
            b"xn-by-sol",
            user.key().as_ref(),
            _kind.to_be_bytes().as_ref(),
            _minter_program_key.as_ref()
        ],
        // owner = _minter_program_key,
        seeds::program = _minter_program_key,
        bump
    )]
    pub user_record: Box<Account<'info, UserSolXnRecord>>,
    #[account(
        init_if_needed,
        seeds = [
            b"sol-xen-minted",
            user.key().as_ref()
        ],
        payer = user,
        space = 8 + UserTokensRecord::INIT_SPACE,
        bump
    )]
    pub user_tokens_record: Box<Account<'info, UserTokensRecord>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint_account,
        associated_token::authority = user,
    )]
    pub user_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"mint"], bump)]
    pub mint_account: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    // pub minter_program: Program<'info, SolXenMiner>,
    // pub rent: Sysvar<'info, Rent>,
}

#[account]
#[derive(InitSpace)]
pub struct UserTokensRecord {
    pub tokens_minted: u128
}

#[error_code]
pub enum SolXenError {
    #[msg("solXEN Mint has been already initialized")]
    MintIsAlreadyActive,
    #[msg("solXEN Mint has not yet started or is over")]
    MintIsNotActive,
    #[msg("Slot value is Zero")]
    ZeroSlotValue,
    #[msg("Bad account owner")]
    BadOwner,
}


