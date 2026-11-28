// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title tNVDAc — mock NVDA token for the Rowan Stocks demo (Base Sepolia)
/// @notice TEST TOKEN ONLY. This is NOT the real Coinbase B20 NVDAc token
///         (which only exists on Base mainnet). It has no value, no backing,
///         and no claim on any real share. It exists so anyone can try the
///         Rowan Stocks stop-loss rule on Base Sepolia testnet without
///         holding a real token.
/// @dev Minting is open on purpose for the demo, capped at 1,000 tokens per
///      call. No owner, no admin, no pause, no fees. 8 decimals to mirror
///      the real B20 NVDAc (8 decimals).
contract MockToken is ERC20 {
    /// @notice Maximum tNVDAc mintable in one call (1,000 tokens, 8 decimals).
    uint256 public constant MAX_MINT_PER_TX = 1000 * 10 ** 8;

    constructor() ERC20("Test NVDA (Mock)", "tNVDAc") {}

    /// @notice Token decimals: 8, mirroring the real B20 NVDAc.
    function decimals() public pure override returns (uint8) {
        return 8;
    }

    /// @notice Mint test tNVDAc to any address. Demo faucet only.
    /// @param to The wallet receiving the test tokens.
    /// @param amount Amount in the token's smallest units (8 decimals).
    function mint(address to, uint256 amount) external {
        require(to != address(0), "MockToken: mint to zero address");
        require(amount > 0, "MockToken: amount is zero");
        require(amount <= MAX_MINT_PER_TX, "MockToken: over per-tx mint cap");
        _mint(to, amount);
    }
}
