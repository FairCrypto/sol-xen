import {ComputeBudgetProgram} from '@solana/web3.js';
import {AnchorProvider, setProvider, Program, web3, Wallet, workspace, utils} from '@coral-xyz/anchor';
import * as fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {SolXenMiner} from '../target/types/sol_xen_miner';
import yargs from "yargs";
import {hideBin} from "yargs/helpers";

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

    const [, , , ...params] = process.argv;
    let kind: number;
    let priorityFee: number = 1;

    const yArgs = yargs(hideBin(process.argv))
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
            description: 'Kind of miner 0...3'
        })
        .help()
        .parseSync()
    
    if (params.length === 0) {
        // @ts-ignore
        yArgs.help();
        process.exit(1)
    }

    if (yArgs.priorityFee) {
        priorityFee = Number(yArgs.priorityFee)
    }

    if (yArgs.kind !== null || typeof yArgs.kind !== 'undefined') {
        kind = Number(yArgs.kind)
    } else {
        console.error('Kind is required');
        process.exit(1)
    }

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
    const program = workspace.SolXenMiner as Program<SolXenMiner>;

    const createAccounts = {
        admin: provider.wallet.publicKey,
    };

    // Send the mint transaction (as Admin)
    const hash = await program.methods.initMiner(kind).accounts(createAccounts).signers([]).rpc();
    console.log(`Create Mint #${kind} tx hash`, hash)

}

main().then(() => console.log('Done'))
    .catch(err => console.error(err));
