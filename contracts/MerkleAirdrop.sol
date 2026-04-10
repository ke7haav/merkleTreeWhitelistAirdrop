// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title MerkleAirdrop
/// @notice Distributes ERC20 tokens to approved accounts using Merkle proofs.
contract MerkleAirdrop {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error AlreadyClaimed(address account);
    error InvalidProof();
    error UnauthorizedClaimer(address caller, address account);

    IERC20 public immutable token;
    bytes32 public immutable merkleRoot;

    mapping(address => bool) public claimed;

    event Claimed(address indexed account, uint256 amount);

    /// @notice Deploys the airdrop contract with the ERC20 token and fixed Merkle root.
    /// @param tokenAddress ERC20 token to distribute.
    /// @param root Merkle root generated from the airdrop whitelist data.
    constructor(address tokenAddress, bytes32 root) {
        if (tokenAddress == address(0)) {
            revert ZeroAddress();
        }

        token = IERC20(tokenAddress);
        merkleRoot = root;
    }

    /// @notice Claims tokens allocated to the caller in the Merkle tree.
    /// @param account Account receiving the airdrop. Must match `msg.sender`.
    /// @param amount Token amount assigned to the account in the Merkle tree.
    /// @param proof Merkle proof showing that `(account, amount)` is included in the tree.
    function claim(address account, uint256 amount, bytes32[] calldata proof) external {
        if (msg.sender != account) {
            revert UnauthorizedClaimer(msg.sender, account);
        }
        if (claimed[account]) {
            revert AlreadyClaimed(account);
        }

        bytes32 leaf = keccak256(abi.encodePacked(account, amount));
        bool isValidProof = MerkleProof.verify(proof, merkleRoot, leaf);

        if (!isValidProof) {
            revert InvalidProof();
        }

        claimed[account] = true;
        token.safeTransfer(account, amount);

        emit Claimed(account, amount);
    }

    /// @notice Returns whether an account has already claimed its allocation.
    /// @param account Account to query.
    /// @return True if the account has already claimed, otherwise false.
    function isClaimed(address account) external view returns (bool) {
        return claimed[account];
    }
}
