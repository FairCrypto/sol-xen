use std::collections::HashMap;
use std::mem::size_of;
use std::ops::Sub;
use solana_client::rpc_client::RpcClient;
use solana_client::pubsub_client::{PubsubClient, SlotsSubscription};
use solana_sdk::hash::{hash};
use solana_sdk::{
    system_program,
    pubkey::Pubkey,
    signature::{Signer, read_keypair_file},
    transaction::Transaction,
    instruction::{Instruction, AccountMeta},
    compute_budget::ComputeBudgetInstruction,
};
use spl_token;
use spl_associated_token_account::get_associated_token_address_with_program_id;
use clap::{Parser};
use std::process;
use std::sync::mpsc;
use borsh::{BorshSerialize, BorshDeserialize, to_vec, BorshSchema};
use ethaddr::Address;
use colored::*;
use dotenv::dotenv;
use std::thread;
use std::time::Duration;
use solana_sdk::clock::Slot;
use solana_sdk::signature::Keypair;

const MINERS: &str = "H4Nk2SDQncEv5Cc6GAbradB4WLrHn7pi9VByFL9zYZcA,\
                      58UESDt7K7GqutuHBYRuskSgX6XoFe8HXjwrAtyeDULM,\
                      B1Dw79PE8dzpHPKjiQ8HYUBZ995hL1U32bUTRdNVtRbr,\
                      7ukQWD7UqoC61eATrBMrdfMrJMUuY1wuPTk4m4noZpsH";

const MINTER: &str = "8HTvrqZT1JP279DMLT5SfNfGHxUeznem4Bh7zy92sWWx";

const MAX_MINERS: u8 = 4;

#[derive(BorshSerialize, Debug)]
pub struct EthAccount {
    pub address: [u8; 20],
    pub address_str: String
}

#[derive(BorshSerialize, Debug)]
pub struct MineHashes {
    pub eth_account: EthAccount,
    pub _kind: u8,
}

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    // #[arg(short, long, default_value_t = String::from("mine"))]
    // command: String,
    #[arg(long)]
    address: String,
    #[arg(short, long, default_value_t = 0)]
    kind: u8,
    #[arg(short, long, default_value_t = 1)]
    fee: u64,
    #[arg(short, long, default_value_t = 1_400_000)]
    units: u32,
    #[arg(short, long, default_value_t = 1)]
    runs: u32,
    #[arg(short, long, default_value_t = 0.5)]
    delay: f32,
    #[arg(short, long, default_value_t = 1_000)]
    automint: u32,
    #[arg(short, long)]
    wallet_path: Option<String>,
}

#[derive(BorshSerialize, BorshDeserialize, BorshSchema, Clone)]
pub struct GlobalXnRecord {
    pub amp: u16,
    pub last_amp_slot: u64,
    pub nonce: [u8; 4],
    pub kind: u8,
    pub hashes: u64,
    pub superhashes: u32,
    pub points: u128
} // 38 <> 48

#[derive(BorshSerialize, BorshDeserialize, BorshSchema, Clone)]
pub struct BoxedGlobalXnRecord {
    pub data: Box<GlobalXnRecord>
}

#[derive(BorshSerialize, BorshDeserialize, BorshSchema)]
pub struct UserEthXnRecord {
    pub hashes: u64,  // 8
    pub superhashes: u32, // 4
} // 16 == 16

#[derive(BorshSerialize, BorshDeserialize, BorshSchema)]
pub struct UserSolXnRecord {
    pub hashes: u64, // 8
    pub superhashes: u32, // 4
    pub points: u128, // 16
} // 28

#[derive(BorshSerialize, BorshDeserialize, BorshSchema)]
pub struct UserTokensRecord {
    pub points_counters: [u128; 4], // 4 * 16 = 64
    pub tokens_minted: u128 // 16
} // 80

pub struct MineParams {
    ethereum_address: String,
    address: [u8; 20],
    priority_fee: u64,
    runs: u32,
    kind: u8,
    delay: f32,
    units: u32,
}

