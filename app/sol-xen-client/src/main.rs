use std::mem::size_of;
use solana_client::rpc_client::RpcClient;
use solana_sdk::hash::{hash};
use solana_sdk::{
    sysvar::{rent},
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
use borsh::{BorshSerialize, BorshDeserialize, to_vec, BorshSchema};
use ethaddr::Address;
use colored::*;
use dotenv::dotenv;
// use std::thread;
// use std::time::Duration;

#[derive(BorshSerialize, Debug)]
pub struct EthAccount {
    pub address: [u8; 20],
}

#[derive(BorshSerialize, Debug)]
pub struct MineHashes {
    pub _eth_account: EthAccount,
    pub _kind: u8,
}

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    #[arg(short, long, default_value_t = String::from("mine"))]
    command: String,
    #[arg(short, long)]
    address: String,
    #[arg(short, long, default_value_t = 0)]
    kind: u8,
    #[arg(short, long, default_value_t = 1)]
    fee: u64,
    #[arg(short, long, default_value_t = 1_400_000)]
    units: u64,
    #[arg(short, long, default_value_t = 1)]
    runs: u16,
}

#[derive(BorshSerialize, BorshDeserialize, BorshSchema, Clone)]
pub struct GlobalXnRecord {
    pub amp: u16, // 2 
    pub last_amp_slot: u64, // 8
    pub points: u128, // 16
    pub hashes: u32, // 4
    pub superhashes: u32, // 4
    pub txs: u32 // 4
} // 38 <> 48

#[derive(BorshSerialize, BorshDeserialize, BorshSchema, Clone)]
pub struct BoxedGlobalXnRecord {
    pub data: Box<GlobalXnRecord>
}

#[derive(BorshSerialize, BorshDeserialize, BorshSchema)]
pub struct UserEthXnRecord {
    pub hashes: u64,
    pub superhashes: u32,
} // 16 == 16

#[derive(BorshSerialize, BorshDeserialize, BorshSchema)]
pub struct UserSolXnRecord {
    pub hashes: u64,
    pub superhashes: u32,
    pub points: u128, // 16
} // 16 == 16

fn main() {
    dotenv().ok(); // This line loads the environment variables from the ".env" file.

    let args = Args::parse();
    let priority_fee: u64 = args.fee;
    let ethereum_address: String = args.address;
    let runs = args.runs;
    let kind = args.kind;
    let command = &args.command[..];

    // Use ethaddr to parse and validate the Ethereum address with checksum
    let _address = match Address::from_str_checksum(&ethereum_address) {
        Ok(addr) => addr,
        Err(_) => {
            eprintln!("Invalid checksummed Ethereum address: {}", ethereum_address);
            process::exit(1);
        }
    };

    println!("Command: {}", command);
    match command {
        "mine" => do_mine(ethereum_address, _address.0, priority_fee, runs, kind),
        "mint" => do_mint(priority_fee, kind),
        _ => {}
    }
    ;
}

