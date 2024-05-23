import * as anchor from "@coral-xyz/anchor";
import {Program, web3} from "@coral-xyz/anchor";
import { SolXen } from "../target/types/sol_xen";
import {getMint, TOKEN_PROGRAM_ID} from "@solana/spl-token";
import dotenv from 'dotenv';
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";

dotenv.config();

describe("sol-xen-miner", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.SolXen as Program<SolXen>;

  it("Mint Can Be Initialized", async () => {
    // Add your test here.
    // const admin = web3.Keypair.generate()

    const createAccounts = {
      admin: NodeWallet.local().publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    };

    // Send the mint transaction (as Admin)
    const hash = await program.methods.createMint().accounts(createAccounts).signers([]).rpc();
    console.log('Create Mint tx hash', hash)

    const [mint] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("mint")],
        program.programId
    );

    // const mintAccount = await getMint(anchor.workspace.connection, mint);
    // console.log(mintAccount.address.toBase58())
  });

  it("Mint Can not Be Initialized twice", async () => {
    // Add your test here.
    // const admin = web3.Keypair.generate()

    const createAccounts = {
      admin: NodeWallet.local().publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    };

    // Send the mint transaction (as Admin)
    const hash = await program.methods.createMint().accounts(createAccounts).signers([]).rpc();
    console.log('Create Mint tx hash', hash)

    const hash1 = await program.methods.createMint().accounts(createAccounts).signers([]).rpc();
    console.log('Create Mint tx hash1', hash1)
    
  });
});
