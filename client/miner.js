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
const dotenv_1 = __importDefault(require("dotenv"));
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
const viem_1 = require("viem");
const debug_1 = require("debug");
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const fs = __importStar(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const spl_token_1 = require("@solana/spl-token");
dotenv_1.default.config();
debug_1.debug.enable(process.env.DEBUG || '*');
var Cmd;
(function (Cmd) {
    Cmd["Mine"] = "mine";
    Cmd["Balance"] = "balance";
})(Cmd || (Cmd = {}));
const G = '\x1b[32m';
const Y = '\x1b[33m';
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const log = (0, debug_1.debug)("sol-xen");
        const error = (0, debug_1.debug)("sol-xen:error");
        const [, , , ...params] = process.argv;
        let cmd;
        let address;
        let priorityFee;
        let units;
        let runs;
        const yArgs = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
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
            default: 1400000,
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
            .help();
        cmd = yArgs.argv._[0];
        if (!cmd && params.length === 0) {
            yArgs.help();
            process.exit(1);
        }
        if (yArgs.argv.priorityFee) {
            priorityFee = parseInt(yArgs.argv.priorityFee);
        }
        if (yArgs.argv.units) {
            units = parseInt(yArgs.argv.units);
        }
        if (yArgs.argv.runs) {
            runs = parseInt(yArgs.argv.runs);
        }
        if (yArgs.argv.address) {
            try {
                address = (0, viem_1.getAddress)(yArgs.argv.address);
            }
            catch (e) {
                console.error(e.message);
                process.exit(1);
            }
        }
        const network = process.env.ANCHOR_PROVIDER_URL || 'localnet';
        log(`${G}Running on ${network}`);
        const connection = new anchor_1.web3.Connection(network, 'processed');
        // Load user wallet keypair
        let user;
        if (process.env.USER_WALLET) {
            const userKeyPairFileName = process.env.USER_WALLET;
            const userKeyPairString = fs.readFileSync(node_path_1.default.resolve(userKeyPairFileName), 'utf-8');
            user = anchor_1.web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(userKeyPairString)));
            log(`${G}Using user wallet ${user.publicKey.toBase58()}`);
        }
        else {
            console.error('User wallet not provided or not found. Set USER_WALLET="path to id.json" in .env file');
            process.exit(1);
        }
        // Update this to the ID of your deployed program
        const wallet = new anchor_1.Wallet(user);
        // Create and set the provider
        const provider = new anchor_1.AnchorProvider(connection, wallet);
        (0, anchor_1.setProvider)(provider);
        // check balance
        log(`${G}Block height=${yield connection.getBlockHeight()}`);
        log(`${G}SOL balance=${yield connection.getBalance(user.publicKey).then((b) => b / web3_js_1.LAMPORTS_PER_SOL)}`);
        // Load the program
        const program = anchor_1.workspace.SolXen;
        log(`${G}Program ID=${program.programId}`);
        const [globalXnRecordAddress] = anchor_1.web3.PublicKey.findProgramAddressSync([
            Buffer.from("xn-global-counter"),
        ], program.programId);
        if (cmd === Cmd.Balance) {
            const globalXnRecord = yield program.account.globalXnRecord.fetch(globalXnRecordAddress);
            log(`${G}Global state: txs=${globalXnRecord.txs}, hashes=${globalXnRecord.hashes}, superhashes=${globalXnRecord.superhashes}, points=${globalXnRecord.points}, amp=${globalXnRecord.amp}, `);
        }
        else if (cmd === Cmd.Mine) {
            log(`${G}Running miner with params: cmd=${cmd}, address=${address}, priorityFee=${priorityFee}, runs=${runs}`);
            log(`${G}Using CU max=${units}`);
            const modifyComputeUnits = web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({
                units
            });
            const addPriorityFee = web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: priorityFee
            });
            const [mint] = anchor_1.web3.PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
            const mintAccount = yield (0, spl_token_1.getMint)(provider.connection, mint);
            const associateTokenProgram = new anchor_1.web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
            const userTokenAccount = anchor_1.utils.token.associatedAddress({
                mint: mintAccount.address,
                owner: user.publicKey
            });
            for (let run = 1; run <= runs; run++) {
                const ethAddress20 = Buffer.from(address.slice(2), 'hex');
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
                const globalXnRecordNew = yield program.account.globalXnRecord.fetch(globalXnRecordAddress);
                log(`${Y}Tx=${mintTx}, hashes=${globalXnRecordNew.hashes}, superhashes=${globalXnRecordNew.superhashes}, balance=${userTokenBalance.value.uiAmount}`);
            }
        }
        else {
            error('Unknown command:', cmd);
            process.exit(1);
        }
    });
}
main().then(() => console.log('Finished'))
    .catch(err => console.error(err));
