"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const anchor_1 = require("@coral-xyz/anchor");
const fs = __importStar(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const dotenv_1 = __importDefault(require("dotenv"));
const spl_token_1 = require("@solana/spl-token");
dotenv_1.default.config();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        // Set this to your local cluster or mainnet-beta, testnet, devnet
        const network = process.env.ANCHOR_PROVIDER_URL;
        const connection = new anchor_1.web3.Connection(network, 'processed');
        const keyPairFileName = process.env.ANCHOR_WALLET;
        const keyPairString = fs.readFileSync(node_path_1.default.resolve(keyPairFileName), 'utf-8');
        const keyPair = anchor_1.web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(keyPairString)));
        console.log('Using wallet', keyPair.publicKey.toBase58());
        const wallet = new anchor_1.Wallet(keyPair);
        // Create and set the provider
        const provider = new anchor_1.AnchorProvider(connection, wallet);
        (0, anchor_1.setProvider)(provider);
        // check balance
        console.log('Block height:', yield connection.getBlockHeight());
        console.log('Balance:', yield connection.getBalance(keyPair.publicKey));
        // Load the program
        const program = anchor_1.workspace.SolXen;
        // Load or create a random account for a test user
        let user;
        if (process.env.USER_WALLET) {
            const userKeyPairFileName = process.env.USER_WALLET;
            const userKeyPairString = fs.readFileSync(node_path_1.default.resolve(userKeyPairFileName), 'utf-8');
            user = anchor_1.web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(userKeyPairString)));
            console.log('Using user wallet', user.publicKey.toBase58());
        }
        else {
            user = anchor_1.web3.Keypair.generate();
            console.log('Using random user', user.publicKey.toBase58());
        }
        // send user some lamports
        const tx2 = new anchor_1.web3.Transaction().add(anchor_1.web3.SystemProgram.transfer({
            fromPubkey: keyPair.publicKey,
            toPubkey: user.publicKey,
            lamports: anchor_1.web3.LAMPORTS_PER_SOL,
        }));
        // Sign transaction, broadcast, and confirm
        const sig2 = yield anchor_1.web3.sendAndConfirmTransaction(connection, tx2, [keyPair]);
        console.log('Tx2 hash', sig2);
        console.log('Admin Balance:', yield connection.getBalance(keyPair.publicKey));
        console.log('User Balance:', yield connection.getBalance(user.publicKey));
        const createAccounts = {
            admin: provider.wallet.publicKey,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        };
        // Send the mint transaction (as Admin)
        const hash = yield program.methods.createMint().accounts(createAccounts).signers([]).rpc();
        console.log('Create Mint tx hash', hash);
        const [mint] = anchor_1.web3.PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
        const mintAccount = yield (0, spl_token_1.getMint)(provider.connection, mint);
        console.log(mintAccount.address.toBase58());
    });
}
main().then(() => console.log('Test run complete'))
    .catch(err => console.error(err));
