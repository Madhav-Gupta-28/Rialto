// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice A request has exactly five endings, and only two of them move money.
enum Status {
    Open, // taking bids
    Funded, // cash delivered, term running
    Repaid, // borrower paid, collateral returned
    Defaulted, // term passed unpaid, collateral went to the lender
    Cancelled // withdrawn before award; no cash ever moved
}

/**
 * @notice One funding request.
 * @dev Field order is chosen for storage packing, not for reading. The three
 *      address+uint64 pairs each share a slot, which keeps a request at nine
 *      slots instead of thirteen.
 */
struct Request {
    // ── slot 0 ──
    address borrower;
    uint64 term; // seconds; the clock starts at award, not at open
    Status status;
    // ── slot 1 ──
    address collateral; // the ATS security being pledged
    uint64 bidDeadline; // the auction closes here
    bool docFromChain; // true if docHash was read off the security itself
    // ── slot 2 ──
    address cash; // HTS token via its ERC-20 facade
    uint64 dueAt; // set at award
    // ── slot 3 ──
    address lender; // set at award
    // ── slots 4-8 ──
    uint256 collateralAmount; // what actually arrived in escrow
    uint256 principal; // the amount sought
    uint256 repayAmount; // fixed at award; the only number that matters later
    bytes32 docName; // which document on the security was read
    bytes32 docHash; // frozen at open, so bids are bound to what was read
}

/// @notice The current best bid on a request. Lower `repayAmount` wins.
struct Bid {
    address underwriter; // whose capital funds it, and who takes the loss
    address submitter; // the agent key, or the underwriter bidding by hand
    uint256 repayAmount; // the bid
    bytes32 reasoningRef; // HCS message, published before the outcome is known
}
