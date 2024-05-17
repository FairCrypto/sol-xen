import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ComputeBudgetProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { AnchorProvider, setProvider, web3, Wallet, workspace, utils } from '@coral-xyz/anchor';
import * as fs from "node:fs";
import path from "node:path";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
dotenv.config();
var Cmd;
(function (Cmd) {
    Cmd["Mint"] = "mint";
    Cmd["Balance"] = "balance";
})(Cmd || (Cmd = {}));
const G = '\x1b[32m';
const Y = '\x1b[33m';
const U = '\x1b[39m';
async function main() {
    // PARSE CLI ARGS
    const [, , , ...params] = process.argv;
    let cmd;
    let priorityFee = 1;
    let kind;
    const yArgs = yargs(hideBin(process.argv))
        .command(Cmd.Mint, 'Mint solXEN tokens based on your hash points balance')
        .command(Cmd.Balance, 'Checks solXEN balance of an account')
        .option('priorityFee', {
        alias: 'f',
        type: 'number',
        default: 1,
        description: 'Solana priority fee, micro-lamports'
    })
        .option('kind', {
        alias: 'k',
        type: 'number',
        demandOption: true,
        description: 'Kind of miner (0, 1...)'
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
    // SETUP SOLANA ENVIRONMENT
    const minersStr = process.env.MINERS
        || 'Ahhm8H2g6vJ5K4KDLp8C9QNH6vvTft1J3NmUst3jeVvW,joPznefcUrbGq1sQ8ztxVSY7aeUUrTQmdTbmKuRkn8J,9kDwKaJFDsE152eBJGnv6e4cK4PgCGFvw6u6NTAiUroG,BSgU8KC6yNbany2cfPvYSHDVXNVxHgQAuifTSeo2kD99';
    const miners = minersStr.split(',').map(s => new web3.PublicKey(s));
    const minerProgramId = miners[kind];
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
    const program = workspace.SolXenMinter;
    console.log(`Program ID=${G}${program.programId}${U}`);
    if (!minerProgramId) {
        console.error("PROGRAM_ID_MINER is required in .env file");
        process.exit(1);
    }
    console.log(`Miner Program ID=${G}${minerProgramId}${U}`);
    const [userSolXnRecordAccount] = web3.PublicKey.findProgramAddressSync([
        Buffer.from("xn-by-sol"),
        user.publicKey.toBuffer(),
        Buffer.from([kind]),
        new PublicKey(minerProgramId).toBuffer(),
    ], new PublicKey(minerProgramId));
    const [userTokenRecordAccount] = web3.PublicKey.findProgramAddressSync([
        Buffer.from("sol-xen-minted"),
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
        const userTokensRecord = await program.account.userTokensRecord.fetch(userTokenRecordAccount);
        console.log(`User balance: points=${G}${userTokensRecord.pointsCounters}${U}, tokens=${G}${userTokensRecord.tokensMinted}${U}, supply=${G}${totalSupply.value.uiAmount}${U}`);
    }
    else if (cmd === Cmd.Mint) {
        console.log(`Running minter with params: priorityFee=${G}${priorityFee}${U}`);
        const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: priorityFee
        });
        const associateTokenProgram = new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
        const mintAccounts = {
            user: user.publicKey,
            mintAccount: mintAccount.address,
            userTokenAccount,
            userRecord: userSolXnRecordAccount,
            userTokenRecord: userTokenRecordAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            associateTokenProgram,
            minerProgram: new PublicKey(minerProgramId)
        };
        const mintTx = await program.methods.mintTokens(kind)
            .accounts(mintAccounts)
            .signers([user])
            .preInstructions([addPriorityFee])
            .rpc({ commitment: "confirmed" });
        const totalSupply = await connection.getTokenSupply(mintAccount.address);
        const userTokensRecord = await program.account.userTokensRecord.fetch(userTokenRecordAccount);
        console.log(`User balance: points=${G}${userTokensRecord.pointsCounters}${U}, tokens=${G}${userTokensRecord.tokensMinted}${U}, supply=${G}${totalSupply.value.uiAmount}${U}`);
    }
    else {
        console.error('Unknown command:', cmd);
        process.exit(1);
    }
}
main().then(() => { })
    .catch(err => console.error(err));
