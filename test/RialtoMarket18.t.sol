// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {RialtoMarketTest} from "./RialtoMarket.t.sol";

/**
 * The entire market suite again, with 18-decimal cash.
 *
 * Hedera's USDC is 6 decimals and most EVM stablecoins are 18. The arithmetic
 * in `rateBps` divides, so the two bases round differently: an ordering that
 * truncates a real fee to zero at 6 decimals can look perfectly healthy at 18,
 * and a mandate's minimum rate would then be trivially satisfiable on the chain
 * that actually matters. Running both bases is the only way that shows up.
 */
contract RialtoMarket18Test is RialtoMarketTest {
    function setUp() public override {
        _initDecimals(18);
        super.setUp();
    }
}
