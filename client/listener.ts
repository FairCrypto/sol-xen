import dotenv from "dotenv";
import {SolXen} from '../target/types/sol_xen';
import {AnchorProvider, setProvider, Program, web3, workspace} from '@coral-xyz/anchor';
import {debug} from "debug";

dotenv.config();
debug.enable(process.env.DEBUG || '*')

const Y = '\x1b[33m';
const U = '\x1b[39m';

async function main() {
    const log = debug("sol-xen")

    // Set this to your local cluster or mainnet-beta, testnet, devnet
    const network = process.env.ANCHOR_PROVIDER_URL || 'devnet';
    log("Listening to solXEN events on", network)
    const connection = new web3.Connection(network, 'processed');
    const provider = new AnchorProvider(
        connection,
        null as any,
    )
    setProvider(provider);
    const program = workspace.SolXen as Program<SolXen>;

    let listener: number;

    const onHashEvent = (event: any, slot: number) => {
        const { user, ethAccount, hashes, superhashes, points } = event;
        const account = Buffer.from(ethAccount).toString("hex");
        const minted = points / 1_000_000_000;
        log(`Event: slot=${Y}${slot.toString()}${U}, user=${Y}${user.toBase58()}${U}, account=${Y}${account}${U}, hashes=${Y}${hashes}${U}, superhashes=${Y}${superhashes}${U}, minted=${Y}${minted}${U}`);
    }

    process.addListener("SIGINT", () => {
        if (listener) {
            program.removeEventListener(listener);
            log('done')
        }
        process.exit(0)
    })

    listener = program.addEventListener("hashEvent", onHashEvent);

    // prevent the script from exiting
    while (true) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

main().then(() => {})
    .catch(err => console.error(err));
