import {SystemProgram} from '@solana/web3.js';
import {AnchorProvider, setProvider, Program, web3, Wallet, workspace, utils} from '@coral-xyz/anchor';
import * as fs from "node:fs";
import path from "node:path";
import * as os from "node:os";
import dotenv from "dotenv";
import {getMint, TOKEN_PROGRAM_ID} from "@solana/spl-token";
import {SolXenMinter} from '../target/types/sol_xen_minter';

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
    const program = workspace.SolXenMinter as Program<SolXenMinter>;
    console.log('Program ID:', program.programId.toBase58());

    const METADATA_SEED = "metadata";
    const TOKEN_METADATA_PROGRAM_ID = new web3.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

    const [mint] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("mint")],
        program.programId
    );

    const [minersAddress] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("sol-xen-miners")],
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
        miners: minersAddress,
        // metadata: metadataAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
    };

    const metadata = {
        name: "solXEN (epsilon)",
        symbol: "solXENe1",
        uri: "",
        decimals: 9,
    }
    const miners = [
        new web3.PublicKey(process.env.PROGRAM_ID_MINER0 || ''),
        new web3.PublicKey(process.env.PROGRAM_ID_MINER1 || ''),
    ]

    // Send the mint transaction (as Admin)
    const hash = await program.methods.createMint(metadata, miners)
        .accounts(createAccounts)
        .signers([])
        .rpc();
    console.log('Create Mint tx hash', hash)

    const mintAccount = await getMint(provider.connection, mint);
    console.log(mintAccount.address.toBase58())

}

main().then(() => console.log('Done'))
    .catch(err => console.error(err));
