import { ComputeBudgetProgram } from '@solana/web3.js';
import { AnchorProvider, setProvider, web3, Wallet, workspace, utils } from '@coral-xyz/anchor';
import * as fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
dotenv.config();
async function main() {
    // Set this to your local cluster or mainnet-beta, testnet, devnet
    const network = process.env.ANCHOR_PROVIDER_URL || '';
    const connection = new web3.Connection(network, 'processed');
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000
    });
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1
    });
    // Load or create a random account for a test user
    let user;
    if (process.env.USER_WALLET) {
        const userKeyPairFileName = process.env.USER_WALLET;
        const userKeyPairString = fs.readFileSync(path.resolve(userKeyPairFileName), 'utf-8');
        user = web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(userKeyPairString)));
        console.log('Using user wallet', user.publicKey.toBase58());
    }
    else {
        user = web3.Keypair.generate();
        console.log('Using random user', user.publicKey.toBase58());
    }
    // Update this to the ID of your deployed program
    const wallet = new Wallet(user);
    // Create and set the provider
    const provider = new AnchorProvider(connection, wallet);
    setProvider(provider);
    // check balance
    console.log('Block height:', await connection.getBlockHeight());
    console.log('Balance:', await connection.getBalance(user.publicKey));
    // Load the program
    const program = workspace.SolXen;
    const [mint] = web3.PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
    const mintAccount = await getMint(provider.connection, mint);
    const associateTokenProgram = new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
    const userTokenAccount = utils.token.associatedAddress({
        mint: mintAccount.address,
        owner: user.publicKey
    });
    const [globalXnRecordAddress] = web3.PublicKey.findProgramAddressSync([
        Buffer.from("xn-global-counter"),
    ], program.programId);
    // send some test transactions as a user
    for await (const ethAddress of [
        '6B889Dcfad1a6ddf7dE3bC9417F5F51128efc964',
        '7B889Dcfad1a6ddf7dE3bC9417F5F51128efc964',
        '8B889Dcfad1a6ddf7dE3bC9417F5F51128efc964',
        '9B889Dcfad1a6ddf7dE3bC9417F5F51128efc964',
        'aB889Dcfad1a6ddf7dE3bC9417F5F51128efc964',
    ]) {
        const ethAddress20 = Buffer.from(ethAddress, 'hex');
        const [userXnRecordAccount] = web3.PublicKey.findProgramAddressSync([
            Buffer.from("sol-xen"),
            ethAddress20,
        ], program.programId);
        const mintAccounts = {
            user: user.publicKey,
            mintAccount: mintAccount.address,
            userTokenAccount,
            userXnRecord: userXnRecordAccount,
            globalXnRecord: globalXnRecordAddress,
            tokenProgram: TOKEN_PROGRAM_ID,
            associateTokenProgram
        };
        const mintTx = await program.methods.mintTokens({ address: Array.from(ethAddress20) })
            .accounts(mintAccounts)
            .signers([user])
            .preInstructions([modifyComputeUnits, addPriorityFee])
            .rpc();
        const userTokenBalance = await connection.getTokenAccountBalance(userTokenAccount);
        console.log('mint tx', mintTx);
        console.log('Token Balance', userTokenBalance.value.uiAmount);
        // Fetch the user counter value
        // const value1 = await program.account.xnRecord.fetch(userXnRecord);
        // console.log('Stored User Counter:', value1.points, userXnRecord.toBase58());
        // Fetch the global counter value
        // const value2 = await program.account.xnRecord.fetch(globalXnRecord);
        // console.log('Stored Global Counter:', value2.points);
    }
}
main().then(() => console.log('Test run complete'))
    .catch(err => console.error(err));
