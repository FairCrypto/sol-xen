import {ComputeBudgetProgram} from '@solana/web3.js';
import {AnchorProvider, setProvider, Program, web3, Wallet, BN, workspace, utils} from '@coral-xyz/anchor';
import * as fs from "node:fs";
import path from "node:path";
import * as os from "node:os";
import {getMint, TOKEN_PROGRAM_ID} from "@solana/spl-token";
import { SolXen } from '../target/types/sol_xen';

async function main() {
// Set this to your local cluster or mainnet-beta, testnet, devnet
  const network = 'http://127.0.0.1:8899';
  const connection = new web3.Connection(network, 'processed');

  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
    units: 1_200_000
  });

  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 1
  });

  const keyPairFileName = '.config/solana/id.json'
  const keyPairString = fs.readFileSync(path.resolve(os.homedir(), keyPairFileName), 'utf-8');
  const keyPair = web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(keyPairString)));
  console.log('Using wallet', keyPair.publicKey.toBase58());

  // Update this to the ID of your deployed program
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
  const program = workspace.SolXen as Program<SolXen>;

  // Create an account to store the block number
  const blockNumberAccount = web3.Keypair.generate();
  const user = web3.Keypair.generate()

  const tx1 = new web3.Transaction().add(
    web3.SystemProgram.transfer({
      fromPubkey: keyPair.publicKey,
      toPubkey: blockNumberAccount.publicKey,
      lamports: web3.LAMPORTS_PER_SOL,
    })
  );
  // Sign transaction, broadcast, and confirm
  const sig1 = await web3.sendAndConfirmTransaction(connection, tx1, [keyPair]);
  console.log('Tx1 hash', sig1);
  const tx2 = new web3.Transaction().add(
    web3.SystemProgram.transfer({
      fromPubkey: keyPair.publicKey,
      toPubkey: user.publicKey,
      lamports: web3.LAMPORTS_PER_SOL,
    })
  );
  // Sign transaction, broadcast, and confirm
  const sig2 = await web3.sendAndConfirmTransaction(connection, tx2, [keyPair]);
  console.log('Tx2 hash', sig2);
  console.log('Balance1:', await connection.getBalance(keyPair.publicKey));
  console.log('Balance2:', await connection.getBalance(blockNumberAccount.publicKey));

  const createAccounts = {
    admin: provider.wallet.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  // Send the mint transaction
  const hash = await program.methods.createMint().accounts(createAccounts).signers([]).rpc();
  console.log('Create Mint tx hash', hash)

  const [mint] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("mint")],
      program.programId
  );

  const mintAccount = await getMint(provider.connection, mint);
  // console.log(mintAccount)

  const associateTokenProgram = new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  const userTokenAccount = utils.token.associatedAddress({
      mint: mintAccount.address,
      owner: user.publicKey
  })

  const [ globalXnRecord] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("xn-global-counter"),
      ],
      program.programId
  );

  for await (const ethAddress of [
      '6B889Dcfad1a6ddf7dE3bC9417F5F51128efc964',
      '7B889Dcfad1a6ddf7dE3bC9417F5F51128efc964',
      '8B889Dcfad1a6ddf7dE3bC9417F5F51128efc964',
      '9B889Dcfad1a6ddf7dE3bC9417F5F51128efc964',
      'aB889Dcfad1a6ddf7dE3bC9417F5F51128efc964',
  ]) {
    const ethAddress20 = Buffer.from(ethAddress, 'hex')

    const [ userXnRecord] = web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("sol-xen"),
          ethAddress20,
          user.publicKey.toBuffer()
        ],
        program.programId
    );

    const value0 = await program.account.globalXnRecord.fetch(globalXnRecord);
    console.log('Read Global Counter:', value0.txs);
    const [ userXnAddressRecords] = web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("sol-xen-addr"),
          Buffer.from([0, 0, 0, value0.txs, ]),
        ],
        program.programId
    );

    const mintAccounts = {
      user: user.publicKey,
      mintAccount: mintAccount.address,
      userTokenAccount,
      userXnRecord,
      globalXnRecord,
      userXnAddressRecords,
      tokenProgram: TOKEN_PROGRAM_ID,
      associateTokenProgram
    };
    // console.log('params', Array.from(ethAddress20).length, value0.points);
    const mintTx = await program.methods.mintTokens({ address:  Array.from(ethAddress20) }, value0.txs)
        .accounts(mintAccounts)
        .signers([user])
        .preInstructions([modifyComputeUnits, addPriorityFee])
        .rpc();
    const info1 = await connection.getTokenAccountBalance(userTokenAccount);
    console.log('mint tx', mintTx);
    console.log('Token Balance', info1.value.uiAmount)

    // Fetch the user counter value
    // const value1 = await program.account.xnRecord.fetch(userXnRecord);
    // console.log('Stored User Counter:', value1.points, userXnRecord.toBase58());

    // Fetch the global counter value
    // const value2 = await program.account.xnRecord.fetch(globalXnRecord);
    // console.log('Stored Global Counter:', value2.points);

    // Fetch the tx iterator value
    const value2 = await program.account.xnAddressRecord.fetch(userXnAddressRecords);
    console.log('Stored Iterator:', value2);
  }

}

main().then(() => console.log('Transaction complete.'))
  .catch(err => console.error(err));
