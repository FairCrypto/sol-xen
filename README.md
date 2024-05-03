# solXEN Token

## Installation

### Clone the repo

```
git clone https://github.com/FairCrypto/sol-xen.git
cd sol-xen
```

### For Typescript client

#### Install NodeJS

(To test if you have one
```node --version```)

https://nodejs.org/en/download

#### Install deps

```
npm i
npm i -g tsx
```

#### Create .env file

```
USER_WALLET=<path_to_solana_wallet_file (id.json)>
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
```

## Usage

### Run miner script

```tsx ./client/miner.ts mine --address <ethereum address> -fee 1```

Full options list

```
miner.ts [command]

Commands:
  miner.ts mine     Checks gas-related params returned by current network
  miner.ts balance  Checks balance of a master account

Options:
      --version          Show version number                           [boolean]
  -f, --priorityFee      Solana priority fee, micro-lamports
                                                           [number] [default: 1]
  -u, --units            Solana MAX Compute Units    [number] [default: 1400000]
      --address, --addr  Ethereum address to relate XN points to        [string]
  -r, --runs             Number of runs                    [number] [default: 1]
      --help             Show help                                     [boolean]

```

### Run test client script

```tsx ./client/user.ts```

## Testing

## References

- https://www.anchor-lang.com/
- https://www.soldev.app/course/anchor-pdas
- https://solanacookbook.com/gaming/interact-with-tokens.html#create-mint-and-burn-tokens-with-anchor
- https://github.com/solana-developers/program-examples/blob/main/tokens/pda-mint-authority
- https://medium.com/coinmonks/how-to-use-solana-token-operations-using-rust-anchor-framework-and-create-metadata-to-the-mint-138d0da9a5c4
- https://0xksure.medium.com/mint-tokens-on-solana-using-the-rust-sdk-3b05b07ca842
- https://solana.stackexchange.com/questions/454/how-to-create-a-program-that-has-the-authority-to-mint-tokens
- https://betterprogramming.pub/using-pdas-and-spl-token-in-anchor-and-solana-df05c57ccd04
