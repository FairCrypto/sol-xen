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

type Context = {
    program: Program<TMiner0 | TMiner1 | TMiner2 | TMiner3>,
    wallet: NodeWallet,
    provider: Provider
}

type PDAParams = {
    programId: any;
    kind: number;
    address: `0x${string}`;
    wallet: Wallet
}

const contexts = {} as Record<number, Context>;

const getPDAs = ({ programId, kind, address, wallet }: PDAParams) => {
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
        .command(Cmd.Balance, 'Checks balance of a current account')
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
    } else if (process.env.USER_WALLET) {
        const userKeyPairFileName = process.env.USER_WALLET;
        try {
            const userKeyPairString = fs.readFileSync(path.resolve(userKeyPairFileName), 'utf-8');
            user = web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(userKeyPairString)));
        } catch (e) {
            console.error(e)
            process.exit(1)
        }
        const wallet = new Wallet(user) as NodeWallet;
        const balance = await connection.getBalance(wallet.publicKey).then((b) => b / LAMPORTS_PER_SOL);
        console.log(`Using user Wallet ${G}${wallet.publicKey.toBase58()}${U}, balance=${G}${balance}${U}`);
        const provider = new AnchorProvider(
            connection,
            wallet,
            // AnchorProvider.defaultOptions(),
        );
        setProvider(provider);
        let program;
        if (kind === 0) {
            program = workspace.SolXenMiner0 as Program<TMiner0>;
        } else if (kind === 1) {
            program = workspace.SolXenMiner1 as Program<TMiner1>;
        } else if (kind === 2) {
            program = workspace.SolXenMiner2 as Program<TMiner2>;
        } else if (kind == 3) {
            program = workspace.SolXenMiner3 as Program<TMiner3>;
        } else {
            console.log('Specific valid "kind" needs to be used with USER_WALLET env var');
            process.exit(1)
        }
        contexts[kind] = {
            wallet,
            program,
            provider
        }
    } else {
        console.error('User wallet not provided or not found. \nSet USER_WALLET=/path/to/id.json or \nSet USER_WALLET_PATH=/path/to/all/wallets/ to map to "kind" param in .env file')
        process.exit(1);
    }

    console.log(`Found ${Object.values(contexts).length} wallets`);

    const currentContext = Object.values(contexts)[0] as Context;
    const currentKind = Number(Object.keys(contexts));
    let program = currentContext.program;
    const programId = miners[kind || currentKind];

    // if (Object.values(contexts).length === 1) {
        setProvider(currentContext.provider);
    // }

    // check balance
    console.log(`Block height=${G}${await connection.getBlockHeight()}${U}`);

    // Load the program
    console.log(`Miner program ID=${program.programId}`);
    // process.exit(0)


    // PROCESS COMMANDS

    if (cmd === Cmd.Balance) {

        const {
            globalXnRecordAddress,
            userEthXnRecordAccount,
            userSolXnRecordAccount
        } = getPDAs({
            programId,
            kind: kind || currentKind,
            address,
            wallet: currentContext.wallet
        })

        const globalXnRecord = await program.account.globalXnRecord.fetch(globalXnRecordAddress);
        console.log(`Global state: amp=${G}${globalXnRecord.amp}${U}`)

        if (address) {
            const userXnRecord = await program.account.userEthXnRecord.fetch(userEthXnRecordAccount);
            console.log(`User state: hashes=${G}${userXnRecord.hashes}${U}, superhashes=${G}${userXnRecord.superhashes}${U}`)
        } else {
            console.log("to show user balance, run with --address YOUR_ETH_ADDRESS key")
        }

    } else if (cmd === Cmd.Mine) {

        console.log(`Running miner with params: address=${G}${address}${U}, priorityFee=${G}${priorityFee}${U}, runs=${G}${runs?runs:'auto'}${U}, delay=${G}${delay}${U}`);
        console.log(`Using CU max=${G}${units}${U}`);
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units
        });
        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: priorityFee
        });

        const associateTokenProgram = new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
        let currentRun = 1;

        while (runs ? currentRun <= runs : true) {
            const run = currentRun;
            const currentKindIdx = kind || (run % Object.keys(contexts).length);
            const currentKind = Number(Object.keys(contexts)[currentKindIdx]);
            // console.log("current kind", currentKind)
            const currentContext = Object.values(contexts)[currentKindIdx] as Context;
            // console.log("current ctx", currentContext.wallet.publicKey.toBase58())
            let program = currentContext.program;
            const programId = program.programId; //  miners[kind || currentKind];
            // setProvider(currentContext.provider);
            // console.log(program.provider.connection.rpcEndpoint, programId.toBase58(), program.programId.toBase58())

            const {
                globalXnRecordAddress,
                userEthXnRecordAccount,
                userSolXnRecordAccount,
                ethAddress20
            } = getPDAs({
                programId,
                kind: currentKind,
                address,
                wallet: currentContext.wallet
            })
            const globalXnRecordNew = await program.account.globalXnRecord.fetch(globalXnRecordAddress);

            const mintAccounts = {
                user: currentContext.wallet.publicKey,
                xnByEth: userEthXnRecordAccount,
                xnBySol: userSolXnRecordAccount,
                globalXnRecord: globalXnRecordAddress,
                programId
            };
            const ethAddr = {
                address: Array.from(ethAddress20),
                addressStr: address
            };
            const mintTx = await program.methods.mineHashes(ethAddr, currentKind)
                .accounts(mintAccounts)
                .signers([currentContext.wallet.payer])
                .preInstructions([modifyComputeUnits, addPriorityFee])
                .rpc({ commitment: "processed" });
            await new Promise(resolve => setTimeout(resolve, delay * 1000));

            connection.onSignature(mintTx, (...params) => {
                readline.moveCursor(process.stdout, 0, run - currentRun);
                readline.cursorTo(process.stdout, 1);
                process.stdout.write(`.`);
                readline.moveCursor(process.stdout, 0, currentRun - run - 1);
                console.log();
            }, 'processed')
            connection.onSignature(mintTx, (...params) => {
                readline.moveCursor(process.stdout, 0, run - currentRun);
                readline.cursorTo(process.stdout, 1);
                process.stdout.write(`.`);
                readline.moveCursor(process.stdout, 0, currentRun - run - 1);
                console.log();
            }, 'confirmed')
            connection.onSignature(mintTx, (...params) => {
                readline.moveCursor(process.stdout, 0, run - currentRun);
                readline.cursorTo(process.stdout, 1);
                process.stdout.write(`X`);
                readline.moveCursor(process.stdout, 0, currentRun - run - 1);
                console.log();
                if (run === runs) {
                    console.log(run, runs)
                    process.exit(0);
                }
            }, 'finalized')

            const userXnRecord = await program.account.userEthXnRecord.fetch(userEthXnRecordAccount);
            process.stdout.write(`[ ] Tx=${Y}${mintTx}${U}, kind=${Y}${currentKind}${U}, nonce=${Y}${Buffer.from(globalXnRecordNew.nonce).toString("hex")}${U}, hashes=${Y}${userXnRecord.hashes}${U}, superhashes=${Y}${userXnRecord.superhashes}${U}\n`);
            currentRun++;
        }
        await new Promise(resolve => setTimeout(resolve, 30_000))
    } else {
        console.error('Unknown command:', cmd)
        process.exit(1)
    }

}

main().then(() => {})
    .catch(err => console.error(err));