// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @notice The subset of ERC-20 Rialto actually calls.
 * @dev Declared with a `bool` return, but every call site treats the return
 *      data as optional. Hedera's HTS facade returns a 32-byte true; ATS
 *      security tokens are diamonds whose facets vary; older tokens return
 *      nothing at all. Assume nothing and check what came back.
 */
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
