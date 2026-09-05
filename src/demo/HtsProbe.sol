// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title  HtsProbe
 * @notice Settles, on-chain, how a native HTS token answers a contract.
 *
 * Not part of the protocol. It exists because the market's transfer helpers
 * treat empty returndata as success — the only way to support tokens that
 * return nothing — and a call to an address with no code *also* returns empty.
 * Whether that is safe on Hedera depends on what an HTS token actually returns
 * to a contract, which cannot be settled by `eth_call` from an EOA.
 */
contract HtsProbe {
    function probe(address token, address who)
        external
        view
        returns (bool ok, uint256 len, bytes memory data)
    {
        (ok, data) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", who));
        len = data.length;
    }

    function probeDecimals(address token) external view returns (bool ok, uint256 len, bytes memory data) {
        (ok, data) = token.staticcall(abi.encodeWithSignature("decimals()"));
        len = data.length;
    }

    function codeSize(address a) external view returns (uint256) {
        return a.code.length;
    }
}
