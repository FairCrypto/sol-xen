use std::collections::HashMap;
use std::mem::size_of;
use std::ops::Sub;
use solana_client::rpc_client::RpcClient;
use solana_client::pubsub_client::{PubsubClient};
use solana_sdk::hash::{hash};
use solana_sdk::{system_program, pubkey::Pubkey, signature::{Signer, read_keypair_file}, transaction::Transaction, instruction::{Instruction, AccountMeta}, compute_budget::ComputeBudgetInstruction, system_instruction};
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
use jsonrpsee::core::client::{ClientT};
use jsonrpsee::rpc_params;
use jsonrpsee::http_client::{HttpClient, HttpClientBuilder};
use bincode::{serialize};
use base58::ToBase58;
use spl_memo::build_memo;
use serde::{Deserialize, Serialize};
use futures::channel::oneshot;
use url::{Url};

const MINERS: &str = "B8HwMYCk1o7EaJhooM4P43BHSk5M8zZHsTeJixqw7LMN,2Ewuie2KnTvMLwGqKWvEM1S2gUStHzDUfrANdJfu45QJ,5dxcK28nyAJdK9fSFuReRREeKnmAGVRpXPhwkZxAxFtJ,DdVCjv7fsPPm64HnepYy5MBfh2bNfkd84Rawey9rdt5S";

const MINTER: &str = "EPAdVJ5S317jJr2ejgxoA52iptvphGXjPLbqXhZH4n8o";

const MAX_MINERS: u8 = 4;

const DECIMALS: u128 = 1_000_000_000;

/*
    Color::Red => "31".into(),
    Color::Green => "32".into(),
    Color::Yellow => "33".into(),
    Color::Blue => "34".into(),
 */
const R: &str = "\x1b[0;31m";
const G: &str = "\x1b[0;32m";
const Y: &str = "\x1b[0;33m";
// const B: &str = "\x1b[0;34m";
const U: &str = "\x1b[0;39m";

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
    #[arg(short, long, default_value_t = 1_180_000)]
    units: u32,
    #[arg(short, long, default_value_t = 1)]
    runs: u32,
    #[arg(short, long, default_value_t = 0.5)]
    delay: f32,
    #[arg(short, long, default_value_t = 1_000)]
    automint: u32,
    #[arg(short, long, default_value_t = 0)]
    jito_tip: u64,
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

#[derive(BorshSerialize, BorshDeserialize, BorshSchema, Clone)]
pub struct UserSolXnRecord {
    pub hashes: u64, // 8
    pub superhashes: u32, // 4
    pub points: u128, // 16
} // 28

#[derive(BorshSerialize, BorshDeserialize, BorshSchema, Clone)]
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
    jito_tip: Option<u64>,
    tippers: Vec<String>,
}


#[derive(Serialize,Deserialize, Debug, Clone)]
pub struct JitoContext {
    slot: u64
}

#[derive(Serialize,Deserialize, Debug, Clone)]
pub struct JitoErr {
    ok: Option<String>
}

#[derive(Serialize,Deserialize, Debug, Clone)]
pub struct JitoValue {
    bundle_id: String,
    transactions: Vec<String>,
    slot: u64,
    confirmation_status: String,
    err: JitoErr
}
#[derive(Serialize,Deserialize, Debug, Clone)]
pub struct JitoBundleStatus {
    context: JitoContext,
    value: Option<Vec<JitoValue>>,
}

