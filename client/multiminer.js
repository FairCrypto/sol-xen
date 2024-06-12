import { Worker, isMainThread } from 'worker_threads';
import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getAddress, isAddress, zeroAddress } from 'viem';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
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
export const getPDAs = ({ programId, kind, address, wallet }) => {
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
        wallet.publicKey.toBuffer(),
        Buffer.from([kind]),
        programId.toBuffer(),
    ], programId);
    return {
        globalXnRecordAddress,
        userEthXnRecordAccount,
        userSolXnRecordAccount,
        ethAddress20,
    };
};
export const contexts = {};
async function main() {
    // PARSE CLI ARGS
    const [, , , ...params] = process.argv;
    let cmd;
    let address = zeroAddress;
    let priorityFee = 1;
    let units = 1_180_000;
    let runs = null;
    let kind = null;
    let delay = 1;
    let autoMint = 1000;
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
        .option('autoMint', {
        alias: 'a',
        type: 'number',
        default: 1000,
        description: 'Auto mint every N slots (0 == no auto mint)'
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
    if (yArgs.autoMint !== null && typeof yArgs.autoMint !== 'undefined') {
        autoMint = Number(yArgs.autoMint);
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
    const minersStr = process.env.MINERS || 'B8HwMYCk1o7EaJhooM4P43BHSk5M8zZHsTeJixqw7LMN,2Ewuie2KnTvMLwGqKWvEM1S2gUStHzDUfrANdJfu45QJ,5dxcK28nyAJdK9fSFuReRREeKnmAGVRpXPhwkZxAxFtJ,DdVCjv7fsPPm64HnepYy5MBfh2bNfkd84Rawey9rdt5S';
    const miners = minersStr.split(',').map(s => new web3.PublicKey(s));
    // SETUP SOLANA ENVIRONMENT
    const network = process.env.ANCHOR_PROVIDER_URL || 'localnet';
    console.log(`\nRunning on ${G}${network}${U}`);
    const connection = new web3.Connection(network, 'processed');
    // Load user wallet keypair
    let user;
    if (process.env.USER_WALLET_PATH) {
        // normalize path
        const walletPath = process.env.USER_WALLET_PATH.endsWith("/")
            ? process.env.USER_WALLET_PATH
            : process.env.USER_WALLET_PATH + '/';
        for (const i of [0, 1, 2, 3]) {
            const userKeyPairFileName = `${walletPath}id${i}.json`;
            try {
                const userKeyPairString = fs.readFileSync(path.resolve(userKeyPairFileName), 'utf-8');
                const keypair = web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(userKeyPairString)));
                const wallet = new Wallet(keypair);
                const balance = await connection.getBalance(wallet.publicKey).then((b) => b / LAMPORTS_PER_SOL);
                console.log(`Using user Wallet #${i} ${G}${keypair.publicKey.toBase58()}${U} (auto-mapped), balance=${G}${balance}${U}`);
                const provider = new AnchorProvider(connection, wallet);
                setProvider(provider);
                let program;
                if (i === 0) {
                    program = workspace.SolXenMiner0;
                }
                else if (i === 1) {
                    program = workspace.SolXenMiner1;
                }
                else if (i === 2) {
                    program = workspace.SolXenMiner2;
                }
                else {
                    program = workspace.SolXenMiner3;
                }
                contexts[i] = { wallet, program, provider };
            }
            catch (e) {
                if (e.code === 'ENOENT') { }
                else {
                    console.log(e);
                }
            }
        }
    }
    else {
        console.error('User wallet not provided or not found. \nSet USER_WALLET=/path/to/id.json or \nSet USER_WALLET_PATH=/path/to/all/wallets/ to map to "kind" param in .env file');
        process.exit(1);
    }
    console.log(`Found ${Object.values(contexts).length} wallets`);
    // check balance
    console.log(`Block height=${G}${await connection.getBlockHeight()}${U}`);
    // PROCESS COMMANDS
    if (cmd === Cmd.Mine) {
        console.log(`Running miner with params: address=${G}${address}${U}, priorityFee=${G}${priorityFee}${U}, runs=${G}${runs ? runs : 'auto'}${U}, delay=${G}${delay}${U}`);
        console.log(`Using CU max=${G}${units}${U}`);
        const associateTokenProgram = new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
        if (isMainThread) {
            for (const [currentKind] of Object.entries(contexts)) {
                let autoMinter;
                // launch miner runners
                const runner = new Worker('./client/runner.js', {
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
                });
                runner.on("message", console.log);
                runner.on("error", console.error);
                runner.on("exit", (code) => {
                    if (code !== 0)
                        console.error(`Runner stopped with exit code ${code}`);
                    else
                        console.log('Runner completed all runs');
                    if (autoMinter) {
                        autoMinter.terminate();
                    }
                });
                if (autoMint > 0) {
                    // launch autominters
                    autoMinter = new Worker('./client/autominter.js', {
                        stdout: true,
                        stderr: true,
                        workerData: {
                            kind: Number(currentKind),
                            autoMint,
                            priorityFee,
                            minerProgramId: miners[Number(currentKind)].toBase58(),
                            startSlot: await connection.getSlot('confirmed')
                        },
                    });
                    autoMinter.on("message", console.log);
                    autoMinter.on("error", console.error);
                    autoMinter.on("exit", (code) => {
                        if (code !== 0)
                            console.error(`Auto-Minter stopped with exit code ${code}`);
                        else
                            console.log('Auto-Minter exited');
                    });
                }
            }
        }
    }
    else {
        console.error('Unknown command:', cmd);
        process.exit(1);
    }
}
main().then(() => { })
    .catch(err => console.error(err));
