# Merkle Tree Whitelist Airdrop

## Overview

This project is a simple ERC20 airdrop system built with Hardhat and Solidity. It distributes tokens to a predefined whitelist of addresses, where each address is assigned a claimable token amount.

Instead of storing the full whitelist on-chain, the contract stores only a single Merkle root. Each user proves eligibility by submitting their address, amount, and a Merkle proof. This keeps the on-chain state small and makes the airdrop more gas efficient than storing every recipient directly in contract storage.

The project includes:

- a mock ERC20 token for local testing
- an airdrop contract that verifies Merkle proofs
- off-chain scripts to generate leaves, proofs, and the Merkle root from either hardcoded data or a CSV file
- a Hardhat test suite covering success paths and important failure cases

## Features

- ERC20 test token built with OpenZeppelin
- Merkle-based whitelist verification
- claim-by-proof flow using `claim(address account, uint256 amount, bytes32[] calldata proof)`
- double-claim prevention with on-chain tracking
- custom errors for clear and gas-efficient reverts
- safe token transfers via `SafeERC20`
- off-chain Merkle generation scripts using `merkletreejs` and `keccak256`
- JavaScript Hardhat tests with both happy-path and edge-case coverage

## Project Structure

```text
contracts/
  MockToken.sol
  MerkleAirdrop.sol

scripts/
  generateMerkle.js
  generateMerkleFromCSV.js
  sample-whitelist.csv

test/
  MerkleAirdrop.test.js
  MerkleAirdrop.30Addresses.test.js

hardhat.config.js
package.json
README.md
```

## How It Works

### 1. Off-chain Merkle tree generation

The whitelist is prepared off-chain as `(address, amount)` pairs. Each entry is hashed using:

```solidity
keccak256(abi.encodePacked(account, amount))
```

Those hashes become the leaves of the Merkle tree. The final root is generated off-chain and passed to the `MerkleAirdrop` contract during deployment.

This project includes two off-chain generation flows:

- `scripts/generateMerkle.js` uses a hardcoded whitelist for quick local demonstration.
- `scripts/generateMerkleFromCSV.js` reads `address,amount` rows from a CSV file and generates the root and proofs in the same format.

Both scripts use the same hashing rule as the contract and tests, so the generated data stays compatible.

### 2. On-chain proof verification

When a user wants to claim tokens, they call:

```solidity
claim(address account, uint256 amount, bytes32[] calldata proof)
```

The contract:

- checks that `msg.sender` matches the `account`
- checks that the address has not already claimed
- recomputes the leaf from `account` and `amount`
- verifies the proof against the stored `merkleRoot`
- marks the address as claimed
- transfers the ERC20 tokens

If the proof is valid, the claim succeeds. Otherwise, the transaction reverts.

### 3. Double-claim prevention

The contract stores a `claimed` mapping:

```solidity
mapping(address => bool) public claimed;
```

Once a user claims successfully, their address is marked as claimed and they cannot claim again.

## Design Decisions

### Why store only the Merkle root on-chain?

Storing the full whitelist on-chain would be expensive and unnecessary. A Merkle root compresses the full dataset into a single value, while still allowing each user to prove membership with a short proof.

### Why require `msg.sender == account`?

This prevents a third party from submitting a claim on behalf of another address. Even if they somehow know the correct proof, they cannot redirect or front-run someone else’s claim using that person’s allocation.

### Why update `claimed` before transferring tokens?

This follows the checks-effects-interactions pattern. State is updated before the external token transfer happens, which reduces reentrancy-style risk and makes the claim flow safer.

### Why use OpenZeppelin libraries?

OpenZeppelin gives well-audited standard building blocks for ERC20 tokens, ownership, Merkle proof verification, and safe token transfers. For an assignment like this, it keeps the implementation focused on the airdrop logic instead of rewriting common primitives.

## Security Considerations

- The token address is validated in the constructor to avoid deploying against the zero address.
- Merkle proofs are verified against a fixed root, so only approved `(address, amount)` pairs can claim.
- `msg.sender` must match the claim target account.
- Claims are tracked on-chain to prevent double claiming.
- `claimed` is set before token transfer.
- `SafeERC20` is used for token transfers to avoid unsafe ERC20 interaction assumptions.
- Custom errors keep revert reasons explicit while avoiding long revert strings.

## Trade-offs / Known Limitations

- The Merkle root is immutable after deployment. That keeps the contract simple, but it also means the whitelist cannot be updated later.
- There is no admin recovery function or unclaimed token sweep in this version.
- The hardcoded script is useful for fast demos, but the CSV-based script is closer to how assignment data would usually be prepared.
- This implementation assumes the airdrop contract is pre-funded with enough ERC20 tokens before claims begin.
- The project is intentionally minimal and does not include a frontend or deployment pipeline.

## Setup Instructions

Install dependencies:

```bash
npm install
```

Compile contracts:

```bash
npx hardhat compile
```

Run the test suite:

```bash
npx hardhat test
```

Run only the small sample suite:

```bash
npx hardhat test test/MerkleAirdrop.test.js
```

Run only the 30-address suite:

```bash
npx hardhat test test/MerkleAirdrop.30Addresses.test.js
```

Generate Merkle data from the hardcoded demo dataset:

```bash
node scripts/generateMerkle.js
```

Generate Merkle data from the sample CSV:

```bash
node scripts/generateMerkleFromCSV.js
```

Generate Merkle data from your own CSV file:

```bash
node scripts/generateMerkleFromCSV.js path/to/whitelist.csv
```

Expected CSV format:

```csv
address,amount
0x1111111111111111111111111111111111111111,100
0x2222222222222222222222222222222222222222,125
```

You can also use the npm shortcuts if preferred:

```bash
npm run compile
npm test
```

## Test Coverage Summary

The test suite covers:

- at least 3 successful claims from different whitelisted accounts
- a second standalone suite that scales the whitelist to 30 addresses
- invalid proof rejection
- repeat claim rejection
- non-whitelisted user rejection
- wrong amount rejection
- prevention of claiming on behalf of another address
- `isClaimed(address)` state verification
- ERC20 balance changes after successful claims

There are now two separate test files:

- `test/MerkleAirdrop.test.js` is the smaller sample suite for quick demonstration and easy walkthrough.
- `test/MerkleAirdrop.30Addresses.test.js` uses a larger 30-address whitelist to validate the same logic against a bigger Merkle tree.

The goal was to keep the tests readable enough to explain in an interview while still covering the core correctness and security assumptions.

## Optional Improvements

If this were extended toward production, useful next steps would be:

- deployment scripts for local/testnet environments
- a frontend or claim page for users
- support for stronger CSV validation, duplicate detection, and JSON export files
- admin functionality to recover unclaimed tokens after an expiry period
- claim windows with start and end timestamps
- multi-round airdrops or rotating Merkle roots
- event indexing or subgraph support for claim tracking

## Conclusion

This project is a compact example of a Merkle-based token airdrop built with practical tooling and straightforward security choices. The main goal was to keep it easy to reason about: generate data off-chain, store only the root on-chain, verify proofs during claims, and prevent duplicate claims with minimal state.

For a technical assignment, it demonstrates the core pattern clearly without adding extra features that distract from the main idea.
