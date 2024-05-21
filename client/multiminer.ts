import { Worker, isMainThread, type WorkerOptions } from 'worker_threads';
import dotenv from 'dotenv';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import {getAddress, isAddress, zeroAddress} from 'viem';
import readline from 'readline'

import {ComputeBudgetProgram, LAMPORTS_PER_SOL} from '@solana/web3.js';
import {AnchorProvider, setProvider, Program, web3, Wallet, workspace, Provider, getProvider,} from '@coral-xyz/anchor';
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

export type PDAParams = {
    programId: any;
    kind: number;
    address: `0x${string}`;
    wallet: Wallet
}

export const getPDAs = ({programId, kind, address, wallet}: PDAParams) => {
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
            wallet.publicKey.toBuffer(),
            Buffer.from([kind]),
            programId.toBuffer(),
        ],
        programId
    );

    return {
        globalXnRecordAddress,
        userEthXnRecordAccount,
        userSolXnRecordAccount,
        ethAddress20,
    }
}

export type Context = {
    program: Program<TMiner0 | TMiner1 | TMiner2 | TMiner3>,
    wallet: NodeWallet,
    provider: Provider
}
export const contexts = {} as Record<number, Context>;

async function main() {
    // PARSE CLI ARGS

    const [, , , ...params] = process.argv;
    let cmd: Cmd;
    let address: `0x${string}` = zeroAddress;
    let priorityFee: number = 1;
    let units: number = 1_200_000;
    let runs: number | null = null;
    let kind: number | null = null;
    let delay: number = 1;

    const yArgs = yargs(hideBin(process.argv))
        .command(Cmd.Mine, 'Mines points, redeemable for solXEN tokens, by looking for hash patterns')
        // .command(Cmd.Balance, 'Checks balance of a current account')
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
            description: 'Number of runs'
        })
        .option('kind', {
            alias: 'k',
            type: 'number',
            default: 0,
            description: 'Kind of miner (0, 1 ...). Multi mode if not specified'
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

    const minersStr = process.env.MINERS
        || 'H4Nk2SDQncEv5Cc6GAbradB4WLrHn7pi9VByFL9zYZcA,58UESDt7K7GqutuHBYRuskSgX6XoFe8HXjwrAtyeDULM,B1Dw79PE8dzpHPKjiQ8HYUBZ995hL1U32bUTRdNVtRbr,7ukQWD7UqoC61eATrBMrdfMrJMUuY1wuPTk4m4noZpsH';

    const miners = minersStr.split(',').map(s => new web3.PublicKey(s));

    // SETUP SOLANA ENVIRONMENT

    const network = process.env.ANCHOR_PROVIDER_URL || 'localnet';
    console.log(`\nRunning on ${G}${network}${U}`)
    const connection = new web3.Connection(network, 'processed');

    // Load user wallet keypair
    let user: web3.Keypair;
    if (process.env.USER_WALLET_PATH) {
        // normalize path
        const walletPath = process.env.USER_WALLET_PATH.endsWith("/")
            ? process.env.USER_WALLET_PATH
            : process.env.USER_WALLET_PATH + '/';

        for (const i of [0, 1, 2, 3]) {
            const userKeyPairFileName = `${walletPath}id${i}.json`;
            try {
                const userKeyPairString = fs.readFileSync(path.resolve(userKeyPairFileName), 'utf-8');
                const keypair = web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(userKeyPairString)))
                const wallet = new Wallet(keypair) as NodeWallet;
                const balance = await connection.getBalance(wallet.publicKey).then((b) => b / LAMPORTS_PER_SOL);
                console.log(`Using user Wallet #${i} ${G}${keypair.publicKey.toBase58()}${U} (auto-mapped), balance=${G}${balance}${U}`);
                const provider = new AnchorProvider(
                    connection,
                    wallet,
                    // AnchorProvider.defaultOptions(),
                );
                setProvider(provider)
                let program;
                if (i === 0) {
                    program = workspace.SolXenMiner0 as Program<TMiner0>;
                } else if (i === 1) {
                    program = workspace.SolXenMiner1 as Program<TMiner1>;
                } else if (i === 2) {
                    program = workspace.SolXenMiner2 as Program<TMiner2>;
                } else {
                    program = workspace.SolXenMiner3 as Program<TMiner3>;
                }
                contexts[i] = { wallet, program, provider }
            } catch (e: any) {
                if (e.code === 'ENOENT') {}
                else { console.log(e); }
            }
        }
    } else {
        console.error('User wallet not provided or not found. \nSet USER_WALLET=/path/to/id.json or \nSet USER_WALLET_PATH=/path/to/all/wallets/ to map to "kind" param in .env file')
        process.exit(1);
    }
    console.log(`Found ${Object.values(contexts).length} wallets`);

    // check balance
    console.log(`Block height=${G}${await connection.getBlockHeight()}${U}`);

    // PROCESS COMMANDS

    if (cmd === Cmd.Mine) {

        console.log(`Running miner with params: address=${G}${address}${U}, priorityFee=${G}${priorityFee}${U}, runs=${G}${runs ? runs : 'auto'}${U}, delay=${G}${delay}${U}`);
        console.log(`Using CU max=${G}${units}${U}`);

        const associateTokenProgram = new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")

        if (isMainThread) {
            for (const [currentKind] of Object.entries(contexts)) {
                const worker = new Worker('./client/runner.ts', {
                    stdout: true,
                    stderr: true,
                    workerData: {
                        kind: Number(currentKind),
                        runs,
                        address,
                        delay,
                        priorityFee,
                        units
                    },
                } as WorkerOptions);
                worker.on("message", console.log);
                worker.on("error", console.error);
                worker.on("exit", (code: number) => {
                    if (code !== 0)
                        console.error(`Worker stopped with exit code ${code}`);
                    else
                        console.log('Worker exited')
                });
            }
        }
    } else {
        console.error('Unknown command:', cmd)
        process.exit(1)
    }

}

main().then(() => {})
    .catch(err => console.error(err));