impl From<MineParams> for (String, [u8; 20], u64, u32, u8, f32, u32, Option<u64>, Vec<String>) {
    fn from(x: MineParams) -> (String, [u8; 20], u64, u32, u8, f32, u32, Option<u64>, Vec<String>) {
        let MineParams {
            ethereum_address,
            address,
            priority_fee,
            runs,
            kind,
            delay,
            units,
            jito_tip,
            tippers,
        } = x;
        (ethereum_address, address, priority_fee, runs, kind, delay, units, jito_tip, tippers)
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

#[tokio::main]
async fn main() {
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
    let jito_tip = if args.jito_tip > 0 { Some(args.jito_tip) } else { None };

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
    let jito_url = if jito_tip.is_some() {
        std::env::var("JITO_PROVIDER_URL").map(|u| Some(u))
            .expect("JITO_PROVIDER_URL must be set with 'jito_tip' param.")
    } else { None };

    let tippers = if jito_tip.is_some() {
        let u = jito_url.map(|u| format!("{}/bundles", u)).expect("???");
        let client: HttpClient = HttpClientBuilder::default().build(u).expect("Error");
        let resp: Result<Vec<String>, _> = client.request("getTipAccounts", rpc_params![""]).await;
        resp.expect("err")
    } else {
        vec!()
    };
    println!("Tippers: {:}", tippers.len());
    
    let (tx, rx) = mpsc::channel::<String>();
    let mut wallets: HashMap<u8, Keypair> = HashMap::new();
    let tx_clone = tx.clone();
    for kind in 0..MAX_MINERS {
        let keypair_path_norm = if keypair_path.ends_with("/")
        { keypair_path.clone() } else { keypair_path.clone() + "/" };
        let keypair_fn = format!("{keypair_path_norm}id{kind}.json");
        let _ = match read_keypair_file(&keypair_fn) {
            Ok(keypair) => {
                wallets.insert(kind, keypair.insecure_clone());
                let a = ethereum_address.clone();
                let txc = tx_clone.clone();
                let tt = tippers.clone();
                let keypair_clone = keypair.insecure_clone();
                let _h = thread::spawn(move || {
                    do_mine(
                        keypair,
                        MineParams {
                            ethereum_address: a,
                            address: *_address,
                            priority_fee,
                            runs,
                            kind,
                            delay,
                            units,
                            jito_tip,
                            tippers: tt
                        },
                        txc)
                });
                // h.join().unwrap();
                if automint > 0 {
                    let tx_clone1 = tx.clone();
                    let ws = ws_url.clone();
                    let _hm = thread::spawn(move || {
                        let mut last_slot: Slot = 0;
                        let _ = match PubsubClient::slot_subscribe(ws.as_str()) {
                            Ok(subs) => {
                                for slot in subs.1 {
                                    let txcm = tx_clone1.clone();
                                    let kpm = keypair_clone.insecure_clone();
                                    if slot.slot.ge(&last_slot) && slot.slot.sub(last_slot).ge(&(automint as u64)) {
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

fn get_token_record(client: &RpcClient, pda: &Pubkey) -> Option<UserTokensRecord> {
    let maybe_user_token_account_data_raw = client.get_account_data(&pda);
    match maybe_user_token_account_data_raw {
        Ok(user_balance_data_raw) => {
            let user_data: [u8; size_of::<UserTokensRecord>()] = user_balance_data_raw.as_slice()[8..].try_into().unwrap();
            Some(UserTokensRecord::try_from_slice(user_data.as_ref()).unwrap())
        }
        Err(_) => None
    }
}


async fn wait_for_status(sig: String, jito_client: HttpClient) -> oneshot::Receiver<JitoBundleStatus> {
    let params1 = rpc_params![[sig]];
    let (sender, receiver) = oneshot::channel();
    async {
        loop {
            let r: Result<JitoBundleStatus, _> = jito_client.request("getBundleStatuses", params1.clone()).await;
            if r.is_ok() {
                let res = r.unwrap();
                if res.value.is_some() {
                    if res.clone().value.unwrap().len() > 0 {
                        sender.send(res).unwrap();
                        return;
                    }
                }
            }
            thread::sleep(Duration::from_millis(1_000));
        }
    }.await;
    receiver
}

// Earn (mine) points by looking for hash patterns in randomized numbers
#[tokio::main]
async fn do_mine(payer: Keypair, params: MineParams, tx: mpsc::Sender<String>) {
    let (
        ethereum_address,
        address,
        priority_fee,
        runs,
        kind,
        delay,
        units,
        jito_tip,
        tippers,
    ) = params.into();
    let url = std::env::var("ANCHOR_PROVIDER_URL").expect("ANCHOR_PROVIDER_URL must be set.");
    let jito_base_url = if jito_tip.is_some() {
        std::env::var("JITO_PROVIDER_URL")
            .map(|u| Url::parse(u.as_str()))
            .expect("JITO_PROVIDER_URL must be set with 'jito_tip' param.")
            .map(|url| url.origin())
            .map(|origin| origin.ascii_serialization())
            .map(|u| Some(format!("{}/api/v1", u)))
            .unwrap()
    } else { None };
    let jito_bundles_url = jito_base_url
            .map(|u|format!("{}/bundles", u));

    let miners_program_ids_str= std::env::var("MINERS").unwrap_or(String::from(MINERS));
    let miners = miners_program_ids_str.split(',').collect::<Vec<&str>>();
    assert_eq!(miners.len(), MAX_MINERS as usize, "Bad miners set");

    let program_id = Pubkey::try_from(miners[kind as usize]).expect("Bad program ID");

    tx.send(format!("{Y}[{}]{U} Miner Program ID={}", kind.to_string(), program_id.to_string().green())).unwrap();

    let client = RpcClient::new(url.clone());
    let rpc_client = RpcClient::new(url.clone());

    tx.send(format!(
        "{Y}[{}]{U} Using user wallet={}, account={}",
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

        let compute_budget_instruction_limit = ComputeBudgetInstruction::set_compute_unit_limit(units);
        let compute_budget_instruction_price = ComputeBudgetInstruction::set_compute_unit_price(priority_fee);

        let mine_instruction = Instruction {
            program_id,
            data: [ix_data, to_vec(&mint_hashes).unwrap().as_slice()].concat().to_vec(),
            accounts: vec![
                AccountMeta::new(global_xn_record_pda, false),
                AccountMeta::new(user_eth_xn_record_pda, false),
                AccountMeta::new(user_sol_xn_record_pda, false),
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
        };

        if jito_tip.is_some() && tippers.len() > 0 {
            // tx.send(format!("{Y}[{}]{U} Using Jito URL={}", kind.to_string(), jito_bundles_url.clone().unwrap().green())).unwrap();

            let jito_client: HttpClient = HttpClientBuilder::default().build(jito_bundles_url.clone().unwrap()).expect("Error");

            let tip_jito = system_instruction::transfer(
                    &payer.pubkey(),
                    &Pubkey::try_from(tippers[0].to_string().as_str()).unwrap(),
                    jito_tip.map(|t|t).unwrap_or(1)
                );

            let transactions = (0..5).map(|i| {
                let memo = build_memo(&[i as u8], &[&payer.pubkey()]);
                let mut instructions = vec![
                    compute_budget_instruction_limit.clone(),
                    compute_budget_instruction_price.clone(),
                    memo,
                    mine_instruction.clone(),
                ];
                if i == 4 {
                    instructions.push(tip_jito.clone())
                }
                let transaction = Transaction::new_signed_with_payer(
                    &instructions,
                    Some(&payer.pubkey()),
                    &[&payer],
                    client.get_latest_blockhash().unwrap(),
                );
                serialize(&transaction).unwrap().to_base58()
            }).collect::<Vec<String>>();

            let params = rpc_params![transactions];
            
            let resp: Result<String, _> = jito_client.request("sendBundle", params).await;
            if resp.is_ok() {
                let sig = resp.expect("err");
                tx.send(format!("{Y}[{}]{U} Bundle ID={}", kind, sig.yellow())).unwrap();

                let status = wait_for_status(sig, jito_client).await;
                let result = status.await;
                if result.is_ok() {
                    result.unwrap().value.map(|v| v[0].transactions.clone()).unwrap()
                        .iter()
                        .for_each(|hash|tx.send(format!("{Y}[{}]{U}   Tx={}", kind, hash.yellow())).unwrap());
                    
                    let user_state = get_eth_record(&client, &user_eth_xn_record_pda);
                    let user_sol_state = get_sol_record(&client, &user_sol_xn_record_pda);
                    let (h, sh) = user_state
                        .map(|s| (s.hashes.to_string(), s.superhashes.to_string()))
                        .unwrap_or((String::from("-"), String::from("-")));
                    tx.send(format!(
                        "{Y}[{}]{U} Hashes={}, Superhashes={}, Points={}",
                        kind.to_string(),
                        h.yellow(),
                        sh.yellow(),
                        user_sol_state
                            .map(|s| (s.points / DECIMALS).to_string())
                            .unwrap_or(String::from("-")).yellow(),
                    )).unwrap();
                } else {
                    tx.send(format!("{Y}[{}]{U} Error in bundle processing; skipping...", kind)).unwrap();
                }
            } else {
                tx.send(format!("{Y}[{}]{U} Error sending bundle; skipping...", kind)).unwrap();
            }

        } else {
            let instructions = vec![
                compute_budget_instruction_limit.clone(),
                compute_budget_instruction_price.clone(),
                mine_instruction.clone(),
            ];
            let transaction = Transaction::new_signed_with_payer(
                &instructions,
                Some(&payer.pubkey()),
                &[&payer],
                client.get_latest_blockhash().unwrap(),
            );

            let result = rpc_client.send_transaction(&transaction);
            match result {
                Ok(signature) => {
                    let user_state = get_eth_record(&client, &user_eth_xn_record_pda);
                    let user_sol_state = get_sol_record(&client, &user_sol_xn_record_pda);
                    let (h, sh) = user_state.map(|s| (s.hashes.to_string(), s.superhashes.to_string()))
                        .unwrap_or((String::from("-"), String::from("-")));
                    tx.send(format!(
                        "{Y}[{}]{U} Tx={}, hashes={}, superhashes={}, points={}, url={}",
                        kind.to_string(),
                        signature.to_string().yellow(),
                        h.yellow(),
                        sh.yellow(),
                        user_sol_state.map(|s| (s.points / DECIMALS).to_string())
                            .unwrap_or(String::from("-")).yellow(),
                        rpc_client.url()
                    )).unwrap();
                    thread::sleep(Duration::from_secs_f32(delay));
                },
                Err(err) => tx.send(format!("Failed: {:?}", err)).unwrap(),
            };
        }
    }
}

// Mint tokens based on provided evidence of mining points
fn do_mint(payer: Keypair, params: MintParams, tx: mpsc::Sender<String>) {
    let (slot, priority_fee, kind, _) = params.into();
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

    // get pre-tx user balance
    let user_token_state_pre = get_token_record(&client, &user_token_record_pda);
    
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
            // let user_sol_state = get_sol_record(&client, &user_sol_xn_record_pda);
            let user_token_state = get_token_record(&client, &user_token_record_pda);
            let user_token_state_1 = user_token_state.clone();
            let user_token_state_2 = user_token_state.clone();
            let delta = user_token_state_pre
                .map(|s_pre| user_token_state
                    .map(|s| s.tokens_minted - s_pre.tokens_minted)
                ).unwrap_or(Some(0)).unwrap_or(0);
            let delta_str: String = if delta > 0 { format!("(+{})", delta / DECIMALS) } else { String::from("") };
            let points = user_token_state_1
                .map(|s| s.points_counters
                    .map(|p| (p / DECIMALS).to_string()).join(",")).unwrap_or(String::from(""));

            // AM #2: balance @slot=150279: points=0,3600,3600,0, tokens=7200(+5400). Total supply=7200
            tx.send(format!(
                "{G}[{}]{U} Mint Tx={}, Slot={} Points={} Tokens={}{}",
                kind.to_string(),
                signature.to_string().green(),
                slot.to_string().green(),
                points.green(),
                user_token_state_2
                    .map(|s| (s.tokens_minted / DECIMALS).to_string())
                    .unwrap_or(String::from("")).green(),
                delta_str.yellow(),
            )).unwrap()
            
        },
        Err(_err) => tx.send(format!(
            "{R}[{}]{U} Unable to confirm Mint tx due to timeout",
            kind.to_string()
        )).unwrap(),
    };

}

