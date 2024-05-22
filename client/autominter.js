import { parentPort, workerData, threadId } from 'node:worker_threads';
import { AnchorProvider, setProvider, utils, Wallet, web3, workspace } from "@coral-xyz/anchor";
import { ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
dotenv.config();
const G = '\x1b[32m';
const Y = '\x1b[33m';
const U = '\x1b[39m';
const decimals = new BN(1_000_000_000);
let currentRun = 1;
const { kind = 1, autoMint, minerProgramId: pidStr, priorityFee, startSlot } = workerData || {};
const minerProgramId = new PublicKey(pidStr);
const i = kind;
const network = process.env.ANCHOR_PROVIDER_URL || 'localnet';
parentPort?.postMessage(`AM #${threadId}: Running mint for kind=${G}${kind}${U} every ${G}${autoMint}${U} slot(s), starting at ${G}${startSlot}${U}`);
const connection = new web3.Connection(network, 'confirmed');
const walletPath = process.env.USER_WALLET_PATH?.endsWith("/")
    ? process.env.USER_WALLET_PATH
    : process.env.USER_WALLET_PATH + '/';
const userKeyPairFileName = `${walletPath}id${i}.json`;
const userKeyPairString = fs.readFileSync(path.resolve(userKeyPairFileName), 'utf-8');
const keypair = web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(userKeyPairString)));
const wallet = new Wallet(keypair);
const provider = new AnchorProvider(connection, wallet);
setProvider(provider);
const program = workspace.SolXenMinter;
const [userSolXnRecordAccount] = web3.PublicKey.findProgramAddressSync([
    Buffer.from("xn-by-sol"),
    wallet.publicKey.toBuffer(),
    Buffer.from([kind]),
    new PublicKey(minerProgramId).toBuffer(),
], new PublicKey(minerProgramId));
const [userTokenRecordAccount] = web3.PublicKey.findProgramAddressSync([
    Buffer.from("sol-xen-minted"),
    wallet.publicKey.toBuffer(),
], program.programId);
const [mint] = web3.PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
const mintAccount = await getMint(provider.connection, mint);
const userTokenAccount = utils.token.associatedAddress({
    mint: mintAccount.address,
    owner: wallet.publicKey
});
let currentSlot = startSlot;
connection.onSlotChange(async ({ slot }) => {
    if (slot - currentSlot >= autoMint) {
        currentSlot = slot;
        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: priorityFee
        });
        // const totalSupplyPre = await connection.getTokenSupply(mintAccount.address);
        const userTokensRecordPre = await program.account.userTokensRecord.fetch(userTokenRecordAccount);
        const associateTokenProgram = new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
        const mintAccounts = {
            user: wallet.publicKey,
            mintAccount: mintAccount.address,
            userTokenAccount,
            userRecord: userSolXnRecordAccount,
            userTokenRecord: userTokenRecordAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            associateTokenProgram,
            minerProgram: new PublicKey(minerProgramId)
        };
        program.methods.mintTokens(kind)
            .accounts(mintAccounts)
            .signers([wallet.payer])
            .preInstructions([addPriorityFee])
            .rpc({ commitment: "confirmed" })
            .then((_) => {
            return connection.getTokenSupply(mintAccount.address)
                .then(totalSupply => {
                return program.account.userTokensRecord.fetch(userTokenRecordAccount)
                    .then(userTokensRecord => {
                    const delta = (userTokensRecord.tokensMinted.sub(userTokensRecordPre.tokensMinted).div(decimals)).toNumber();
                    const deltaStr = delta > 0 ? `${Y}(+${delta})${U}` : '';
                    const counters = userTokensRecord.pointsCounters.map(c => c.div(decimals).toNumber());
                    parentPort?.postMessage(`AM #${threadId}: balance @slot=${Y}${currentSlot}${U}: points=${G}${counters}${U}, tokens=${G}${userTokensRecord.tokensMinted.div(decimals).toNumber()}${U}${deltaStr}. Total supply=${G}${totalSupply.value.uiAmount}${U}`);
                });
            });
        })
            .catch(e => {
            parentPort?.postMessage(`AM #${threadId}: tx confirmation timeout`);
        });
    }
});
