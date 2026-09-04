// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @notice The ERC-1643 Documentation facet carried by every Asset Tokenization
 *         Studio security.
 *
 * This is the one ATS facet Rialto cannot substitute. Mint could be an ERC-20
 * and the control list could be a mapping, but nothing else puts a regulated
 * security's offering document on-chain under a role-gated write with a hash
 * anyone can check. Rialto reads it as the price-forming input: the document is
 * not an attachment to the deal, it is the thing being underwritten.
 *
 * `getDocument` returns the URI, the hash of the bytes it should contain, and
 * the timestamp of the last write.
 */
interface IERC1643 {
    function getDocument(bytes32 name) external view returns (string memory, bytes32, uint256);
    function getAllDocuments() external view returns (bytes32[] memory);
}
