use anchor_lang::{
    prelude::*,
};
use anchor_spl::{
    token::{Token, Mint, MintTo, TokenAccount, SetAuthority},
    metadata::{create_metadata_accounts_v3, CreateMetadataAccountsV3, Metadata, mpl_token_metadata},
    token::{mint_to, set_authority},
    associated_token::AssociatedToken,
};
use mpl_token_metadata::{types::DataV2};

declare_id!("EPAdVJ5S317jJr2ejgxoA52iptvphGXjPLbqXhZH4n8o");

const START_SLOT: u64 = 1;

// TODO: lock to a specifig admin key
// const ADMIN_KEY: &str = "somesecretadminkey";

#[program]
pub mod sol_xen_minter {
    use super::*;

    pub fn create_mint(ctx: Context<InitTokenMint>, metadata: InitTokenParams) -> Result<()> {
        
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

    pub fn revoke_mint_authority(ctx: Context<RevokeMintAuthority>, ) -> Result<()> {
        set_authority(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    account_or_mint:ctx.accounts.mint_account.to_account_info(),
                    current_authority:ctx.accounts.admin.to_account_info(),
                },
            ),
            anchor_spl::token::spl_token::instruction::AuthorityType::FreezeAccount,
            None
        ).expect("Error relinquishing Mint FreezeAccount");
        
        set_authority(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    account_or_mint:ctx.accounts.mint_account.to_account_info(),
                    current_authority:ctx.accounts.admin.to_account_info(),
                },
            ),
            anchor_spl::token::spl_token::instruction::AuthorityType::CloseAccount,
            None
        ).expect("Error relinquishing Mint CloseAccount");
        
        Ok(())
    }

    pub fn mint_tokens(ctx: Context<MintTokens>, kind: u8) -> Result<()> {
        // Get the current slot number
        let slot = Clock::get().unwrap().slot;
        require!(slot > START_SLOT, SolXenError::MintIsNotActive);
        
        require!(kind < 4, SolXenError::BadParam);

        let comma_delimited = "B8HwMYCk1o7EaJhooM4P43BHSk5M8zZHsTeJixqw7LMN,2Ewuie2KnTvMLwGqKWvEM1S2gUStHzDUfrANdJfu45QJ,5dxcK28nyAJdK9fSFuReRREeKnmAGVRpXPhwkZxAxFtJ,DdVCjv7fsPPm64HnepYy5MBfh2bNfkd84Rawey9rdt5S";

        let miners: Vec<Pubkey> = comma_delimited
            .split(',')
            .map(|s| solana_program::pubkey::Pubkey::try_from(s).unwrap())
            .collect();
        
        require!(kind < 4, SolXenError::BadParam);
        // require!(ctx.accounts.miner_program.owner == "owner");

        let minter_program_key = ctx.accounts.miner_program.key();
        require!(miners[kind as usize] == minter_program_key, SolXenError::BadParam);

        let (user_record_pda, _bump_seed) =
            Pubkey::find_program_address(&[
                b"xn-by-sol",
                ctx.accounts.user.key.as_ref(),
                &[kind],
                &minter_program_key.to_bytes()
            ], &minter_program_key);
        require!(user_record_pda == ctx.accounts.user_record.key(), SolXenError::BadOwner);
        require!(*ctx.accounts.user_record.owner == minter_program_key, SolXenError::BadOwner);

        let mut buf: &[u8] = &ctx.accounts.user_record.try_borrow_mut_data()?[..];
        let user_record: UserSolXnRecord = UserSolXnRecord::try_deserialize(&mut buf)?;
        let points = user_record.points as u64;
        print!("Miner kind {}, total points {}", kind, points);

        let current_token_balance = ctx.accounts.user_tokens_record.tokens_minted as u64;

        let token_account_seeds: &[&[&[u8]]] = &[&[b"mint", &[ctx.bumps.mint_account]]];
        let points_to_mint = if points > ctx.accounts.user_tokens_record.points_counters[kind as usize] as u64
        { points - ctx.accounts.user_tokens_record.points_counters[kind as usize] as u64 } else
        { 0 };
        print!("solXEN balance {}, new tokens to mint {}", current_token_balance, points_to_mint);

        if points_to_mint > 0 {
            // increment minted counter for user
            ctx.accounts.user_tokens_record.tokens_minted += points_to_mint as u128;
            ctx.accounts.user_tokens_record.points_counters[kind as usize] += points_to_mint as u128;
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
                points_to_mint / 1000,
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
        // mint::freeze_authority = admin.key(),
    )]
    pub mint_account: Box<Account<'info, Mint>>,
    /// CHECK: Address validated using constraint
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct RevokeMintAuthority<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub mint_account: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct InitTokenParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
}

#[derive(Accounts)]
#[instruction(kind: u8)]
pub struct MintTokens<'info> {
    /// CHECK: Address validated using PDA address derivation from seeds
    pub user_record: AccountInfo<'info>,
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
    /// CHECK: Address validated using PDA address derivation from seeds
    pub miner_program: AccountInfo<'info>,
    // pub rent: Sysvar<'info, Rent>,
}

#[account]
#[derive(Debug)]
pub struct UserSolXnRecord {
    pub hashes: u64,
    pub superhashes: u32,
    pub points: u128
}

#[account]
#[derive(InitSpace, Default)]
pub struct UserTokensRecord {
    pub points_counters: [u128; 4],
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
    #[msg("Bad param value")]
    BadParam,
}