// Earn (mine) points by looking for hash patterns in randomized numbers
fn do_mine(ethereum_address: String, address: [u8; 20], priority_fee: u64, runs: u16, kind: u8) {
    let keypair_path = std::env::var("USER_WALLET").expect("USER_WALLET must be set.");
    let url = std::env::var("ANCHOR_PROVIDER_URL").expect("ANCHOR_PROVIDER_URL must be set.");
    let program_id_str = std::env::var("PROGRAM_ID_MINER").expect("PROGRAM_ID must be set.");
    let program_id = Pubkey::try_from(program_id_str.as_str()).expect("Bad program ID");

    println!("Miner Program ID={} kind={}", program_id.to_string().green(), kind.to_string().green());

    let client = RpcClient::new(url);
    println!("Running on: {}", client.url().green());
    let payer = read_keypair_file(&keypair_path).expect("Failed to read keypair file");

    println!(
        "Using user wallet={}, account={}, fee={}, runs={}",
        payer.pubkey().to_string().green(),
        ethereum_address.green(),
        priority_fee.to_string().green(),
        runs.to_string().green()
    );
    
    let (global_xn_record_pda, _global_bump) = Pubkey::find_program_address(
        &[b"xn-miner-global", kind.to_be_bytes().as_slice()],
        &program_id
    );
    println!("Global XN PDA: {}", global_xn_record_pda.to_string().green());

    let (user_eth_xn_record_pda, _user_eth_bump) = Pubkey::find_program_address(
        &[
            b"xn-by-eth",
            &address.as_slice(),
            kind.to_be_bytes().as_slice(),
            program_id.as_ref()
        ],
        &program_id
    );
    println!("User Eth PDA: {}", user_eth_xn_record_pda.to_string().green());

    let (user_sol_xn_record_pda, _user_sol_bump) = Pubkey::find_program_address(
        &[
            b"xn-by-sol",
            &payer.pubkey().to_bytes(),
            kind.to_be_bytes().as_slice(),
            program_id.as_ref()
        ],
        &program_id
    );
    println!("User Sol PDA: {}", user_sol_xn_record_pda.to_string().green());
    
    /*
    let global_data_raw = client.get_account_data(&global_xn_record_pda).unwrap();
    let global_data: [u8; size_of::<GlobalXnRecord>() - 10] = global_data_raw.as_slice()[8..46].try_into().unwrap();
    let global_state = GlobalXnRecord::try_from_slice(global_data.as_ref()).unwrap();
    println!(
        "Global State: txs={}, hashes={}, superhashes={}, amp={}",
        global_state.txs.to_string().green(),
        global_state.hashes.to_string().green(),
        global_state.superhashes.to_string().green(),
        global_state.amp.to_string().green()
    );
     */

    let method_name_data = "global:mine_hashes";
    let digest = hash(method_name_data.as_bytes());
    let ix_data  = &digest.to_bytes()[0..8];

    for _run in 0..runs {

        let mint_hashes = MineHashes {
            _eth_account: EthAccount {
                address
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

        let compute_budget_instruction_limit = ComputeBudgetInstruction::set_compute_unit_limit(1_400_000);
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

        let result = client.send_and_confirm_transaction(&transaction);
        match result {
            Ok(signature) => {
                let maybe_user_account_data_raw = client.get_account_data(&user_eth_xn_record_pda);
                match maybe_user_account_data_raw {
                    Ok(user_account_data_raw) => {
                        let user_data: [u8; size_of::<UserEthXnRecord>() - 4] = user_account_data_raw.as_slice()[8..20].try_into().unwrap();
                        let user_state = UserEthXnRecord::try_from_slice(user_data.as_ref()).unwrap();
                        println!(
                            "Tx={}, hashes={}, superhashes={}",
                            signature.to_string().yellow(),
                            (user_state.hashes).to_string().yellow(),
                            (user_state.superhashes).to_string().yellow(),
                            // (user_state.points / 1_000_000_000).to_string().yellow(),
                        )
                    }
                    Err(_) => println!("Account data not yet ready; skipping")
                }
            },
            Err(err) => println!("Failed: {:?}", err),
        };
        // thread::sleep(Duration::from_secs(5));
    }
}

// Mint tokens based on provided evidence of mining points
fn do_mint(priority_fee: u64, kind: u8) {
    let keypair_path = std::env::var("USER_WALLET").expect("USER_WALLET must be set.");
    let url = std::env::var("ANCHOR_PROVIDER_URL").expect("ANCHOR_PROVIDER_URL must be set.");
    let program_id_miner_str = std::env::var("PROGRAM_ID_MINER").expect("PROGRAM_ID must be set.");
    let program_id_miner = Pubkey::try_from(program_id_miner_str.as_str()).expect("Bad program ID");
    let program_id_minter_str = std::env::var("PROGRAM_ID_MINTER").expect("PROGRAM_ID must be set.");
    let program_id_minter = Pubkey::try_from(program_id_minter_str.as_str()).expect("Bad program ID");

    println!("Program ID={}", program_id_minter.to_string().green());
    println!("Miner Program ID={}", program_id_miner.to_string().green());

    let client = RpcClient::new(url);
    println!("Running on: {}", client.url().green());
    let payer = read_keypair_file(&keypair_path).expect("Failed to read keypair file");

    println!("Using user wallet={}, fee={}", payer.pubkey().to_string().green(), priority_fee.to_string().green(), );

    let (user_sol_xn_record_pda, _user_bump) = Pubkey::find_program_address(
        &[
            b"xn-by-sol",
            &payer.pubkey().to_bytes(),
            kind.to_be_bytes().as_slice(),
            &program_id_miner.to_bytes()
        ],
        &program_id_miner
    );
    println!("User record PDA={} bump={}", user_sol_xn_record_pda.to_string().green(), _user_bump.to_string());

    let (user_token_record_pda, _user_rec_bump) = Pubkey::find_program_address(
        &[
            b"sol-xen-minted",
            &payer.pubkey().to_bytes(),
        ],
        &program_id_minter
    );
    println!("User token record PDA={} bump={}", user_token_record_pda.to_string().green(), _user_rec_bump.to_string());

    let (mint_pda, _mint_bump) = Pubkey::find_program_address(
        &[b"mint"],
        &program_id_minter
    );
    println!("Mint PDA={}", mint_pda.to_string().green());

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
            kind.to_be_bytes().as_slice(),
            program_id_miner.as_ref()
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
            // AccountMeta::new_readonly(program_id_miner, false)
        ]
    };

    // let compute_budget_instruction_limit = ComputeBudgetInstruction::set_compute_unit_limit(1_400_000);
    let compute_budget_instruction_price = ComputeBudgetInstruction::set_compute_unit_price(priority_fee);

    let transaction = Transaction::new_signed_with_payer(
        &[
            // compute_budget_instruction_limit,
            compute_budget_instruction_price,
            instruction
        ],
        Some(&payer.pubkey()),
        &[&payer],
        client.get_latest_blockhash().unwrap(),
    );

    let result = client.send_and_confirm_transaction(&transaction);

    match result {
        Ok(signature) => {
            /*
            let maybe_user_account_data_raw = client.get_account_data(&user_eth_xn_record_pda);
            match maybe_user_account_data_raw {
                Ok(user_account_data_raw) => {
                    let user_data: [u8; size_of::<UserEthXnRecord>() - 4] = user_account_data_raw.as_slice()[8..20].try_into().unwrap();
                    let user_state = UserEthXnRecord::try_from_slice(user_data.as_ref()).unwrap();
                    println!(
                        "Tx={}, hashes={}, superhashes={}, amp={}",
                        signature.to_string().yellow(),
                        (user_state.hashes).to_string().yellow(),
                        (user_state.superhashes).to_string().yellow(),
                        // (user_state.points / 1_000_000_000).to_string().yellow(),
                        global_state.amp.to_string().yellow()
                    )
                }
                Err(_) => println!("Account data not yet ready; skipping")
            }
            */
            println!("Sig={}", signature)
        },
        Err(err) => println!("Failed: {:?}", err),
    };
}

