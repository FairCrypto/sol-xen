import dotenv from "dotenv";
import { AnchorProvider, setProvider, web3, workspace } from '@coral-xyz/anchor';
//import { debug } from 'debug';
import pkg from 'debug';
const { debug } = pkg;
dotenv.config();
debug.enable(process.env.DEBUG || '*');
const Y = '\x1b[33m';
const U = '\x1b[39m';
async function main() {
    const log = debug("sol-xen-miner");
    // Set this to your local cluster or mainnet-beta, testnet, devnet
    const network = process.env.ANCHOR_PROVIDER_URL || 'devnet';
    log("Listening to solXEN events on", network);
    const connection = new web3.Connection(network, 'processed');
    const provider = new AnchorProvider(connection, null);
    setProvider(provider);
    const program0 = workspace.SolXenMiner0;
    const program1 = workspace.SolXenMiner1;
    const program2 = workspace.SolXenMiner2;
    const program3 = workspace.SolXenMiner3;
    let listener0, listener1, listener2, listener3;
    const onHashEvent = (miner) => (event, slot) => {
        const { user, ethAccount, hashes, superhashes, points } = event;
        const account = Buffer.from(ethAccount).toString("hex");
        const minted = points / 1_000_000_000;
        log(`Event: miner=${Y}${miner}${U} slot=${Y}${slot.toString()}${U}, user=${Y}${user.toBase58()}${U}, account=${Y}${account}${U}, hashes=${Y}${hashes}${U}, superhashes=${Y}${superhashes}${U}, minted=${Y}${minted}${U}`);
    };
    process.addListener("SIGINT", () => {
        if (listener0) {
            program0.removeEventListener(listener0);
        }
        if (listener1) {
            program0.removeEventListener(listener1);
        }
        if (listener2) {
            program0.removeEventListener(listener2);
        }
        if (listener3) {
            program0.removeEventListener(listener3);
        }
        process.exit(0);
    });
    listener0 = program0.addEventListener("hashEvent", onHashEvent(0));
    listener1 = program1.addEventListener("hashEvent", onHashEvent(1));
    listener2 = program2.addEventListener("hashEvent", onHashEvent(2));
    listener3 = program3.addEventListener("hashEvent", onHashEvent(3));
    // prevent the script from exiting
    while (true) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}
main().then(() => { })
    .catch(err => console.error(err));
