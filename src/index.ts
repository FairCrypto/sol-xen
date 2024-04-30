import { PublicKey, SystemProgram, clusterApiUrl } from '@solana/web3.js';
import {AnchorProvider, setProvider, Program, web3, Wallet, BN, workspace, utils} from '@coral-xyz/anchor';
import * as fs from "node:fs";
import path from "node:path";
import * as os from "node:os";
import type { Idl } from "@coral-xyz/anchor/dist/cjs/idl";
import * as token from '@solana/spl-token'
import {getMint, TOKEN_PROGRAM_ID} from "@solana/spl-token";
import { SolXen } from '../target/types/sol_xen';

type CustomIDL = Idl | any;

async function main() {
// Set this to your local cluster or mainnet-beta, testnet, devnet
  const network = 'http://127.0.0.1:8899';
  // console.log(clusterApiUrl('devnet'))
  const connection = new web3.Connection(network, 'processed');

  const keyPairFileName = '.config/solana/id.json'
  const keyPairString = fs.readFileSync(path.resolve(os.homedir(), keyPairFileName), 'utf-8');
  const keyPair = web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(keyPairString)));
  console.log('Using wallet', keyPair.publicKey.toBase58());

  // Update this to the ID of your deployed program
  // const programId = new PublicKey('Acq6T4HruCRnZXVHqUiZ4CVJnnbqcSv233r5QmQiFUCi');
  const wallet = new Wallet(keyPair);
  // Create and set the provider
  const provider = new AnchorProvider(
    connection,
    wallet,
    // AnchorProvider.defaultOptions(),
  );
  setProvider(provider);
  // console.log('Using wallet', wallet)
  // console.log('Using provider', provider)

  // check balance
  console.log('Block height:', await connection.getBlockHeight());
  console.log('Balance:', await connection.getBalance(keyPair.publicKey));

  // Load the program
  console.log(process.cwd())
  const idlString = fs.readFileSync(path.resolve(".", "target/idl/sol_xen.json"), "utf8");
  const idl: Idl = JSON.parse(idlString);
  // const idl = await anchor.Program.fetchIdl(programId, provider);
  // console.log('Using IDL', idl)

  const program = workspace.SolXen as Program<SolXen>;
  console.log(program.methods);

  // Create an account to store the block number
  const blockNumberAccount = web3.Keypair.generate();

  const tx1 = new web3.Transaction().add(
    web3.SystemProgram.transfer({
      fromPubkey: keyPair.publicKey,
      toPubkey: blockNumberAccount.publicKey,
      lamports: web3.LAMPORTS_PER_SOL,
    })
  );
  // Sign transaction, broadcast, and confirm
  const sig1 = await web3.sendAndConfirmTransaction(connection, tx1, [keyPair]);
  console.log('Transaction1', sig1);
  console.log('Balance1:', await connection.getBalance(keyPair.publicKey));
  console.log('Balance2:', await connection.getBalance(blockNumberAccount.publicKey));

  const mintToken = web3.Keypair.generate()

  // const ta = web3.PublicKey.findProgramAddressSync(
  //  [provider.publicKey.toBuffer(),TOKEN_PROGRAM_ID.toBuffer(),mintToken.publicKey.toBuffer()],
  //  associateTokenProgram
  // )[0]
  // let tokenAccountKeyPair = web3.Keypair.generate()

  const createAccounts = {
    admin: provider.wallet.publicKey,
    // mintToken: mintToken.publicKey,
    // tokenAccount: tokenAccount,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  // Send the mint transaction
  const hash = await program.methods.createMint().accounts(createAccounts).signers([]).rpc();
  console.log(hash)

  const [mint] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("mint")],
      program.programId
  );

  const mintAccount = await getMint(provider.connection, mint);
  console.log(mintAccount)

  const associateTokenProgram = new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  const tokenAccount = utils.token.associatedAddress({mint:mintAccount.address,owner:provider.publicKey})

  // const user = web3.Keypair.generate()
  const mintAccounts = {
    user: provider.wallet.publicKey,
    mintAccount: mintAccount.address,
    userTokenAccount: tokenAccount,
    tokenProgram: TOKEN_PROGRAM_ID,
    associateTokenProgram
  };

  const hash1 = await program.methods.mintTokens().accounts(mintAccounts).signers([]).rpc();
  const info = await connection.getTokenAccountBalance(tokenAccount);
  console.log(hash1, info.value.uiAmount)

  // await program.methods.storeBlockNumber().accounts(accounts).signers([blockNumberAccount]).rpc();

  // Fetch the stored value
  // const value1 = await program.account.blockNumberAccount.fetch(blockNumberAccount.publicKey);
  // console.log('Stored Block Number:', value1.blockNumber.toString());

}

main().then(() => console.log('Transaction complete.'))
  .catch(err => console.error(err));
