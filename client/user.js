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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const fs = __importStar(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const dotenv_1 = __importDefault(require("dotenv"));
const spl_token_1 = require("@solana/spl-token");
dotenv_1.default.config();
function main() {
    var _a, e_1, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
        // Set this to your local cluster or mainnet-beta, testnet, devnet
        const network = process.env.ANCHOR_PROVIDER_URL;
        const connection = new anchor_1.web3.Connection(network, 'processed');
        const modifyComputeUnits = web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({
            units: 1400000
        });
        const addPriorityFee = web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 1
        });
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
        // Update this to the ID of your deployed program
        const wallet = new anchor_1.Wallet(user);
        // Create and set the provider
        const provider = new anchor_1.AnchorProvider(connection, wallet);
        (0, anchor_1.setProvider)(provider);
        // check balance
        console.log('Block height:', yield connection.getBlockHeight());
        console.log('Balance:', yield connection.getBalance(user.publicKey));
        // Load the program
        const program = anchor_1.workspace.SolXen;
        const [mint] = anchor_1.web3.PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
        const mintAccount = yield (0, spl_token_1.getMint)(provider.connection, mint);
        const associateTokenProgram = new anchor_1.web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
        const userTokenAccount = anchor_1.utils.token.associatedAddress({
            mint: mintAccount.address,
            owner: user.publicKey
        });
        const [globalXnRecordAddress] = anchor_1.web3.PublicKey.findProgramAddressSync([
            Buffer.from("xn-global-counter"),
        ], program.programId);
        try {
            // send some test transactions as a user
            for (var _d = true, _e = __asyncValues([
                '6B889Dcfad1a6ddf7dE3bC9417F5F51128efc964',
                '7B889Dcfad1a6ddf7dE3bC9417F5F51128efc964',
                '8B889Dcfad1a6ddf7dE3bC9417F5F51128efc964',
                '9B889Dcfad1a6ddf7dE3bC9417F5F51128efc964',
                'aB889Dcfad1a6ddf7dE3bC9417F5F51128efc964',
            ]), _f; _f = yield _e.next(), _a = _f.done, !_a;) {
                _c = _f.value;
                _d = false;
                try {
                    const ethAddress = _c;
                    const ethAddress20 = Buffer.from(ethAddress, 'hex');
                    const [userXnRecordAccount] = anchor_1.web3.PublicKey.findProgramAddressSync([
                        Buffer.from("sol-xen"),
                        ethAddress20,
                        user.publicKey.toBuffer()
                    ], program.programId);
                    const mintAccounts = {
                        user: user.publicKey,
                        mintAccount: mintAccount.address,
                        userTokenAccount,
                        userXnRecord: userXnRecordAccount,
                        globalXnRecord: globalXnRecordAddress,
                        tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                        associateTokenProgram
                    };
                    const mintTx = yield program.methods.mintTokens({ address: Array.from(ethAddress20) })
                        .accounts(mintAccounts)
                        .signers([user])
                        .preInstructions([modifyComputeUnits, addPriorityFee])
                        .rpc();
                    const userTokenBalance = yield connection.getTokenAccountBalance(userTokenAccount);
                    console.log('mint tx', mintTx);
                    console.log('Token Balance', userTokenBalance.value.uiAmount);
                }
                finally {
                    _d = true;
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
            }
            finally { if (e_1) throw e_1.error; }
        }
    });
}
main().then(() => console.log('Test run complete'))
    .catch(err => console.error(err));
