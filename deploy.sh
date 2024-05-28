#!/bin/bash

# Solana mainnet
# slot # 268,321,180 @	May 27, 2024 21:40:11 UTC
# target slot # 268495152 @	May 28, 2024 10:00:00 PDT

# localnet
# url="http://127.0.0.1:8899"

# devnet
url="https://api.devnet.solana.com"

# mainnet
url="https://api.solana.com"

# nohup solana-test-validator &

solana config set --url "$url"

# solana airdrop 100

max=4
miners=''

current_slot=$(solana slot |   awk  '{print $0}')
echo "current slot= $current_slot"

# start_slot=$((current_slot+330))
start_slot=268495152
echo "start slot= $start_slot"

timestamp=$(date +%s)

for (( kind=0; kind < $max; kind++ ))
do
    echo
    echo
    echo "##### Miner kind=$kind #####"
    echo

    rm ./target/deploy/sol_xen_miner.so
    rm ./target/deploy/sol_xen_miner-keypair.json

    anchor build -p sol-xen-miner
    key=$(anchor keys list | grep "sol_xen_miner" | awk -F': ' '{print $2}')

    echo "   key= $key"
    sed -i 's/declare_id!("\(.*\)");/declare_id!("'$key'");/' ./programs/sol-xen-miner/src/lib.rs
    # const START_SLOT: u64 = 301_816_336;
    sed -i 's/const START_SLOT: u64 = \(.*\);/const START_SLOT: u64 = '$start_slot';/' ./programs/sol-xen-miner/src/lib.rs

    anchor build -p sol-xen-miner

    echo
    echo
    anchor deploy -p sol-xen-miner

    echo
    echo "Sleeping for 5s..."
    sleep 5

    echo
    echo "Initializing miner..."
    echo

    tsx ./admin/init_miner.ts --kind $kind

    # should fail!
    # tsx ./admin/init_miner.ts --kind $kind

    solana program set-upgrade-authority "$key" -u "$url" --final

    miners="$miners$key"
    max_less_1=$((max - 1))
    if [ "$kind" -lt "$max_less_1" ]; then
      miners="$miners,"
    fi

    # "address": "5i4ZPZujwASXGSYENhQEEijiU4EWBzobPAKzKUs87khw",
    sed -i 's/"address": "\(.*\)",/"address": "'$key'",/' "./target/idl/sol_xen_miner_$kind.json"
    sed -i 's/"address": "\(.*\)",/"address": "'$key'",/' "./target/types/sol_xen_miner_$kind.ts"

    echo
done

echo
echo "Miners=$miners"

echo
echo
echo "##### Minter #####"
echo

sed -i 's/comma_delimited = "\(.*\)";/comma_delimited = "'$miners'";/' ./programs/sol-xen-minter/src/lib.rs

rm ./target/deploy/sol_xen_minter.so
rm ./target/deploy/sol_xen_minter-keypair.json

anchor build -p sol-xen-miner
minter_key=$(anchor keys list | grep "sol_xen_minter" | awk -F': ' '{print $2}')

echo "   minter key= $minter_key"
sed -i 's/declare_id!("\(.*\)");/declare_id!("'$minter_key'");/' ./programs/sol-xen-minter/src/lib.rs
sed -i 's/const START_SLOT: u64 = \(.*\);/const START_SLOT: u64 = '$start_slot';/' ./programs/sol-xen-minter/src/lib.rs

anchor build -p sol-xen-minter

echo
echo
anchor deploy -p sol-xen-minter

echo
echo "Sleeping for 5s..."
sleep 5

echo
echo "Initializing minter..."
echo

tsx ./admin/init_minter.ts

# should fail
# tsx ./admin/init_minter.ts

solana program set-upgrade-authority "$minter_key" -u "$url" --final

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
sed -i "s/process.env.MINERS || '\(.*\)';/process.env.MINERS || '"$miners"';/" ./client/multiminer.ts

# const MINERS: &str = "
sed -i 's/const MINERS: \&str = "\(.*\)";/const MINERS: \&str = "'$miners'";/' ./app/sol-xen-client/src/main.rs
sed -i 's/const MINERS: \&str = "\(.*\)";/const MINERS: \&str = "'$miners'";/' ./app/sol-xen-multiminer/src/main.rs
sed -i 's/const MINTER: \&str = "\(.*\)";/const MINTER: \&str = "'$minter_key'";/' ./app/sol-xen-multiminer/src/main.rs

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
sed -i "s/runner.ts/runner.js/" ./client/multiminer.js
sed -i "s/autominter.ts/autominter.js/" ./client/multiminer.js
sed -i "s/multiminer/multiminer.js/" ./client/runner.js

# node ./client/multiminer.js mine --address 0x6B889Dcfad1a6ddf7dE3bC9417F5F51128efc964 -r 10 -f 1 -d 1 -a 10

# echo
# echo "Pausing for 5s"
# sleep 5
# echo "Running Rust multiminer"
# cargo run --package sol-xen-multiminer -- --address 0x6B889Dcfad1a6ddf7dE3bC9417F5F51128efc964 -r 10 -f 1 -d 1 -a 10





