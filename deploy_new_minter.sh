#!/bin/bash

# Solana mainnet
# slot # 268,321,180 @	May 27, 2024 21:40:11 UTC
# target slot # 268495152 @	May 28, 2024 10:00:00 PDT

# localnet
# url="http://127.0.0.1:8899"

# xolana
# url="http://127.0.0.1:8899"

# devnet
# url="https://api.devnet.solana.com"

# mainnet
url="https://api.mainnet-beta.solana.com"

# nohup solana-test-validator &

solana config set --url "$url"

# solana airdrop 100

max=4
miners=''

current_slot=$(solana slot |   awk  '{print $0}')
echo "current slot= $current_slot"

# start_slot=$((current_slot+330))
start_slot=1
echo "start slot= $start_slot"

timestamp=$(date +%s)

miners="B8HwMYCk1o7EaJhooM4P43BHSk5M8zZHsTeJixqw7LMN,2Ewuie2KnTvMLwGqKWvEM1S2gUStHzDUfrANdJfu45QJ,5dxcK28nyAJdK9fSFuReRREeKnmAGVRpXPhwkZxAxFtJ,DdVCjv7fsPPm64HnepYy5MBfh2bNfkd84Rawey9rdt5S"

echo
echo "Miners=$miners"

echo
echo
echo "##### Minter #####"
echo

gsed -i 's/comma_delimited = "\(.*\)";/comma_delimited = "'$miners'";/' ./programs/sol-xen-minter/src/lib.rs

rm ./target/deploy/sol_xen_minter.so
rm ./target/deploy/sol_xen_minter-keypair.json

anchor build -p sol-xen-miner
minter_key=$(anchor keys list | grep "sol_xen_minter" | awk -F': ' '{print $2}')

echo "   minter key= $minter_key"
gsed -i 's/declare_id!("\(.*\)");/declare_id!("'$minter_key'");/' ./programs/sol-xen-minter/src/lib.rs
gsed -i 's/const START_SLOT: u64 = \(.*\);/const START_SLOT: u64 = '$start_slot';/' ./programs/sol-xen-minter/src/lib.rs

anchor build -p sol-xen-minter

echo
echo
anchor deploy -p sol-xen-minter -- --with-compute-unit-price 1000000 ----max-sign-attempts 1000 --use-rpc
# anchor deploy -p sol-xen-minter

echo
echo "Sleeping for 5s..."
sleep 5

echo
echo "Initializing minter..."
echo

tsx ./admin/init_minter.ts

# should fail
# tsx ./admin/init_minter.ts

# solana program set-upgrade-authority "$minter_key" -u "$url" --final

timestamp_end=$(date +%s)

delta=$((timestamp_end-timestamp))

echo "Deployment took $delta s"

# echo
# echo "Relinquishing control..."
# echo
# tsx ./admin/relinquish_mint_control.ts

echo
echo "Deployment done"
echo

echo
echo "Modifying clients"
echo
# || '....';
# gsed -i "s/process.env.MINERS || '\(.*\)';/process.env.MINERS || '"$miners"';/" ./client/multiminer.ts

# const MINERS: &str = "
# gsed -i 's/const MINERS: \&str = "\(.*\)";/const MINERS: \&str = "'$miners'";/' ./app/sol-xen-client/src/main.rs
# gsed -i 's/const MINERS: \&str = "\(.*\)";/const MINERS: \&str = "'$miners'";/' ./app/sol-xen-multiminer/src/main.rs
gsed -i 's/const MINTER: \&str = "\(.*\)";/const MINTER: \&str = "'$minter_key'";/' ./app/sol-xen-client/src/main.rs
gsed -i 's/const MINTER: \&str = "\(.*\)";/const MINTER: \&str = "'$minter_key'";/' ./app/sol-xen-multiminer/src/main.rs

# echo
# echo "Doing test mines and mints"
# echo "Running TSX multiminer"
# echo
# tsx ./client/multiminer.ts mine --address 0x6B889Dcfad1a6ddf7dE3bC9417F5F51128efc964 -r 10 -f 1 -d 1 -a 10

echo
# echo "Pausing for 5s"
# sleep 5
echo "Compiling and Running NodeJS multiminer"

tsc 1>/dev/null

# runner.ts
gsed -i "s/runner.ts/runner.js/" ./client/multiminer.js
gsed -i "s/autominter.ts/autominter.js/" ./client/multiminer.js
gsed -i "s/multiminer/multiminer.js/" ./client/runner.js

# node ./client/multiminer.js mine --address 0x6B889Dcfad1a6ddf7dE3bC9417F5F51128efc964 -r 10 -f 1 -d 1 -a 10

# echo
# echo "Pausing for 5s"
# sleep 5
# echo "Running Rust multiminer"
# cargo run --package sol-xen-multiminer -- --address 0x6B889Dcfad1a6ddf7dE3bC9417F5F51128efc964 -r 10 -f 1 -d 1 -a 10





