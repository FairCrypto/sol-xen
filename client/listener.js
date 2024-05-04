"use strict";
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
const anchor_1 = require("@coral-xyz/anchor");
dotenv_1.default.config();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        // Set this to your local cluster or mainnet-beta, testnet, devnet
        const network = process.env.ANCHOR_PROVIDER_URL;
        console.log("Listening to solXEN events on", network);
        const connection = new anchor_1.web3.Connection(network, 'processed');
        const provider = new anchor_1.AnchorProvider(connection, null);
        (0, anchor_1.setProvider)(provider);
        const program = anchor_1.workspace.SolXen;
        let listener;
        const onHashEvent = (event, slot) => {
            const { user, ethAccount, hashes, superhashes, points } = event;
            const account = Buffer.from(ethAccount).toString("hex");
            console.log(`Event: slot=${slot.toString()}, user=${user.toBase58()}, account=${account}, hashes=${hashes}, superhashes=${superhashes}, points=${points}`);
        };
        process.addListener("SIGINT", () => {
            if (listener) {
                program.removeEventListener(listener);
                console.log('done');
            }
            process.exit(0);
        });
        listener = program.addEventListener("hashEvent", onHashEvent);
        // prevent the script from exiting
        while (true) {
            yield new Promise(resolve => setTimeout(resolve, 500));
        }
    });
}
main().then(() => { })
    .catch(err => console.error(err));
