const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

function createLeaf(account, amount) {
  return Buffer.from(
    ethers.solidityPackedKeccak256(["address", "uint256"], [account, amount]).slice(2),
    "hex"
  );
}

function buildMerkleTree(entries) {
  const leaves = entries.map(({ account, amount }) => createLeaf(account, amount));
  return new MerkleTree(leaves, keccak256, { sortPairs: true });
}

function getProof(tree, account, amount) {
  return tree.getHexProof(createLeaf(account, amount));
}

describe("MerkleAirdrop", function () {
  let owner;
  let alice;
  let bob;
  let carol;
  let david;
  let eve;

  let token;
  let airdrop;
  let merkleTree;
  let whitelist;
  let totalAirdropAmount;

  beforeEach(async function () {
    [owner, alice, bob, carol, david, eve] = await ethers.getSigners();

    whitelist = [
      { account: alice.address, amount: ethers.parseUnits("100", 18) },
      { account: bob.address, amount: ethers.parseUnits("250", 18) },
      { account: carol.address, amount: ethers.parseUnits("400", 18) },
      { account: david.address, amount: ethers.parseUnits("150", 18) },
    ];

    merkleTree = buildMerkleTree(whitelist);
    const merkleRoot = merkleTree.getHexRoot();

    totalAirdropAmount = whitelist.reduce((total, entry) => total + entry.amount, 0n);

    const MockToken = await ethers.getContractFactory("MockToken");
    token = await MockToken.deploy();
    await token.waitForDeployment();

    const MerkleAirdrop = await ethers.getContractFactory("MerkleAirdrop");
    airdrop = await MerkleAirdrop.deploy(await token.getAddress(), merkleRoot);
    await airdrop.waitForDeployment();

    await token.transfer(await airdrop.getAddress(), totalAirdropAmount);
  });

  it("allows valid claims from multiple whitelisted accounts", async function () {
    const validClaimants = whitelist.slice(0, 3);
    for (const claimant of validClaimants) {
      expect(await airdrop.isClaimed(claimant.account)).to.equal(false);
      const proof = getProof(merkleTree, claimant.account, claimant.amount);
      const beforeBalance = await token.balanceOf(claimant.account);

      await expect(
        airdrop
          .connect(await ethers.getSigner(claimant.account))
          .claim(claimant.account, claimant.amount, proof)
      )
        .to.emit(airdrop, "Claimed")
        .withArgs(claimant.account, claimant.amount);

      expect(await airdrop.isClaimed(claimant.account)).to.equal(true);
      expect(await token.balanceOf(claimant.account)).to.equal(beforeBalance + claimant.amount);
    }
  });

  it("reverts when the proof is invalid", async function () {
    const aliceEntry = whitelist[0];
    const bobEntry = whitelist[1];
    const wrongProof = getProof(merkleTree, bobEntry.account, bobEntry.amount);

    await expect(
      airdrop.connect(alice).claim(aliceEntry.account, aliceEntry.amount, wrongProof)
    ).to.be.revertedWithCustomError(airdrop, "InvalidProof");
  });

  it("reverts when an address tries to claim twice", async function () {
    const aliceEntry = whitelist[0];
    const proof = getProof(merkleTree, aliceEntry.account, aliceEntry.amount);

    await airdrop.connect(alice).claim(aliceEntry.account, aliceEntry.amount, proof);

    await expect(
      airdrop.connect(alice).claim(aliceEntry.account, aliceEntry.amount, proof)
    )
      .to.be.revertedWithCustomError(airdrop, "AlreadyClaimed")
      .withArgs(aliceEntry.account);
  });

  it("reverts for a non-whitelisted address", async function () {
    const fakeAmount = ethers.parseUnits("100", 18);
    const emptyProof = [];

    await expect(
      airdrop.connect(eve).claim(eve.address, fakeAmount, emptyProof)
    ).to.be.revertedWithCustomError(airdrop, "InvalidProof");
  });

  it("reverts when claiming with the wrong amount", async function () {
    const aliceEntry = whitelist[0];
    const wrongAmount = ethers.parseUnits("999", 18);
    const wrongAmountProof = getProof(merkleTree, aliceEntry.account, aliceEntry.amount);

    await expect(
      airdrop.connect(alice).claim(aliceEntry.account, wrongAmount, wrongAmountProof)
    ).to.be.revertedWithCustomError(airdrop, "InvalidProof");
  });

  it("reverts when one user tries to claim on behalf of another", async function () {
    const aliceEntry = whitelist[0];
    const proof = getProof(merkleTree, aliceEntry.account, aliceEntry.amount);

    await expect(
      airdrop.connect(bob).claim(aliceEntry.account, aliceEntry.amount, proof)
    )
      .to.be.revertedWithCustomError(airdrop, "UnauthorizedClaimer")
      .withArgs(bob.address, aliceEntry.account);
  });

  it("returns true from isClaimed after a successful claim", async function () {
    const bobEntry = whitelist[1];
    const proof = getProof(merkleTree, bobEntry.account, bobEntry.amount);

    expect(await airdrop.isClaimed(bobEntry.account)).to.equal(false);

    await airdrop.connect(bob).claim(bobEntry.account, bobEntry.amount, proof);

    expect(await airdrop.isClaimed(bobEntry.account)).to.equal(true);
  });

  it("updates token balances correctly after a successful claim", async function () {
    const carolEntry = whitelist[2];
    const proof = getProof(merkleTree, carolEntry.account, carolEntry.amount);

    const claimerBalanceBefore = await token.balanceOf(carolEntry.account);
    const airdropBalanceBefore = await token.balanceOf(await airdrop.getAddress());

    await airdrop.connect(carol).claim(carolEntry.account, carolEntry.amount, proof);

    const claimerBalanceAfter = await token.balanceOf(carolEntry.account);
    const airdropBalanceAfter = await token.balanceOf(await airdrop.getAddress());

    expect(claimerBalanceAfter).to.equal(claimerBalanceBefore + carolEntry.amount);
    expect(airdropBalanceAfter).to.equal(airdropBalanceBefore - carolEntry.amount);
  });
});
