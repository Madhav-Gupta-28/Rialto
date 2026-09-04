// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {RialtoMarket} from "../src/RialtoMarket.sol";
import {Request} from "../src/RialtoTypes.sol";

/**
 * The borrower asks for money against the bond.
 *
 * Note what is *not* passed here: a price. The borrower fixes the principal,
 * the term and how much collateral they are pledging — which is the haircut
 * they are proposing — and underwriters answer with a repayment. One dimension,
 * legible on a screen in seconds.
 */
contract OpenRequest is Script {
    function run() external {
        uint256 borrowerPk = vm.envUint("BORROWER_KEY");
        RialtoMarket market = RialtoMarket(payable(vm.envAddress("MARKET_ADDRESS")));

        uint256 collateralAmount = vm.envOr("COLLATERAL", uint256(105_000e18));
        uint256 principal = vm.envOr("PRINCIPAL", uint256(100_000e6));
        uint64 term = uint64(vm.envOr("TERM", uint256(30 days)));
        uint64 window = uint64(vm.envOr("BID_WINDOW", uint256(300)));

        vm.startBroadcast(borrowerPk);
        uint256 id = market.open(
            vm.envAddress("BOND_ADDRESS"),
            collateralAmount,
            vm.envAddress("CASH_ADDRESS"),
            principal,
            term,
            window,
            bytes32("prospectus"),
            bytes32(0) // ignored — the security carries its own document
        );
        vm.stopBroadcast();

        Request memory r = market.get(id);
        console2.log("request        ", id);
        console2.log("principal      ", r.principal);
        console2.log("collateral     ", r.collateralAmount);
        console2.log("bid closes at  ", r.bidDeadline);
        console2.log("doc from chain ", r.docFromChain);
        console2.logBytes32(r.docHash);
    }
}
