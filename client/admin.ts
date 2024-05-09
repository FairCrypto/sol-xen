import {ComputeBudgetProgram} from '@solana/web3.js';
import {AnchorProvider, setProvider, Program, web3, Wallet, workspace, utils} from '@coral-xyz/anchor';
import * as fs from "node:fs";
import path from "node:path";
import * as os from "node:os";
import dotenv from "dotenv";
import {getMint, TOKEN_PROGRAM_ID} from "@solana/spl-token";
import {SolXen} from '../target/types/sol_xen';

dotenv.config();

async function main() {
    // Set this to your local cluster or mainnet-beta, testnet, devnet
    const network = process.env.ANCHOR_PROVIDER_URL || '';
    const connection = new web3.Connection(network, 'processed');

    const keyPairFileName = process.env.ANCHOR_WALLET || '';
    const keyPairString = fs.readFileSync(path.resolve(keyPairFileName), 'utf-8');
    const keyPair = web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(keyPairString)));
    console.log('Using wallet', keyPair.publicKey.toBase58());
    const wallet = new Wallet(keyPair);

    // Create and set the provider
    const provider = new AnchorProvider(
        connection,
        wallet,
        // AnchorProvider.defaultOptions(),
    );
    setProvider(provider);

    // check balance
    console.log('Block height:', await connection.getBlockHeight());
    console.log('Balance:', await connection.getBalance(keyPair.publicKey));

    // Load the program
    const program = workspace.SolXen as Program<SolXen>;

    // Load or create a random account for a test user
    let user: web3.Keypair;
    if (process.env.USER_WALLET) {
        const userKeyPairFileName = process.env.USER_WALLET;
        const userKeyPairString = fs.readFileSync(path.resolve(userKeyPairFileName), 'utf-8');
        user = web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(userKeyPairString)));
        console.log('Using user wallet', user.publicKey.toBase58());
    } else {
        user = web3.Keypair.generate()
        console.log('Using random user', user.publicKey.toBase58());
    }

    // send user some lamports
    const tx2 = new web3.Transaction().add(
        web3.SystemProgram.transfer({
            fromPubkey: keyPair.publicKey,
            toPubkey: user.publicKey,
            lamports: web3.LAMPORTS_PER_SOL,
        })
    );
    // Sign transaction, broadcast, and confirm
    const sig2 = await web3.sendAndConfirmTransaction(connection, tx2, [keyPair]);
    console.log('Tx2 hash', sig2);
    console.log('Admin Balance:', await connection.getBalance(keyPair.publicKey));
    console.log('User Balance:', await connection.getBalance(user.publicKey));

    const METADATA_SEED = "metadata";
    const TOKEN_METADATA_PROGRAM_ID = new web3.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");


    const [mint] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("mint")],
        program.programId
    );

    const [metadataAddress] = web3.PublicKey.findProgramAddressSync(
        [
            Buffer.from(METADATA_SEED),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
    );

    const createAccounts = {
        admin: provider.wallet.publicKey,
        metadata: metadataAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
    };

    const metadata = {
        name: "solXEN (epsilon)",
        symbol: "solXENe2",
        uri: "",
        decimals: 9,
    }

    // Send the mint transaction (as Admin)
    const hash = await program.methods.createMint(metadata).accounts(createAccounts).signers([]).rpc();
    console.log('Create Mint tx hash', hash)

    const mintAccount = await getMint(provider.connection, mint);
    console.log(mintAccount.address.toBase58())

}

main().then(() => console.log('Done'))
    .catch(err => console.error(err));
