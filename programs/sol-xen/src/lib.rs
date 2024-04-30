use anchor_lang::{
    prelude::*,
    // solana_program,
    solana_program::entrypoint::ProgramResult,
    system_program::*,
};
use anchor_spl::{
    token::{Token,Mint,MintTo,TokenAccount},
    // token::InitializeMint,
    token::{mint_to},
    // associated_token,
    associated_token::AssociatedToken,
};

declare_id!("HJdj8WvCMvSexuQ3Fzrp8P9qwHP1UchrZQbTefgg3ge4");

#[account]
#[derive(InitSpace)]
pub struct BlockNumberAccount {
    pub block_number: u64,
}

// #[account]
// #[derive(InitSpace)]
// pub struct InitMintAccount {
//     pub block_number: u64,
// }

#[derive(Accounts)]
pub struct StoreBlockNumber<'info> {
    #[account(init, payer = user, space = 8 + BlockNumberAccount::INIT_SPACE)]
    pub block_number_account: Account<'info, BlockNumberAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitTokenMint<'info> {
    // #[account(init, payer = admin, space = 8 + InitMintAccount::INIT_SPACE)]
    // pub pow: Account<'info, InitMintAccount>,
    #[account(mut)]
    pub admin: Signer<'info>,
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
    // #[account(mut)]
    // pub mint_token: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"mint"], bump)]
    pub mint_account: Account<'info, Mint>,
    // #[account(mut)]
    // pub mint_token: Signer<'info>,
    // #[account(mut)]
    // pub token_account:AccountInfo<'info>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint_account,
        associated_token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
#[instruction(_address: String)]
pub struct StoreXnPoints<'info> {
    #[account(mut, seeds = [_address.as_bytes().as_ref()], bump,)]
    pub candidate: Account<'info, XnRecord>,
}

#[account]
#[derive(InitSpace)]
pub struct XnRecord {
    pub points: u8,
}

#[program]
pub mod sol_xen {
    use super::*;

    pub fn test(ctx: Context<InitTokenMint>) -> ProgramResult {
        print!("{:?}", ctx.accounts.token_program.to_account_info());
        Ok(())
    }

    pub fn create_mint(ctx: Context<InitTokenMint>) -> ProgramResult {
        let signer_seeds: &[&[&[u8]]] = &[&[b"mint", &[ctx.bumps.mint_account]]];

        // create Mint Account
        /*
        create_account(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                CreateAccount {
                    from: ctx.accounts.admin.to_account_info(),
                    to: ctx.accounts.mint_account.to_account_info(),
                },
            ).with_signer(signer_seeds),
            10_000_000,
            82,
            ctx.accounts.token_program.key,
        )?;
        */    
        // Init mint to Mint Account
        /*
        initialize_mint(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                InitializeMint{
                    mint:ctx.accounts.mint_account.to_account_info(),
                    rent:ctx.accounts.rent.to_account_info()
                }),
            10,
            ctx.accounts.admin.key,
            Some(ctx.accounts.admin.key)
        )?;
        */
        // let space = ctx.accounts.token_account.data_len();
        // let lamports = (Rent::get()?).minimum_balance(space);

        Ok(())
    }

    pub fn mint_tokens(ctx: Context<MintTokens>) -> ProgramResult {
        /*
        associated_token::create(
            CpiContext::new(
                ctx.accounts.associate_token_program.to_account_info(),
                associated_token::Create {
                    payer: ctx.accounts.user.to_account_info(),
                    associated_token: ctx.accounts.token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                    mint: ctx.accounts.mint_account.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info()
                }
            )
        )?;
         */

        // PDA signer seeds
        let signer_seeds: &[&[&[u8]]] = &[&[b"mint", &[ctx.bumps.mint_account]]];

        mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                MintTo{
                    mint: ctx.accounts.mint_account.to_account_info(),
                    authority: ctx.accounts.mint_account.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info()
                }
            ).with_signer(signer_seeds), // using PDA to sign
            1_000_000_000
        )?;

        Ok(())
    }

    pub fn store_block_number(ctx: Context<StoreBlockNumber>) -> ProgramResult {
        let block_number = Clock::get()?.slot;
        let account = &mut ctx.accounts.block_number_account;
        account.block_number = block_number;

        Ok(())
    }
}

