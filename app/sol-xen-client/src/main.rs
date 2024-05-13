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
use std::thread;
use std::time::Duration;

#[derive(BorshSerialize, Debug)]
pub struct EthAccount {
    pub address: [u8; 20],
}

#[derive(BorshSerialize, Debug)]
pub struct MintTokens {
    pub _eth_account: EthAccount
}

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    #[arg(short, long)]
    address: String,
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

    // Use ethaddr to parse and validate the Ethereum address with checksum
    let _address = match Address::from_str_checksum(&ethereum_address) {
        Ok(addr) => addr,
        Err(_) => {
            eprintln!("Invalid checksummed Ethereum address: {}", ethereum_address);
            process::exit(1);
        }
    };

    execute_transactions(ethereum_address, _address.0, priority_fee, runs);
}

fn execute_transactions(ethereum_address: String, address: [u8; 20], priority_fee: u64, runs: u16) {
    let keypair_path = std::env::var("USER_WALLET").expect("USER_WALLET must be set.");
    let url = std::env::var("ANCHOR_PROVIDER_URL").expect("ANCHOR_PROVIDER_URL must be set.");
    let program_id_str = std::env::var("PROGRAM_ID").expect("PROGRAM_ID must be set.");
    let program_id = Pubkey::try_from(program_id_str.as_str()).expect("Bad program ID");
    println!("Program ID={}", program_id.to_string().green());

    let client = RpcClient::new(url);
    println!("Running on: {}", client.url().green());
    let payer = read_keypair_file(&keypair_path).expect("Failed to read keypair file");

    let mint_tokens = MintTokens {
        _eth_account: EthAccount {
            address
        }
    };

    println!(
        "Using user wallet={}, account={}, fee={}, runs={}", 
        payer.pubkey().to_string().green(),
        ethereum_address.green(),
        priority_fee.to_string().green(),
        runs.to_string().green()
    );

    let (mint_pda, _mint_bump) = Pubkey::find_program_address(
        &[b"mint"],
        &program_id
    );

    let (global_xn_record_pda, _global_bump) = Pubkey::find_program_address(
        &[b"xn-global-counter"],
        &program_id
    );

    let (user_eth_xn_record_pda, _user_bump) = Pubkey::find_program_address(
        &[
            b"xn-by-eth",
            &address.as_slice()
        ],
        &program_id
    );

    let (user_sol_xn_record_pda, _user_bump) = Pubkey::find_program_address(
        &[
            b"xn-by-sol",
            &payer.pubkey().to_bytes()
        ],
        &program_id
    );

    let associate_token_program = Pubkey::try_from("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL").unwrap();

    let user_token_account = get_associated_token_address_with_program_id(
        &payer.pubkey(),
        &mint_pda,
        &spl_token::ID
    );

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

    let method_name_data = "global:mint_tokens";
    let digest = hash(method_name_data.as_bytes());
    let ix_data  = &digest.to_bytes()[0..8];

    for _run in 1..(runs + 1) {
        let instruction = Instruction {
            program_id,
            data: [ix_data, to_vec(&mint_tokens).unwrap().as_slice()].concat().to_vec(),
            accounts: vec![
                AccountMeta::new(user_token_account, false),
                AccountMeta::new(global_xn_record_pda, false),
                AccountMeta::new(user_eth_xn_record_pda, false),
                AccountMeta::new(user_sol_xn_record_pda, false),
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new(mint_pda, false),
                AccountMeta::new_readonly(spl_token::ID, false),
                AccountMeta::new_readonly(system_program::ID, false),
                AccountMeta::new_readonly(associate_token_program, false),
                AccountMeta::new_readonly(rent::ID, false)
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

        let result = client.send_transaction(&transaction);

        match result {
            Ok(signature) => {
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
                
            },
            Err(err) => println!("Failed: {:?}", err),
        };
        thread::sleep(Duration::from_secs(5));
    }

}
