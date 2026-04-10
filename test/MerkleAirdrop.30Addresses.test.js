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

describe("MerkleAirdrop (30-address whitelist)", function () {
  let owner;
  let signers;
  let whitelistWallets;
  let outsider;

  let token;
  let airdrop;
  let merkleTree;
  let whitelist;
  let totalAirdropAmount;

  beforeEach(async function () {
    signers = await ethers.getSigners();
    [owner] = signers;

    const signerWallets = signers.slice(1);
    const extraWallets = [];
    const additionalWalletCount = 30 - signerWallets.length;

    for (let i = 0; i < additionalWalletCount; i += 1) {
      const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
      await owner.sendTransaction({
        to: wallet.address,
        value: ethers.parseEther("1"),
      });
      extraWallets.push(wallet);
    }

    outsider = ethers.Wallet.createRandom().connect(ethers.provider);
    await owner.sendTransaction({
      to: outsider.address,
      value: ethers.parseEther("1"),
    });

    whitelistWallets = [...signerWallets, ...extraWallets];

    whitelist = whitelistWallets.map((wallet, index) => ({
      account: wallet.address,
      amount: ethers.parseUnits((100 + index * 25).toString(), 18),
    }));

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

  it("allows multiple successful claims across a larger whitelist", async function () {
    const claimants = [whitelist[0], whitelist[9], whitelist[19], whitelist[24], whitelist[29]];

    for (const claimant of claimants) {
      const claimerWallet = whitelistWallets.find((wallet) => wallet.address === claimant.account);
      const proof = getProof(merkleTree, claimant.account, claimant.amount);
      const balanceBefore = await token.balanceOf(claimant.account);

      await expect(airdrop.connect(claimerWallet).claim(claimant.account, claimant.amount, proof))
        .to.emit(airdrop, "Claimed")
        .withArgs(claimant.account, claimant.amount);

      expect(await airdrop.isClaimed(claimant.account)).to.equal(true);
      expect(await token.balanceOf(claimant.account)).to.equal(balanceBefore + claimant.amount);
    }
  });

  it("allows the last address in the 30-address whitelist to claim successfully", async function () {
    const lastEntry = whitelist[whitelist.length - 1];
    const lastWallet = whitelistWallets[whitelistWallets.length - 1];
    const proof = getProof(merkleTree, lastEntry.account, lastEntry.amount);

    await expect(airdrop.connect(lastWallet).claim(lastEntry.account, lastEntry.amount, proof))
      .to.emit(airdrop, "Claimed")
      .withArgs(lastEntry.account, lastEntry.amount);

    expect(await airdrop.isClaimed(lastEntry.account)).to.equal(true);
  });

  it("reverts when the proof is invalid", async function () {
    const claimant = whitelist[0];
    const unrelatedProof = getProof(merkleTree, whitelist[1].account, whitelist[1].amount);

    await expect(
      airdrop.connect(whitelistWallets[0]).claim(claimant.account, claimant.amount, unrelatedProof)
    ).to.be.revertedWithCustomError(airdrop, "InvalidProof");
  });

  it("reverts when an address tries to claim twice", async function () {
    const claimant = whitelist[5];
    const claimerWallet = whitelistWallets[5];
    const proof = getProof(merkleTree, claimant.account, claimant.amount);

    await airdrop.connect(claimerWallet).claim(claimant.account, claimant.amount, proof);

    await expect(
      airdrop.connect(claimerWallet).claim(claimant.account, claimant.amount, proof)
    )
      .to.be.revertedWithCustomError(airdrop, "AlreadyClaimed")
      .withArgs(claimant.account);
  });

  it("reverts when claiming with the wrong amount", async function () {
    const claimant = whitelist[10];
    const claimerWallet = whitelistWallets[10];
    const wrongAmount = ethers.parseUnits("9999", 18);
    const proof = getProof(merkleTree, claimant.account, claimant.amount);

    await expect(
      airdrop.connect(claimerWallet).claim(claimant.account, wrongAmount, proof)
    ).to.be.revertedWithCustomError(airdrop, "InvalidProof");
  });

  it("reverts when one user tries to claim on behalf of another", async function () {
    const target = whitelist[3];
    const proof = getProof(merkleTree, target.account, target.amount);

    await expect(
      airdrop.connect(whitelistWallets[4]).claim(target.account, target.amount, proof)
    )
      .to.be.revertedWithCustomError(airdrop, "UnauthorizedClaimer")
      .withArgs(whitelistWallets[4].address, target.account);
  });

  it("reverts for a non-whitelisted address", async function () {
    await expect(
      airdrop.connect(outsider).claim(outsider.address, ethers.parseUnits("100", 18), [])
    ).to.be.revertedWithCustomError(airdrop, "InvalidProof");
  });

  it("updates isClaimed after a successful claim", async function () {
    const claimant = whitelist[14];
    const claimerWallet = whitelistWallets[14];
    const proof = getProof(merkleTree, claimant.account, claimant.amount);

    expect(await airdrop.isClaimed(claimant.account)).to.equal(false);

    await airdrop.connect(claimerWallet).claim(claimant.account, claimant.amount, proof);

    expect(await airdrop.isClaimed(claimant.account)).to.equal(true);
  });

  it("updates token balances correctly after a successful claim", async function () {
    const claimant = whitelist[22];
    const claimerWallet = whitelistWallets[22];
    const proof = getProof(merkleTree, claimant.account, claimant.amount);

    const claimerBalanceBefore = await token.balanceOf(claimant.account);
    const airdropBalanceBefore = await token.balanceOf(await airdrop.getAddress());

    await airdrop.connect(claimerWallet).claim(claimant.account, claimant.amount, proof);

    expect(await token.balanceOf(claimant.account)).to.equal(claimerBalanceBefore + claimant.amount);
    expect(await token.balanceOf(await airdrop.getAddress())).to.equal(
      airdropBalanceBefore - claimant.amount
    );
  });
});
