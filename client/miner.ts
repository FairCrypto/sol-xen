import dotenv from 'dotenv';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import { getAddress, isAddress } from 'viem';
import readline from 'readline'

import {ComputeBudgetProgram, ConfirmOptions, LAMPORTS_PER_SOL} from '@solana/web3.js';
import {AnchorProvider, setProvider, Program, web3, Wallet, workspace,} from '@coral-xyz/anchor';
import * as fs from "node:fs";
import path from "node:path";

import {SolXenMiner as TMiner0} from '../target/types/sol_xen_miner_0';
import {SolXenMiner as TMiner1} from '../target/types/sol_xen_miner_1';
import {SolXenMiner as TMiner2} from '../target/types/sol_xen_miner_2';
import {SolXenMiner as TMiner3} from '../target/types/sol_xen_miner_3';
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";

dotenv.config();

enum Cmd {
    Mine = 'mine',
    Balance = 'balance',
}

const G = '\x1b[32m';
const Y = '\x1b[33m';
const U = '\x1b[39m';

async function main() {
    // PARSE CLI ARGS

    const [, , , ...params] = process.argv;
    let cmd: Cmd;
    let address: string = '';
    let priorityFee: number = 1;
    let units: number = 1_180_000;
    let runs: number = 1;
    let kind: number;
    let delay: number = 1;

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
        .parseSync()

    cmd = yArgs._[0] as Cmd;

    if (!cmd && params.length === 0) {
        // @ts-ignore
        yArgs.help();
        process.exit(1)
    }

    if (yArgs.kind !== null && typeof yArgs.kind !== 'undefined') {
        kind = Number(yArgs.kind)
        if (kind < 0 || kind > 3) {
            console.log("Wrong kind")
            process.exit(1)
        }
    } else {
        console.log("Kind param is required")
        process.exit(1)
    }

    if (yArgs.priorityFee) {
        priorityFee = Number(yArgs.priorityFee)
    }

    if (yArgs.units) {
        units = Number(yArgs.units)
    }

    if (yArgs.runs) {
        runs = Number(yArgs.runs)
    }

    if (yArgs.delay) {
        delay = Number(yArgs.delay)
    }

    if (yArgs.address) {
        try {
            address = getAddress(yArgs.address)
            if (!isAddress(address, { strict: true })) {
                console.error("Address malformed")
                process.exit(1)
            }
        } catch (e: any) {
            console.error(e.message);
            process.exit(1)
        }
    }

    const minersStr = process.env.MINERS || 'B8HwMYCk1o7EaJhooM4P43BHSk5M8zZHsTeJixqw7LMN,2Ewuie2KnTvMLwGqKWvEM1S2gUStHzDUfrANdJfu45QJ,5dxcK28nyAJdK9fSFuReRREeKnmAGVRpXPhwkZxAxFtJ,DdVCjv7fsPPm64HnepYy5MBfh2bNfkd84Rawey9rdt5S';

    const miners = minersStr.split(',').map(s => new web3.PublicKey(s));
    const programId = miners[kind];

    // SETUP SOLANA ENVIRONMENT

    const network = process.env.ANCHOR_PROVIDER_URL || 'localnet';
    console.log(`\nRunning on ${G}${network}${U}`)
    const connection = new web3.Connection(network, 'processed');

    // Load user wallet keypair
    let user: web3.Keypair;
    if (process.env.USER_WALLET) {
        const userKeyPairFileName = process.env.USER_WALLET;
        const userKeyPairString = fs.readFileSync(path.resolve(userKeyPairFileName), 'utf-8');
        user = web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(userKeyPairString)));
        console.log(`Using user wallet ${G}${user.publicKey.toBase58()}${U}`);
    } else if (process.env.USER_WALLET_PATH) {
        // normalize path
        const walletPath = process.env.USER_WALLET_PATH.endsWith("/")
            ? process.env.USER_WALLET_PATH
            : process.env.USER_WALLET_PATH + '/';
        const userKeyPairFileName = `${walletPath}id${kind}.json`;
        const userKeyPairString = fs.readFileSync(path.resolve(userKeyPairFileName), 'utf-8');
        user = web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(userKeyPairString)));
        console.log(`Using user wallet ${G}${user.publicKey.toBase58()}${U} (auto-mapped)`);
    } else {
        console.error('User wallet not provided or not found. \nSet USER_WALLET=/path/to/id.json or \nSet USER_WALLET_PATH=/path/to/all/wallets/ to map to "kind" param in .env file')
        process.exit(1);
    }

    // Update this to the ID of your deployed program
    const wallet = new NodeWallet(user);

    // Create and set the provider
    const anchorOptions = {
        // ...AnchorProvider.defaultOptions(),
        skipPreflight: false,
        commitment: 'processed',
        preflightCommitment: 'processed',
        maxRetries: 10,
        // minContextSlot: 0
    } as ConfirmOptions

    const provider = new AnchorProvider(
        connection,
        wallet,
        anchorOptions
    );
    setProvider(provider);

    // check balance
    console.log(`Block height=${G}${await connection.getBlockHeight()}${U}`);
    console.log(`SOL balance=${G}${await connection.getBalance(user.publicKey).then((b) => b / LAMPORTS_PER_SOL)}${U}`);

    // Load the program
    let program;
    if (kind === 0) {
        program = workspace.SolXenMiner0 as Program<TMiner0>;
    } else if (kind === 1) {
        program = workspace.SolXenMiner1 as Program<TMiner1>;
    } else if (kind === 2) {
        program = workspace.SolXenMiner2 as Program<TMiner2>;
    } else {
        program = workspace.SolXenMiner3 as Program<TMiner3>;
    }
    console.log(`Miner program ID=${G}${programId}${U}, Anchor program ID=${program.programId}`);

    const [globalXnRecordAddress] = web3.PublicKey.findProgramAddressSync(
        [
            Buffer.from("xn-miner-global"),
            Buffer.from([kind]),
        ],
        programId
    );

    const ethAddress20 = Buffer.from(address.slice(2), 'hex')
    const [userEthXnRecordAccount] = web3.PublicKey.findProgramAddressSync(
        [
            Buffer.from("xn-by-eth"),
            ethAddress20,
            Buffer.from([kind]),
            programId.toBuffer(),
        ],
        programId
    );

    const [userSolXnRecordAccount] = web3.PublicKey.findProgramAddressSync(
        [
            Buffer.from("xn-by-sol"),
            user.publicKey.toBuffer(),
            Buffer.from([kind]),
            programId.toBuffer(),
        ],
        programId
    );

    // PROCESS COMMANDS

    if (cmd === Cmd.Balance) {

        const globalXnRecord = await program.account.globalXnRecord.fetch(globalXnRecordAddress);
        console.log(`Global state: amp=${G}${globalXnRecord.amp}${U}`)

        if (address) {
            const userXnRecord = await program.account.userEthXnRecord.fetch(userEthXnRecordAccount);
            console.log(`User state: hashes=${G}${userXnRecord.hashes}${U}, superhashes=${G}${userXnRecord.superhashes}${U}`)
        } else {
            console.log("to show user balance, run with --address YOUR_ETH_ADDRESS key")
        }
    } else if (cmd === Cmd.Mine) {

        console.log(`Running miner with params: address=${G}${address}${U}, priorityFee=${G}${priorityFee}${U}, runs=${G}${runs}${U}, delay=${G}${delay}${U}`);
        console.log(`Using CU max=${G}${units}${U}`);
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units
        });
        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: priorityFee
        });

        const associateTokenProgram = new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
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
            const ethAddr = { address: Array.from(ethAddress20), addressStr: address };
            try {
                process.stdout.write(`[ ] Waiting for tx\r`);
                currentRun++;
                const mintTx = await program.methods.mineHashes(ethAddr, kind)
                    .accounts(mintAccounts)
                    .signers([user])
                    .preInstructions([modifyComputeUnits, addPriorityFee])
                    .rpc(anchorOptions);

                /*
                connection.onSignature(mintTx, (...params) => {
                    readline.moveCursor(process.stdout, 0, run - currentRun);
                    readline.cursorTo(process.stdout, 1);
                    process.stdout.write(`.`);
                    readline.moveCursor(process.stdout, 0, currentRun - run - 1);
                }, 'singleGossip')
                 */
                connection.onSignature(mintTx, (...params) => {
                    readline.moveCursor(process.stdout, 0, run - currentRun);
                    readline.cursorTo(process.stdout, 1);
                    process.stdout.write(`X`);
                    readline.moveCursor(process.stdout, 0, currentRun - run - 1);
                    console.log();
                    if (run === runs) {
                        process.exit(0);
                    }
                }, 'finalized')

                const userXnRecord = await program.account.userEthXnRecord.fetch(userEthXnRecordAccount);
                process.stdout.write(`[ ] Tx=${Y}${mintTx}${U}, kind=${Y}${kind}${U}, nonce=${Y}${Buffer.from(globalXnRecordNew.nonce).toString("hex")}${U}, hashes=${Y}${userXnRecord.hashes}${U}, superhashes=${Y}${userXnRecord.superhashes}${U}\n`);
                await new Promise(resolve => setTimeout(resolve, delay * 1000));
            } catch (e) {
                process.stdout.write(`[-] Skipped due to timeout\n`);
                // console.log();
            }
        }
        await new Promise(resolve => setTimeout(resolve, 30_000))
    } else {
        console.error('Unknown command:', cmd)
        process.exit(1)
    }

}

main().then(() => {})
    .catch(err => console.error(err));
