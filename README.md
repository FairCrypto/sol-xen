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

N.B. you can skip the last one and run only JS files (see below)

#### Create .env file

```
USER_WALLET=<path_to_solana_wallet_file (id.json)>
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
DEBUG=*
```

## Usage

### Run miner script

with typescript

```tsx ./client/miner.ts mine --address <ethereum address> -fee 1```

or without it

```node ./client/miner.js mine --address <ethereum address> -fee 1```

or even without .env file

```export USER_WALLET='/path/to/your/solana/wallet/id.json' && export ANCHOR_PROVIDER_URL='https://api.devnet.solana.com' && export DEBUG=* && node ./client/miner.js mine --address <ethereum address> -fee 1```

## One-input installation of the solXEN miner
### Install Rust, Solana, create and fund a wallet on Solana, install NodeJS and run the miner
```
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && \
sh -c "$(curl -sSfL https://release.solana.com/stable/install)" && \
export PATH="~/.local/share/solana/install/active_release/bin:$PATH" && \
solana-keygen new --force --no-passphrase && \
solana config set --url https://api.devnet.solana.com && \
solana airdrop 1 && \
git clone https://github.com/FairCrypto/sol-xen.git && \
cd sol-xen && \
git checkout delta && \
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash && \
source ~/.bashrc && \
nvm install --lts && \
export USER_WALLET="$HOME/.config/solana/id.json" && \
export ANCHOR_PROVIDER_URL='https://api.devnet.solana.com' && \
export DEBUG=* && \
npm install dotenv && \
npm install -g dotenv && \
read -p "Enter your Ethereum address: " ethereum_address && \
read -p "Enter the number of runs: " num_runs && \
read -p "Enter the fee: " f && \
node ./client/miner.js mine --address "$ethereum_address" -f "$f" -r "$num_runs"
```
N.B. if there's "Error: airdrop request failed" it means that the faucet is empty. 
It's necessary to copy the public key and use another faucet (eg. https://faucet.solana.com) and then continue with the installation.
```
git clone https://github.com/FairCrypto/sol-xen.git && \
cd sol-xen && \
git checkout delta && \
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash && \
source ~/.bashrc && \
nvm install --lts && \
export USER_WALLET="$HOME/.config/solana/id.json" && \
export ANCHOR_PROVIDER_URL='https://api.devnet.solana.com' && \
export DEBUG=* && \
npm install dotenv && \
npm install -g dotenv && \
read -p "Enter your Ethereum address: " ethereum_address && \
read -p "Enter the number of runs: " num_runs && \
read -p "Enter the fee: " f && \
node ./client/miner.js mine --address "$ethereum_address" -f "$f" -r "$num_runs"
```
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

### Run event listener script

```tsx ./client/listener.ts```

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
