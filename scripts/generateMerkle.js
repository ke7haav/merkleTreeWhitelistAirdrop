const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const { ethers } = require("ethers");

// Hardcoded demo whitelist for local development and interview discussion.
// Amounts use 18 decimals to stay aligned with the token and contract tests.
const whitelist = [
  { address: "0x1111111111111111111111111111111111111111", amount: ethers.parseUnits("100", 18) },
  { address: "0x2222222222222222222222222222222222222222", amount: ethers.parseUnits("125", 18) },
  { address: "0x3333333333333333333333333333333333333333", amount: ethers.parseUnits("150", 18) },
  { address: "0x4444444444444444444444444444444444444444", amount: ethers.parseUnits("175", 18) },
  { address: "0x5555555555555555555555555555555555555555", amount: ethers.parseUnits("200", 18) },
  { address: "0x6666666666666666666666666666666666666666", amount: ethers.parseUnits("225", 18) },
  { address: "0x7777777777777777777777777777777777777777", amount: ethers.parseUnits("250", 18) },
  { address: "0x8888888888888888888888888888888888888888", amount: ethers.parseUnits("275", 18) },
  { address: "0x9999999999999999999999999999999999999999", amount: ethers.parseUnits("300", 18) },
  { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", amount: ethers.parseUnits("325", 18) },
  { address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", amount: ethers.parseUnits("350", 18) },
  { address: "0xcccccccccccccccccccccccccccccccccccccccc", amount: ethers.parseUnits("375", 18) },
  { address: "0xdddddddddddddddddddddddddddddddddddddddd", amount: ethers.parseUnits("400", 18) },
  { address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", amount: ethers.parseUnits("425", 18) },
  { address: "0xffffffffffffffffffffffffffffffffffffffff", amount: ethers.parseUnits("450", 18) },
  { address: "0x1234567890123456789012345678901234567890", amount: ethers.parseUnits("475", 18) },
  { address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd", amount: ethers.parseUnits("500", 18) },
  { address: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", amount: ethers.parseUnits("525", 18) },
];

function createLeaf(account, amount) {
  // This hashing must stay exactly aligned with Solidity:
  // keccak256(abi.encodePacked(account, amount))
  return Buffer.from(
    ethers.solidityPackedKeccak256(["address", "uint256"], [account, amount]).slice(2),
    "hex"
  );
}

function buildMerkleTree(entries) {
  const leaves = entries.map(({ address, amount }) => createLeaf(address, amount));

  // sortPairs: true gives a stable, OpenZeppelin-compatible pair ordering
  // as long as the same setting is used when generating proofs for this root.
  return new MerkleTree(leaves, keccak256, { sortPairs: true });
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
  const merkleTree = buildMerkleTree(whitelist);
  // console.log("merkleTree",merkleTree);
  const root = merkleTree.getHexRoot();
  console.log("root",root);
  const formattedEntries = whitelist.map((entry) => formatEntry(merkleTree, entry));

  console.log("\nWhitelist Entries:");
  console.log(JSON.stringify(
    whitelist.map((entry) => ({
      address: entry.address,
      amount: entry.amount.toString(),
    })),
    null,
    2
  ));

  console.log("\nLeaves:");
  console.log(JSON.stringify(
    formattedEntries.map((entry) => ({
      address: entry.address,
      amount: entry.amount,
      leaf: entry.leaf,
    })),
    null,
    2
  ));

  console.log("\nMerkle Root:");
  console.log(root);

  console.log("\nProofs:");
  console.log(JSON.stringify(
    formattedEntries.map((entry) => ({
      address: entry.address,
      amount: entry.amount,
      proof: entry.proof,
    })),
    null,
    2
  ));

  console.log("\nCopy/Paste JSON:");
  console.log(JSON.stringify(
    {
      merkleRoot: root,
      claims: formattedEntries.reduce((acc, entry) => {
        acc[entry.address] = {
          amount: entry.amount,
          leaf: entry.leaf,
          proof: entry.proof,
        };
        return acc;
      }, {}),
    },
    null,
    2
  ));
}

main();
