const fs = require("fs");
const path = require("path");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const { ethers } = require("ethers");

function createLeaf(account, amount) {
  // This must stay exactly aligned with the Solidity contract:
  // keccak256(abi.encodePacked(account, amount))
  return Buffer.from(
    ethers.solidityPackedKeccak256(["address", "uint256"], [account, amount]).slice(2),
    "hex"
  );
}

function buildMerkleTree(entries) {
  const leaves = entries.map(({ address, amount }) => createLeaf(address, amount));

  // sortPairs: true must stay consistent with the tests and any deployment flow
  // that uses the generated root and proofs.
  return new MerkleTree(leaves, keccak256, { sortPairs: true });
}

function parseCsv(filePath) {
  const csvContent = fs.readFileSync(filePath, "utf8");
  const lines = csvContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one data row.");
  }

  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  const addressIndex = headers.indexOf("address");
  const amountIndex = headers.indexOf("amount");

  if (addressIndex === -1 || amountIndex === -1) {
    throw new Error('CSV header must include "address" and "amount" columns.');
  }

  return lines.slice(1).map((line, index) => {
    const columns = line.split(",").map((value) => value.trim());
    const rawAddress = columns[addressIndex];
    const rawAmount = columns[amountIndex];

    if (!rawAddress || !rawAmount) {
      throw new Error(`Invalid CSV row ${index + 2}: missing address or amount.`);
    }

    return {
      address: ethers.getAddress(rawAddress),
      amount: ethers.parseUnits(rawAmount, 18),
    };
  });
}

function formatEntry(tree, entry) {
  const leaf = createLeaf(entry.address, entry.amount);
  const proof = tree.getHexProof(leaf);

  return {
    address: entry.address,
    amount: entry.amount.toString(),
    leaf: `0x${leaf.toString("hex")}`,
    proof,
  };
}

function main() {
  const inputPath =
    process.argv[2] || path.join(__dirname, "sample-whitelist.csv");

  const resolvedPath = path.resolve(inputPath);
  const whitelist = parseCsv(resolvedPath);
  const merkleTree = buildMerkleTree(whitelist);
  const merkleRoot = merkleTree.getHexRoot();
  const formattedEntries = whitelist.map((entry) => formatEntry(merkleTree, entry));

  console.log(`\nUsing CSV: ${resolvedPath}`);

  console.log("\nWhitelist Entries:");
  console.log(
    JSON.stringify(
      whitelist.map((entry) => ({
        address: entry.address,
        amount: entry.amount.toString(),
      })),
      null,
      2
    )
  );

  console.log("\nLeaves:");
  console.log(
    JSON.stringify(
      formattedEntries.map((entry) => ({
        address: entry.address,
        amount: entry.amount,
        leaf: entry.leaf,
      })),
      null,
      2
    )
  );

  console.log("\nMerkle Root:");
  console.log(merkleRoot);

  console.log("\nProofs:");
  console.log(
    JSON.stringify(
      formattedEntries.map((entry) => ({
        address: entry.address,
        amount: entry.amount,
        proof: entry.proof,
      })),
      null,
      2
    )
  );

  console.log("\nCopy/Paste JSON:");
  console.log(
    JSON.stringify(
      {
        merkleRoot,
        claims: formattedEntries.reduce((accumulator, entry) => {
          accumulator[entry.address] = {
            amount: entry.amount,
            leaf: entry.leaf,
            proof: entry.proof,
          };
          return accumulator;
        }, {}),
      },
      null,
      2
    )
  );
}

main();
