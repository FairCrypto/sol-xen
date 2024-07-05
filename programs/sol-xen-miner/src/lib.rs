use anchor_lang::{
    prelude::*,
};
use sha3::{Digest, Keccak256};
use ethaddr::Address;

declare_id!("3Giiqno6EobSBbcaVwMJCuf78Fy6smFJfV2PAaborDaX");

const MAX_HASHES: u8 = 72;
const HASH_PATTERN: &str = "420";
const SUPERHASH_PATTERN: &str = "42069";
const SUPERHASH_X: u16 = 250;
const AMP_START: u16 = 300;
const AMP_CYCLE_SLOTS: u64 = 100_000;

const START_SLOT: u64 = 0;

// TODO: lock to a specifig admin key
// const ADMIN_KEY: &str = "somesecretadminkey";

#[program]
pub mod sol_xen_miner {
    use super::*;

    pub fn init_miner(ctx: Context<InitMiner>, kind: u8) -> Result<()> {

        msg!("Global last slot check: {}", ctx.accounts.global_xn_record.last_amp_slot);
        require!(ctx.accounts.global_xn_record.last_amp_slot == 0, SolXenError::MintIsAlreadyActive);
        require!(kind < 4, SolXenError::InvalidMinerKind);

        // initialize global state
        ctx.accounts.global_xn_record.kind = kind;
        ctx.accounts.global_xn_record.amp = AMP_START;
        ctx.accounts.global_xn_record.last_amp_slot = Clock::get().unwrap().slot;
        ctx.accounts.global_xn_record.nonce = ctx.accounts.admin.key.to_bytes()[0..4].try_into().unwrap();

        Ok(())
    }

    pub fn mine_hashes(ctx: Context<MineHashes>, eth_account: EthAccount, _kind: u8) -> Result<()> {

        // recover check-summed address from string and validate it
        let maybe_eth_address = Address::from_str_checksum(&eth_account.address_str);
        require!(maybe_eth_address.is_ok(), SolXenError::InvalidEthAddressChecksum);
        require!(maybe_eth_address.unwrap().as_slice()[0..20] == eth_account.address.as_slice()[0..20], SolXenError::InvalidEthAddressData);

        // Get the current slot number
        let slot = Clock::get().unwrap().slot;
        require!(slot > START_SLOT, SolXenError::MintIsNotActive);

        print!("Using slot #{}", slot);

        require!(slot > 0, SolXenError::ZeroSlotValue);

        // update global AMP state if required
        if slot > ctx.accounts.global_xn_record.last_amp_slot
            && slot - ctx.accounts.global_xn_record.last_amp_slot > AMP_CYCLE_SLOTS
            && ctx.accounts.global_xn_record.amp > 0
        {
            ctx.accounts.global_xn_record.amp -= 1;
            ctx.accounts.global_xn_record.last_amp_slot = slot;
        }

        // Find hashes
        let nonce = ctx.accounts.global_xn_record.nonce;
        let (hashes, superhashes) = find_hashes(slot, nonce);

        // Calculate points convertible to solXEN tokens
        let points = 1_000_000_000 * (ctx.accounts.global_xn_record.amp as u64) * (hashes as u64)
            + 1_000_000_000 * (ctx.accounts.global_xn_record.amp as u64) * (SUPERHASH_X as u64) * (superhashes as u64);
        print!("Mined hashes {} superhashes {} points {} nonce {:?}", hashes, superhashes, points, nonce);

        // Update user scores by eth address
        ctx.accounts.xn_by_eth.hashes += hashes as u64;
        ctx.accounts.xn_by_eth.superhashes += superhashes as u32;

        // Update user scores by sol address
        ctx.accounts.xn_by_sol.hashes += hashes as u64;
        ctx.accounts.xn_by_sol.superhashes += superhashes as u32;
        ctx.accounts.xn_by_sol.points += points as u128;

        // Update miner's scores accumulators
        ctx.accounts.global_xn_record.hashes += hashes as u64;
        ctx.accounts.global_xn_record.superhashes += superhashes as u32;
        ctx.accounts.global_xn_record.points += points as u128;

        // calculate and store new nonce
        let mut hasher = Keccak256::new();
        hasher.update(ctx.accounts.user.key.to_bytes());
        hasher.update(hashes.to_le_bytes());
        hasher.update(superhashes.to_le_bytes());
        hasher.update(slot.to_le_bytes());
        let nonce = hasher.finalize();
        ctx.accounts.global_xn_record.nonce = nonce[0..4].try_into().unwrap();

        // Emit hash tx record
        emit!(HashEvent {
            slot,
            user: *ctx.accounts.user.key,
            eth_account: eth_account.address,
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
#[instruction(kind: u8)]
pub struct InitMiner<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init_if_needed,
        space = 8 + GlobalXnRecord::INIT_SPACE,
        seeds = [b"xn-miner-global", kind.to_be_bytes().as_slice()],
        bump,
        payer = admin,
    )]
    pub global_xn_record: Box<Account<'info, GlobalXnRecord>>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(eth_account: EthAccount, kind: u8)]
pub struct MineHashes<'info> {
    #[account(
        mut,
        seeds = [b"xn-miner-global", kind.to_be_bytes().as_slice()],
        bump,
    )]
    pub global_xn_record: Box<Account<'info, GlobalXnRecord>>,
    #[account(
        init_if_needed,
        space = 8 + UserEthXnRecord::INIT_SPACE,
        payer = user,
        seeds = [
            b"xn-by-eth",
            eth_account.address.as_ref(),
            kind.to_be_bytes().as_slice(),
            ID.as_ref(),
        ],
        bump
    )]
    pub xn_by_eth: Box<Account<'info, UserEthXnRecord>>,
    #[account(
        init_if_needed,
        space = 8 + UserSolXnRecord::INIT_SPACE,
        payer = user,
        seeds = [
            b"xn-by-sol",
            user.key().as_ref(),
            kind.to_be_bytes().as_slice(),
            ID.as_ref(),
        ],
        bump
    )]
    pub xn_by_sol: Box<Account<'info, UserSolXnRecord>>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
    // pub rent: Sysvar<'info, Rent>,
}

#[account]
#[derive(InitSpace,Debug)]
pub struct UserEthXnRecord {
    pub hashes: u64,
    pub superhashes: u32,
}

#[account]
#[derive(InitSpace,Debug)]
pub struct UserSolXnRecord {
    pub hashes: u64,
    pub superhashes: u32,
    pub points: u128
}

#[account]
#[derive(InitSpace,Debug)]
pub struct GlobalXnRecord {
    pub amp: u16,
    pub last_amp_slot: u64,
    pub nonce: [u8; 4],
    pub kind: u8,
    pub hashes: u64,
    pub superhashes: u32,
    pub points: u128
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
    if superhashes == 0 && hashes == 0 {
        msg!("Found zero targets in hashes after {} iterations", MAX_HASHES);
    }
    return (hashes, superhashes);
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct EthAccount {
    pub address: [u8; 20],
    pub address_str: String,
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
    ZeroSlotValue,
    #[msg("Invalid miner kind")]
    InvalidMinerKind,
    #[msg("Invalid Ethereum address checksum")]
    InvalidEthAddressChecksum,
    #[msg("Ethereum address data doesnt match")]
    InvalidEthAddressData,
}
