use std::mem::size_of;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{pubkey::Pubkey, signature::{Signer}};
use clap::{Parser};
use std::process;
use borsh::{BorshSerialize, BorshDeserialize, BorshSchema};
use ethaddr::Address;
use colored::*;
use dotenv::dotenv;
use solana_sdk::signature::{read_keypair_file};

const MINERS: &str = "9XNNynsVCWvXc29pn1JnX612tHmZn9L5ru3CuzB9yqa4,FsgFkUzBvJoGajtqHUXVhv18UKvHP9kVZm7BVWSEteLR,cNek6f9aNewFVKZv9YRyu3sxPCXx2jkEKYWLc6KnB6f,3Giiqno6EobSBbcaVwMJCuf78Fy6smFJfV2PAaborDaX
";

/*
    Color::Red => "31".into(),
    Color::Green => "32".into(),
    Color::Yellow => "33".into(),
    Color::Blue => "34".into(),
 */
const Y: &str = "\x1b[0;33m";
// const B: &str = "\x1b[0;34m";
const U: &str = "\x1b[0;39m";

#[derive(BorshSerialize, Debug)]
pub struct EthAccount {
    pub address: [u8; 20],
    pub address_str: String
}
#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    #[arg(short, long)]
    address: Option<String>,
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

#[derive(BorshSerialize, BorshDeserialize, BorshSchema, Debug)]
pub struct UserEthXnRecord {
    pub hashes: u64,  // 8
    pub superhashes: u32, // 4
} // 16 == 16

#[derive(BorshSerialize, BorshDeserialize, BorshSchema, Clone, Debug)]
pub struct UserSolXnRecord {
    pub hashes: u64, // 8
    pub superhashes: u32, // 4
    pub points: u128, // 16
} // 28

fn get_eth_record(client: &RpcClient, pda: &Pubkey) -> Option<UserEthXnRecord> {
    let maybe_user_account_data_raw = client.get_account_data(&pda);
    match maybe_user_account_data_raw {
        Ok(user_account_data_raw) => {
            let user_data: [u8; size_of::<UserEthXnRecord>() - 4] = user_account_data_raw.as_slice()[8..20].try_into().unwrap();
            Some(UserEthXnRecord::try_from_slice(user_data.as_ref()).unwrap())
        }
        Err(_) => None
    }
}

fn get_sol_record(client: &RpcClient, pda: &Pubkey) -> Option<UserSolXnRecord> {
    let maybe_user_sol_account_data_raw = client.get_account_data(&pda);
    match maybe_user_sol_account_data_raw {
        Ok(user_sol_account_data_raw) => {
            // 36 32 28
            // println!("{} {}", user_sol_account_data_raw.len(), size_of::<UserSolXnRecord>());
            let user_sol_data: [u8; size_of::<UserSolXnRecord>() - 4] = user_sol_account_data_raw.as_slice()[8..].try_into().unwrap();
            Some(UserSolXnRecord::try_from_slice(user_sol_data.as_ref()).unwrap())
        }
        Err(_) => None
    }
}

fn main() {
    dotenv().ok(); // This line loads the environment variables from the ".env" file.

    let args = Args::parse();
    let ethereum_address: Option<String> = args.address;
    let keypair_path = args.wallet_path
        .or(std::env::var("USER_WALLET").ok())
        .expect("Either set USER_WALLET env var, or pass it as -w command line param");
    let payer = read_keypair_file(&keypair_path).expect("Failed to read keypair file");
    

    let url = std::env::var("ANCHOR_PROVIDER_URL")
        .expect("ANCHOR_PROVIDER_URL must be set.");
    let kind = 1u8;

    let miners_program_ids_str= std::env::var("MINERS").unwrap_or(String::from(MINERS));
    let miners = miners_program_ids_str.split(',').collect::<Vec<&str>>();

    let program_id = Pubkey::try_from(miners[kind as usize]).expect("Bad program ID");

    println!("{Y}[{}]{U} Miner Program ID={}", kind.to_string(), program_id.to_string().green());

    let client = RpcClient::new(url.clone());

    println!("Running on RPC={}", url.green());

    match ethereum_address {
        Some(eth_address) => {
            // Use ethaddr to parse and validate the Ethereum address with checksum
            let address = match Address::from_str_checksum(&eth_address) {
                Ok(addr) => addr,
                Err(_) => {
                    eprintln!("Invalid check-summed Ethereum address: {}", eth_address);
                    process::exit(1);
                }
            };

            let (user_eth_xn_record_pda, _user_eth_bump) = Pubkey::find_program_address(
                &[
                    b"xn-by-eth",
                    &address.as_slice(),
                    kind.to_be_bytes().as_slice(),
                    program_id.as_ref()
                ],
                &program_id
            );
            
            let user_eth_state = get_eth_record(&client, &user_eth_xn_record_pda);
            println!("eth record: {:?}", user_eth_state);
            
        }
        None => {
            let (user_sol_xn_record_pda, _user_sol_bump) = Pubkey::find_program_address(
                &[
                    b"xn-by-sol",
                    &payer.pubkey().to_bytes(),
                    kind.to_be_bytes().as_slice(),
                    program_id.as_ref()
                ],
                &program_id
            );
            
            let user_sol_state = get_sol_record(&client, &user_sol_xn_record_pda);
            println!("sol record: {:?}", user_sol_state);
        }
    }
}

