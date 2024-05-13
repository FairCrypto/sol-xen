import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getAddress, isAddress } from 'viem';
import readline from 'readline';
import { ComputeBudgetProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, setProvider, web3, Wallet, workspace, utils } from '@coral-xyz/anchor';
import * as fs from "node:fs";
import path from "node:path";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
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
        .help()
        .parseSync();
    cmd = yArgs._[0];
    if (!cmd && params.length === 0) {
        // @ts-ignore
        yArgs.help();
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
    const program = workspace.SolXen;
    console.log(`Program ID=${G}${program.programId}${U}`);
    const [globalXnRecordAddress] = web3.PublicKey.findProgramAddressSync([
        Buffer.from("xn-global-counter"),
    ], program.programId);
    const ethAddress20 = Buffer.from(address.slice(2), 'hex');
    const [userEthXnRecordAccount] = web3.PublicKey.findProgramAddressSync([
        Buffer.from("xn-by-eth"),
        ethAddress20,
    ], program.programId);
    const [userSolXnRecordAccount] = web3.PublicKey.findProgramAddressSync([
        Buffer.from("xn-by-sol"),
        user.publicKey.toBuffer(),
    ], program.programId);
    const [mint] = web3.PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
    const mintAccount = await getMint(provider.connection, mint);
    const userTokenAccount = utils.token.associatedAddress({
        mint: mintAccount.address,
        owner: user.publicKey
    });
    // PROCESS COMMANDS
    if (cmd === Cmd.Balance) {
        const totalSupply = await connection.getTokenSupply(mintAccount.address);
        const globalXnRecord = await program.account.globalXnRecord.fetch(globalXnRecordAddress);
        console.log(`Global state: txs=${G}${globalXnRecord.txs}${U}, hashes=${G}${globalXnRecord.hashes}${U}, superhashes=${G}${globalXnRecord.superhashes}${U}, supply=${G}${totalSupply.value.uiAmount}${U}, amp=${G}${globalXnRecord.amp}${U}`);
        if (address) {
            const userTokenBalance = await connection.getTokenAccountBalance(userTokenAccount);
            const userXnRecord = await program.account.userEthXnRecord.fetch(userEthXnRecordAccount);
            console.log(`User state: hashes=${G}${userXnRecord.hashes}${U}, superhashes=${G}${userXnRecord.superhashes}${U}, balance=${G}${userTokenBalance.value.uiAmount}${U}`);
        }
        else {
            console.log("to show user balance, run with --address YOUR_ETH_ADDRESS key");
        }
    }
    else if (cmd === Cmd.Mine) {
        console.log(`Running miner with params: address=${G}${address}${U}, priorityFee=${G}${priorityFee}${U}, runs=${G}${runs}${U}`);
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
                mintAccount: mintAccount.address,
                userTokenAccount,
                xnByEth: userEthXnRecordAccount,
                xnBySol: userSolXnRecordAccount,
                globalXnRecord: globalXnRecordAddress,
                tokenProgram: TOKEN_PROGRAM_ID,
                associateTokenProgram
            };
            const mintTx = await program.methods.mintTokens({ address: Array.from(ethAddress20) })
                .accounts(mintAccounts)
                .signers([user])
                .preInstructions([modifyComputeUnits, addPriorityFee])
                .rpc({ commitment: "processed", skipPreflight: true });
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
            const userTokenBalance = await connection.getTokenAccountBalance(userTokenAccount);
            const totalSupply = await connection.getTokenSupply(mintAccount.address);
            const userXnRecord = await program.account.userEthXnRecord.fetch(userEthXnRecordAccount);
            process.stdout.write(`[ ] Tx=${Y}${mintTx}${U}, nonce=${Y}${Buffer.from(globalXnRecordNew.nonce).toString("hex")}${U}, hashes=${Y}${userXnRecord.hashes}${U}, superhashes=${Y}${userXnRecord.superhashes}${U}, balance=${Y}${(userTokenBalance.value.uiAmount || 0).toLocaleString()}${U} supply=${Y}${(totalSupply.value.uiAmount || 0).toLocaleString()}${U}\n`);
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
