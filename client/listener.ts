import dotenv from "dotenv";
import {SolXen} from '../target/types/sol_xen';
import {AnchorProvider, setProvider, Program, web3, workspace} from '@coral-xyz/anchor';

dotenv.config();

async function main() {
// Set this to your local cluster or mainnet-beta, testnet, devnet
    const network = process.env.ANCHOR_PROVIDER_URL;
    console.log("Listening to solXEN events on", network)
    const connection = new web3.Connection(network, 'processed');
    const provider = new AnchorProvider(
        connection,
        null,
    )
    setProvider(provider);
    const program = workspace.SolXen as Program<SolXen>;

    let listener;

    const onHashEvent = (event: any, slot: number) => {
        const { user, ethAccount, hashes, superhashes, points } = event;
        const account = Buffer.from(ethAccount).toString("hex");
        console.log(`Event: slot=${slot.toString()}, user=${user.toBase58()}, account=${account}, hashes=${hashes}, superhashes=${superhashes}, points=${points}`);
    }

    process.addListener("SIGINT", () => {
        if (listener) {
            program.removeEventListener(listener);
            console.log('done')
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
