import { parentPort, workerData, threadId } from 'node:worker_threads';
import { AnchorProvider, setProvider, Wallet, web3, workspace } from "@coral-xyz/anchor";
import { ComputeBudgetProgram, TransactionExpiredTimeoutError } from "@solana/web3.js";
import { getPDAs } from "./multiminer.js";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
dotenv.config();
const G = '\x1b[32m';
const Y = '\x1b[33m';
const U = '\x1b[39m';
// parentPort?.postMessage({...workerData, threadId})
let currentRun = 1;
const { kind = 1, runs, address, delay = 0.5, priorityFee = 100000, units } = workerData || {};
const i = kind;
const network = process.env.ANCHOR_PROVIDER_URL || 'localnet';
const connection = new web3.Connection(network, 'processed');
const walletPath = process.env.USER_WALLET_PATH?.endsWith("/")
    ? process.env.USER_WALLET_PATH
    : process.env.USER_WALLET_PATH + '/';
const userKeyPairFileName = `${walletPath}id${i}.json`;
const userKeyPairString = fs.readFileSync(path.resolve(userKeyPairFileName), 'utf-8');
const keypair = web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(userKeyPairString)));
const wallet = new Wallet(keypair);
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
parentPort?.postMessage(`Runner #${threadId}: Miner PID=${program.programId.toBase58()}, kind=${kind}`);
const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
    units
});
const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: priorityFee
});
setInterval(() => {
    if (!!runs && currentRun > runs) {
        parentPort?.postMessage(`Runner #${threadId}: Done after ${runs} runs`);
        process.exit(0);
    }
    const programId = program.programId; //  miners[kind || currentKind];)
    const { globalXnRecordAddress, userEthXnRecordAccount, userSolXnRecordAccount, ethAddress20 } = getPDAs({
        programId,
        kind,
        address,
        wallet
    });
    // const globalXnRecordNew =  program.account.globalXnRecord.fetch(globalXnRecordAddress);
    const mintAccounts = {
        user: wallet.publicKey,
        xnByEth: userEthXnRecordAccount,
        xnBySol: userSolXnRecordAccount,
        globalXnRecord: globalXnRecordAddress,
        programId
    };
    const ethAddr = {
        address: Array.from(ethAddress20),
        addressStr: address
    };
    program.methods.mineHashes(ethAddr, kind)
        .accounts(mintAccounts)
        .signers([wallet.payer])
        .preInstructions([modifyComputeUnits, addPriorityFee])
        .rpc()
        .then(async (mintTx) => {
        const userXnRecord = await program.account.userEthXnRecord.fetch(userEthXnRecordAccount);
        parentPort?.postMessage(`Tx=${Y}${mintTx}${U}, kind=${Y}${kind}${U}, hashes=${Y}${userXnRecord.hashes}${U}, superhashes=${Y}${userXnRecord.superhashes}${U}`);
    })
        .then(_ => { currentRun++; })
        .catch((e) => {
        if (e instanceof TransactionExpiredTimeoutError) {
            const txSig = [...(e.message.matchAll(/signature (.*) using/gm) || [])][0][1];
            parentPort?.postMessage(`Tx=${Y}${txSig}${U} still pending after timeout`);
        }
        else {
            parentPort?.postMessage(e.message);
        }
    });
}, delay * 1_000);