impl From<MineParams> for (String, [u8; 20], u64, u32, u8, f32, u32) {
    fn from(x: MineParams) -> (String, [u8; 20], u64, u32, u8, f32, u32) {
        let MineParams { ethereum_address, address, priority_fee, runs, kind, delay, units } = x;
        (ethereum_address, address, priority_fee, runs, kind, delay, units)
    }
}

pub struct MintParams {
    slot: u64,
    priority_fee: u64,
    kind: u8,
    automint: u32,
}

impl From<MintParams> for (u64, u64, u8, u32) {
    fn from(x: MintParams) -> (u64, u64, u8, u32) {
        let MintParams { slot, priority_fee, kind, automint } = x;
        (slot, priority_fee, kind, automint)
    }
}

fn main() {
    dotenv().ok(); // This line loads the environment variables from the ".env" file.

    let args = Args::parse();
    let priority_fee: u64 = args.fee;
    let ethereum_address: String = args.address;
    let runs = args.runs;
    // let kind = args.kind;
    let delay = args.delay;
    let units = args.units;
    let keypair_path = args.wallet_path
        .or(std::env::var("USER_WALLET_PATH").ok())
        .expect("Either set USER_WALLET_PATH env var, or pass it as -w command line param");
    // let command = &args.command[..];
    let automint = args.automint;

    // Use ethaddr to parse and validate the Ethereum address with checksum
    let _address = match Address::from_str_checksum(&ethereum_address) {
        Ok(addr) => addr,
        Err(_) => {
            eprintln!("Invalid checksummed Ethereum address: {}", ethereum_address);
            process::exit(1);
        }
    };

    let url = std::env::var("ANCHOR_PROVIDER_URL")
        .expect("ANCHOR_PROVIDER_URL must be set.");
    let ws_url_ =  str::replace(url.as_str(), "http", "ws");
    let ws_url =  str::replace(ws_url_.as_str(), "8899", "8900");

    let (tx, rx) = mpsc::channel::<String>();
    let mut wallets: HashMap<u8, Keypair> = HashMap::new();
    let tx_clone = tx.clone();
    for kind in 0..MAX_MINERS {
        let keypair_path_norm = if keypair_path.ends_with("/")
        { keypair_path.clone() } else { keypair_path.clone() + "/" };
        let keypair_fn = format!("{keypair_path_norm}id{kind}.json");
        let _ = match read_keypair_file(&keypair_fn) {
            Ok(keypair) => {
                // wallets.insert(kind, keypair.insecure_clone());
                let a = ethereum_address.clone();
                let txc = tx_clone.clone();
                let keypair_clone = keypair.insecure_clone();
                let h = thread::spawn(move || {
                    do_mine(
                        keypair,
                        MineParams {
                            ethereum_address: a,
                            address: *_address,
                            priority_fee,
                            runs,
                            kind,
                            delay,
                            units
                        },
                        txc)
                });
                // h.join().unwrap();
                if automint > 0 {
                    let tx_clone1 = tx.clone();
                    let ws = ws_url.clone();
                    let h = thread::spawn(move || {
                        let mut last_slot: Slot = 0;
                        let _ = match PubsubClient::slot_subscribe(ws.as_str()) {
                            Ok(subs) => {
                                for slot in subs.1 {
                                    let txcm = tx_clone1.clone();
                                    let kpm = keypair_clone.insecure_clone();
                                    if slot.slot.sub(last_slot).ge(&(automint as u64)) {
                                        last_slot = slot.slot;
                                        do_mint(
                                            kpm,
                                            MintParams {
                                                slot: slot.slot,
                                                priority_fee,
                                                kind,
                                                automint
                                            },
                                            txcm
                                        )
                                    }
                                }
                            }
                            Err(e) => { println!("{:?}", e) }
                        };
                    });
                }
            },
            _ => ()
        };
    }

    let runs_str = if runs == 0 { "auto".green() } else { runs.to_string().green() };
    println!(
        "Running solXEN MultiMiner: wallets={}, runs={}, delay={}, automint={}",
        wallets.len().to_string().green(),
        runs_str,
        delay.to_string().green(),
        automint.to_string().green(),
    );
    println!(
        "Running on RPC={}, fee={}, units={}",
        url.green(),
        priority_fee.to_string().green(),
        units.to_string().green(),
    );

    for msg in rx {
        println!("{msg}")
    }
}

