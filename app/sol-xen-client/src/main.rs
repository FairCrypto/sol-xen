use solana_client::rpc_client::RpcClient;
use solana_sdk::hash::{hash};
use solana_sdk::{
    borsh1::{try_from_slice_unchecked},
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
use borsh::{BorshSerialize, BorshDeserialize, to_vec, BorshSchema, try_from_slice_with_schema, object_length};
use ethaddr::Address;
use colored::*;
use dotenv::dotenv;

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

#[derive(BorshDeserialize, BorshSchema)]
pub struct GlobalXnRecord {
    pub amp: u16,
    pub last_amp_slot: u64,
    pub points: u128,
    pub hashes: u32,
    pub superhashes: u32,
    pub txs: u32
}

#[derive(BorshSerialize, BorshDeserialize, BorshSchema)]
pub struct UserXnRecord {
    pub points: u128,
}

fn main() {
    dotenv().ok(); // This line loads the environment variables from the ".env" file.

    let args = Args::parse();
    let priority_fee: u64 = args.fee;
    let ethereum_address: String = args.address;

    // Use ethaddr to parse and validate the Ethereum address with checksum
    let _address = match Address::from_str_checksum(&ethereum_address) {
        Ok(addr) => addr,
        Err(_) => {
            eprintln!("Invalid checksummed Ethereum address: {}", ethereum_address);
            process::exit(1);
        }
    };

    execute_transaction(_address.0, priority_fee);
}

fn execute_transaction(address: [u8; 20], priority_fee: u64) {
    let keypair_path = std::env::var("USER_WALLET").expect("USER_WALLET must be set.");
    let url = std::env::var("ANCHOR_PROVIDER_URL").expect("ANCHOR_PROVIDER_URL must be set.");
    let program_id_str = std::env::var("PROGRAM_ID").expect("PROGRAM_ID must be set.");
    let program_id = Pubkey::try_from(program_id_str.as_str()).expect("Bad program ID");
    println!("Program ID: {}", program_id.to_string());

    let client = RpcClient::new(url);
    println!("RPC Url: {}", client.url());
    let payer = read_keypair_file(&keypair_path).expect("Failed to read keypair file");

    let mint_tokens = MintTokens {
        _eth_account: EthAccount {
            address
        }
    };

    println!("User key={}, fee={}", payer.pubkey(), priority_fee);

    let (mint_pda, _mint_bump) = Pubkey::find_program_address(
        &[b"mint"],
        &program_id
    );

    let (global_xn_record_pda, _global_bump) = Pubkey::find_program_address(
        &[b"xn-global-counter"],
        &program_id
    );

    let (user_xn_record_pda, _user_bump) = Pubkey::find_program_address(
        &[
            b"sol-xen",
            &address.as_slice(),
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

    let method_name_data = "global:mint_tokens";
    let digest = hash(method_name_data.as_bytes());
    let ix_data  = &digest.to_bytes()[0..8];

    let instruction = Instruction {
        program_id,
        data: [ix_data, to_vec(&mint_tokens).unwrap().as_slice()].concat().to_vec(),
        accounts: vec![
            AccountMeta::new(user_token_account, false),
            AccountMeta::new(global_xn_record_pda, false),
            AccountMeta::new(user_xn_record_pda, false),
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
        Ok(signature) => println!("Tx ={}", signature.to_string().bright_blue()),
        Err(err) => println!("Failed: {:?}", err),
    };

    let user_account_data = client.get_account_data(&user_xn_record_pda).unwrap();
    let user_data_trunc: [u8; 17] = user_account_data.as_slice()[0..18].try_into().unwrap();
    // let user_state = UserXnRecord::try_from_slice(user_account_data.as_slice());
    // let len = object_length::<UserXnRecord>()
    let user_state = UserXnRecord::try_from_slice(user_data_trunc.as_ref());

    match  user_state {
        Result::Ok(data) => println!("User {}", data.points),
        Result::Err(err) => println!("Error: msg={} len={:?}", err.to_string().red(), user_account_data)
    }

    let account_data = client.get_account_data(&global_xn_record_pda).unwrap();
    // let global_state = borsh::try_from_slice_with_schema::<GlobalXnRecord>(account_data.as_slice()).unwrap();
    let global_state = GlobalXnRecord::try_from_slice(account_data.as_slice()).unwrap();
    println!("State: txs={}, hashes={}, superhashes={}, amp={}", global_state.txs, global_state.hashes, global_state.superhashes, global_state.amp);

}