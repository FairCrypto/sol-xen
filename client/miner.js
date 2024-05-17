import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getAddress, isAddress } from 'viem';
import readline from 'readline';
import { ComputeBudgetProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, setProvider, web3, Wallet, workspace, } from '@coral-xyz/anchor';
import * as fs from "node:fs";
import path from "node:path";
dotenv.config();
var Cmd;
(function (Cmd) {
    Cmd["Mine"] = "mine";
    Cmd["Balance"] = "balance";
})(Cmd || (Cmd = {}));
const G = '\x1b[32m';
const Y = '\x1b[33m';
const U = '\x1b[39m';
async function main() {
    // PARSE CLI ARGS
    const [, , , ...params] = process.argv;
    let cmd;
    let address = '';
    let priorityFee = 1;
    let units = 1_200_000;
    let runs = 1;
    let kind;
    let delay = 1;
    const yArgs = yargs(hideBin(process.argv))
        .command(Cmd.Mine, 'Checks gas-related params returned by current network')
        .command(Cmd.Balance, 'Checks balance of a master account')
        .option('priorityFee', {
        alias: 'f',
        type: 'number',
        default: 1,
        description: 'Solana priority fee, micro-lamports'
    })
        .option('units', {
        alias: 'u',
        type: 'number',
        default: 1_400_000,
        description: 'Solana MAX Compute Units'
    })
        .option('address', {
        alias: 'addr',
        type: 'string',
        description: 'Ethereum address to relate XN points to'
    })
        .option('runs', {
        alias: 'r',
        type: 'number',
        default: 1,
        description: 'Number of runs'
    })
        .option('kind', {
        alias: 'k',
        type: 'number',
        default: 1,
        demandOption: true,
        description: 'Kind of miner (0, 1 ...)'
    })
        .option('delay', {
        alias: 'd',
        type: 'number',
        default: 1,
        demandOption: true,
        description: 'Delay between txs'
    })
        .help()
        .parseSync();
    cmd = yArgs._[0];
    if (!cmd && params.length === 0) {
        // @ts-ignore
        yArgs.help();
        process.exit(1);
    }
    if (yArgs.kind !== null && typeof yArgs.kind !== 'undefined') {
        kind = Number(yArgs.kind);
        if (kind < 0 || kind > 3) {
            console.log("Wrong kind");
            process.exit(1);
        }
    }
    else {
        console.log("Kind param is required");
        process.exit(1);
    }
    if (yArgs.priorityFee) {
        priorityFee = Number(yArgs.priorityFee);
    }
    if (yArgs.units) {
        units = Number(yArgs.units);
    }
    if (yArgs.runs) {
        runs = Number(yArgs.runs);
    }
    if (yArgs.delay) {
        delay = Number(yArgs.delay);
    }
    if (yArgs.address) {
        try {
            address = getAddress(yArgs.address);
            if (!isAddress(address, { strict: true })) {
                console.error("Address malformed");
                process.exit(1);
            }
        }
        catch (e) {
            console.error(e.message);
            process.exit(1);
        }
    }
    const minersStr = process.env.MINERS
        || 'Ahhm8H2g6vJ5K4KDLp8C9QNH6vvTft1J3NmUst3jeVvW,joPznefcUrbGq1sQ8ztxVSY7aeUUrTQmdTbmKuRkn8J,9kDwKaJFDsE152eBJGnv6e4cK4PgCGFvw6u6NTAiUroG,BSgU8KC6yNbany2cfPvYSHDVXNVxHgQAuifTSeo2kD99';
    const miners = minersStr.split(',').map(s => new web3.PublicKey(s));
    const programId = miners[kind];
    // SETUP SOLANA ENVIRONMENT
    const network = process.env.ANCHOR_PROVIDER_URL || 'localnet';
    console.log(`\nRunning on ${G}${network}${U}`);
    const connection = new web3.Connection(network, 'processed');
    // Load user wallet keypair
    let user;
    if (process.env.USER_WALLET) {
        const userKeyPairFileName = process.env.USER_WALLET;
        const userKeyPairString = fs.readFileSync(path.resolve(userKeyPairFileName), 'utf-8');
        user = web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(userKeyPairString)));
        console.log(`Using user wallet ${G}${user.publicKey.toBase58()}${U}`);
    }
    else {
        console.error('User wallet not provided or not found. Set USER_WALLET="path to id.json" in .env file');
        process.exit(1);
    }
    // Update this to the ID of your deployed program
    const wallet = new Wallet(user);
    // Create and set the provider
    const provider = new AnchorProvider(connection, wallet);
    setProvider(provider);
    // check balance
    console.log(`Block height=${G}${await connection.getBlockHeight()}${U}`);
    console.log(`SOL balance=${G}${await connection.getBalance(user.publicKey).then((b) => b / LAMPORTS_PER_SOL)}${U}`);
    // Load the program
    let program;
    if (kind === 0) {
        program = workspace.SolXenMiner0;
    }
    else if (kind === 1) {
        program = workspace.SolXenMiner1;
    }
    else if (kind === 2) {
        program = workspace.SolXenMiner2;
    }
    else {
        program = workspace.SolXenMiner3;
    }
    console.log(`Miner program ID=${G}${programId}${U}, Anchor program ID=${program.programId}`);
    const [globalXnRecordAddress] = web3.PublicKey.findProgramAddressSync([
        Buffer.from("xn-miner-global"),
        Buffer.from([kind]),
    ], programId);
    const ethAddress20 = Buffer.from(address.slice(2), 'hex');
    const [userEthXnRecordAccount] = web3.PublicKey.findProgramAddressSync([
        Buffer.from("xn-by-eth"),
        ethAddress20,
        Buffer.from([kind]),
        programId.toBuffer(),
    ], programId);
    const [userSolXnRecordAccount] = web3.PublicKey.findProgramAddressSync([
        Buffer.from("xn-by-sol"),
        user.publicKey.toBuffer(),
        Buffer.from([kind]),
        programId.toBuffer(),
    ], programId);
    // PROCESS COMMANDS
    if (cmd === Cmd.Balance) {
        const globalXnRecord = await program.account.globalXnRecord.fetch(globalXnRecordAddress);
        console.log(`Global state: amp=${G}${globalXnRecord.amp}${U}`);
        if (address) {
            const userXnRecord = await program.account.userEthXnRecord.fetch(userEthXnRecordAccount);
            console.log(`User state: hashes=${G}${userXnRecord.hashes}${U}, superhashes=${G}${userXnRecord.superhashes}${U}`);
        }
        else {
            console.log("to show user balance, run with --address YOUR_ETH_ADDRESS key");
        }
    }
    else if (cmd === Cmd.Mine) {
        console.log(`Running miner with params: address=${G}${address}${U}, priorityFee=${G}${priorityFee}${U}, runs=${G}${runs}${U}, delay=${G}${delay}${U}`);
        console.log(`Using CU max=${G}${units}${U}`);
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units
        });
        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: priorityFee
        });
        const associateTokenProgram = new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
        let currentRun = 1;
        for (let run = 1; run <= runs; run++) {
            const globalXnRecordNew = await program.account.globalXnRecord.fetch(globalXnRecordAddress);
            const mintAccounts = {
                user: user.publicKey,
                xnByEth: userEthXnRecordAccount,
                xnBySol: userSolXnRecordAccount,
                globalXnRecord: globalXnRecordAddress,
                programId
            };
            const mintTx = await program.methods.mineHashes({ address: Array.from(ethAddress20) }, kind)
                .accounts(mintAccounts)
                .signers([user])
                .preInstructions([modifyComputeUnits, addPriorityFee])
                .rpc({ commitment: "processed", skipPreflight: true });
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
            // connection.onSignature(mintTx, (...params) => {
            //    readline.moveCursor(process.stdout, 0, run - currentRun);
            //    readline.cursorTo(process.stdout, 1);
            //    process.stdout.write(`.`);
            //    readline.moveCursor(process.stdout, 0, currentRun - run - 1);
            // }, 'confirmed')
            connection.onSignature(mintTx, (...params) => {
                readline.moveCursor(process.stdout, 0, run - currentRun);
                readline.cursorTo(process.stdout, 1);
                process.stdout.write(`X`);
                readline.moveCursor(process.stdout, 0, currentRun - run - 1);
                console.log();
                if (run === runs) {
                    process.exit(0);
                }
            }, 'finalized');
            const userXnRecord = await program.account.userEthXnRecord.fetch(userEthXnRecordAccount);
            process.stdout.write(`[ ] Tx=${Y}${mintTx}${U}, kind=${Y}${kind}${U}, nonce=${Y}${Buffer.from(globalXnRecordNew.nonce).toString("hex")}${U}, hashes=${Y}${userXnRecord.hashes}${U}, superhashes=${Y}${userXnRecord.superhashes}${U}\n`);
            currentRun++;
        }
        await new Promise(resolve => setTimeout(resolve, 30_000));
    }
    else {
        console.error('Unknown command:', cmd);
        process.exit(1);
    }
}
main().then(() => { })
    .catch(err => console.error(err));