fn mint(kind: u8, ethereum_address: String, keypair: Keypair, tx: mpsc::Sender<String>) {
    tx.send(ethereum_address).unwrap();
    tx.send(keypair.to_base58_string()).unwrap()
}

const R: &str = "\x1b[0;31m";
const B: &str = "\x1b[0;34m";
const U: &str = "\x1b[0;39m";

// Earn (mine) points by looking for hash patterns in randomized numbers
fn do_mine(payer: Keypair, params: MineParams, tx: mpsc::Sender<String>) {
    let (
        ethereum_address,
        address,
        priority_fee,
        runs,
        kind,
        delay,
        units,
    ) = params.into();
    let url = std::env::var("ANCHOR_PROVIDER_URL").expect("ANCHOR_PROVIDER_URL must be set.");

    let miners_program_ids_str= std::env::var("MINERS").unwrap_or(String::from(MINERS));
    let miners = miners_program_ids_str.split(',').collect::<Vec<&str>>();
    assert_eq!(miners.len(), MAX_MINERS as usize, "Bad miners set");

    let program_id = Pubkey::try_from(miners[kind as usize]).expect("Bad program ID");

    tx.send(format!("{B}[{}]{U} Miner Program ID={}", kind.to_string(), program_id.to_string().green())).unwrap();

    let client = RpcClient::new(url);

    tx.send(format!(
        "{B}[{}]{U} Using user wallet={}, account={}",
        kind.to_string(),
        payer.pubkey().to_string().green(),
        ethereum_address.green(),
    )).unwrap();

    let (global_xn_record_pda, _global_bump) = Pubkey::find_program_address(
        &[b"xn-miner-global", kind.to_be_bytes().as_slice()],
        &program_id
    );
    // tx.send(format!("Global XN PDA: {}", global_xn_record_pda.to_string().green())).unwrap();

    let (user_eth_xn_record_pda, _user_eth_bump) = Pubkey::find_program_address(
        &[
            b"xn-by-eth",
            &address.as_slice(),
            kind.to_be_bytes().as_slice(),
            program_id.as_ref()
        ],
        &program_id
    );
    // tx.send(format!("User Eth PDA: {}", user_eth_xn_record_pda.to_string().green())).unwrap();

    let (user_sol_xn_record_pda, _user_sol_bump) = Pubkey::find_program_address(
        &[
            b"xn-by-sol",
            &payer.pubkey().to_bytes(),
            kind.to_be_bytes().as_slice(),
            program_id.as_ref()
        ],
        &program_id
    );
    // tx.send(format!("User Sol PDA: {}", user_sol_xn_record_pda.to_string().green())).unwrap();

    let method_name_data = "global:mine_hashes";
    let digest = hash(method_name_data.as_bytes());
    let ix_data  = &digest.to_bytes()[0..8];

    let mut _run = 0;
    while runs == 0 || _run < runs  {
        _run += 1;
        let address_str = ethereum_address.clone();

        let mint_hashes = MineHashes {
            eth_account: EthAccount {
                address,
                address_str
            },
            _kind: kind
        };

        let instruction = Instruction {
            program_id,
            data: [ix_data, to_vec(&mint_hashes).unwrap().as_slice()].concat().to_vec(),
            accounts: vec![
                AccountMeta::new(global_xn_record_pda, false),
                AccountMeta::new(user_eth_xn_record_pda, false),
                AccountMeta::new(user_sol_xn_record_pda, false),
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new_readonly(system_program::ID, false),
            ]
        };

        let compute_budget_instruction_limit = ComputeBudgetInstruction::set_compute_unit_limit(units);
        let compute_budget_instruction_price = ComputeBudgetInstruction::set_compute_unit_price(priority_fee);

        let transaction = Transaction::new_signed_with_payer(
            &[
                compute_budget_instruction_limit,
                compute_budget_instruction_price,
                instruction
            ],
            Some(&payer.pubkey()),
            &[&payer],
            client.get_latest_blockhash().unwrap(),
        );

        let result = client.send_transaction(&transaction);
        match result {
            Ok(signature) => {
                let maybe_user_account_data_raw = client.get_account_data(&user_eth_xn_record_pda);
                match maybe_user_account_data_raw {
                    Ok(user_account_data_raw) => {
                        let user_data: [u8; size_of::<UserEthXnRecord>() - 4] = user_account_data_raw.as_slice()[8..20].try_into().unwrap();
                        let user_state = UserEthXnRecord::try_from_slice(user_data.as_ref()).unwrap();

                        let maybe_user_sol_account_data_raw = client.get_account_data(&user_sol_xn_record_pda);
                        match maybe_user_sol_account_data_raw {
                            Ok(user_sol_account_data_raw) => {
                                // 36 32 28
                                // println!("{} {}", user_sol_account_data_raw.len(), size_of::<UserSolXnRecord>());
                                let user_sol_data: [u8; size_of::<UserSolXnRecord>() - 4] = user_sol_account_data_raw.as_slice()[8..].try_into().unwrap();
                                let user_sol_state = UserSolXnRecord::try_from_slice(user_sol_data.as_ref()).unwrap();
                                tx.send(format!(
                                    "{B}[{}]{U} Tx={}, hashes={}, superhashes={}, points={}",
                                    kind.to_string(),
                                    signature.to_string().yellow(),
                                    user_state.hashes.to_string().yellow(),
                                    user_state.superhashes.to_string().yellow(),
                                    (user_sol_state.points / 1_000_000_000).to_string().yellow(),
                                )).unwrap();
                                thread::sleep(Duration::from_secs_f32(delay));
                            }
                            Err(_) => tx.send(format!("Account data not yet ready; skipping")).unwrap()
                        }

                    }
                    Err(_) => tx.send(format!("Account data not yet ready; skipping")).unwrap()
                }
            },
            Err(err) => tx.send(format!("Failed: {:?}", err)).unwrap(),
        };
    }
}

// Mint tokens based on provided evidence of mining points
fn do_mint(payer: Keypair, params: MintParams, tx: mpsc::Sender<String>) {
    let (slot, priority_fee, kind, automint) = params.into();
    let url = std::env::var("ANCHOR_PROVIDER_URL").expect("ANCHOR_PROVIDER_URL must be set.");

    let program_id_minter_str = std::env::var("PROGRAM_ID_MINTER").unwrap_or(String::from(MINTER));
    let program_id_minter = Pubkey::try_from(program_id_minter_str.as_str()).expect("Bad program ID");

    let miners_program_ids_str= std::env::var("MINERS").unwrap_or(String::from(MINERS));
    let miners = miners_program_ids_str.split(',').collect::<Vec<&str>>();
    assert_eq!(miners.len(), MAX_MINERS as usize, "Bad miners set");

    let program_id_miner = Pubkey::try_from(miners[kind as usize]).expect("Bad program ID");

    // println!("Test{:?}", kind.to_be_bytes().as_slice());
    // tx.send(format!(
    //     "{R}[{}]{U} Minter Program ID={}",
    //     kind.to_string(),
    //     program_id_minter.to_string().green())
    // ).unwrap();

    let client = RpcClient::new(url);

    // println!("Using user wallet={}, fee={}", payer.pubkey().to_string().green(), priority_fee.to_string().green(), );

    let (user_sol_xn_record_pda, _user_bump) = Pubkey::find_program_address(
        &[
            b"xn-by-sol",
            &payer.pubkey().to_bytes(),
            kind.to_be_bytes().as_slice(),
            &program_id_miner.to_bytes()
        ],
        &program_id_miner
    );
    // println!("User record PDA={} bump={}", user_sol_xn_record_pda.to_string().green(), _user_bump.to_string());

    let (user_token_record_pda, _user_rec_bump) = Pubkey::find_program_address(
        &[
            b"sol-xen-minted",
            &payer.pubkey().to_bytes(),
        ],
        &program_id_minter
    );
    // println!("User token record PDA={} bump={}", user_token_record_pda.to_string().green(), _user_rec_bump.to_string());

    let (mint_pda, _mint_bump) = Pubkey::find_program_address(
        &[b"mint"],
        &program_id_minter
    );
    // println!("Mint PDA={}", mint_pda.to_string().green());

    let associate_token_program = Pubkey::try_from("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL").unwrap();

    let user_token_account = get_associated_token_address_with_program_id(
        &payer.pubkey(),
        &mint_pda,
        &spl_token::ID
    );

    let method_name_data = "global:mint_tokens";
    let digest = hash(method_name_data.as_bytes());
    let ix_data = &digest.to_bytes()[0..8];

    let instruction = Instruction {
        program_id: program_id_minter,
        data: [
            ix_data,
            kind.to_be_bytes().as_slice()
        ].concat().to_vec(),
        accounts: vec![
            AccountMeta::new_readonly(user_sol_xn_record_pda, false),
            AccountMeta::new(user_token_record_pda, false),
            AccountMeta::new(user_token_account, false),
            AccountMeta::new_readonly(payer.pubkey(), true),
            AccountMeta::new(mint_pda, false),
            AccountMeta::new_readonly(spl_token::ID, false),
            AccountMeta::new_readonly(system_program::ID, false),
            AccountMeta::new_readonly(associate_token_program, false),
            AccountMeta::new_readonly(program_id_miner, false)
        ]
    };

    let compute_budget_instruction_price = ComputeBudgetInstruction::set_compute_unit_price(priority_fee);

    let transaction = Transaction::new_signed_with_payer(
        &[
            // compute_budget_instruction_limit,
            compute_budget_instruction_price,
            instruction.clone()
        ],
        Some(&payer.pubkey()),
        &[&payer],
        client.get_latest_blockhash().unwrap(),
    );

    let result = client.send_and_confirm_transaction(&transaction);

    match result {
        Ok(signature) => {
            let maybe_user_account_data_raw = client.get_account_data(&user_sol_xn_record_pda);
            match maybe_user_account_data_raw {
                Ok(user_account_data_raw) => {
                    // 36 32 28
                    // println!("{} {}", user_account_data_raw.len(), size_of::<UserSolXnRecord>());
                    let user_data: [u8; size_of::<UserSolXnRecord>() - 4] = user_account_data_raw.as_slice()[8..36].try_into().unwrap();
                    let user_state = UserSolXnRecord::try_from_slice(user_data.as_ref()).unwrap();
                    tx.send(format!(
                        "{R}[{}]{U} Mint Tx={}, hashes={}, superhashes={}, points={}",
                        kind.to_string(),
                        signature.to_string().yellow(),
                        user_state.hashes.to_string().yellow(),
                        user_state.superhashes.to_string().yellow(),
                        user_state.points.to_string().yellow(),
                    )).unwrap()
                }
                Err(_) => tx.send(format!(
                    "{R}[{}]{U} Account data not yet ready; skipping",
                    kind.to_string()
                )).unwrap()
            }
            let maybe_user_balance_data_raw = client.get_account_data(&user_token_record_pda);
            match maybe_user_balance_data_raw {
                Ok(user_balance_data_raw) => {
                    // 88 80
                    // println!("{} {}", user_balance_data_raw.len(), size_of::<UserTokensRecord>());
                    // console.log(`
                    // User balance @slot=${Y}${currentSlot}${U}:
                    // points=${G}${counters}${U},
                    // tokens=${G}${userTokensRecord.tokensMinted.div(decimals).toNumber()}${U}${deltaStr}.
                    // Total supply=${G}${totalSupply.value.uiAmount}${U}`)
                    let user_data: [u8; size_of::<UserTokensRecord>()] = user_balance_data_raw.as_slice()[8..].try_into().unwrap();
                    let user_state = UserTokensRecord::try_from_slice(user_data.as_ref()).unwrap();
                    tx.send(format!(
                        "{R}[{}]{U} Points={:?} Tokens={}",
                        kind.to_string(),
                        user_state.points_counters,
                        user_state.tokens_minted,
                    )).unwrap()
                }
                Err(_) => tx.send(format!("Account data not yet ready; skipping")).unwrap()
            }
        },
        Err(_err) => tx.send(format!(
            "{R}[{}]{U} Unable to confirm Mint tx due to timeout",
            kind.to_string()
        )).unwrap(),
    };

}
