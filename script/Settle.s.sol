// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {RialtoMarket} from "../src/RialtoMarket.sol";
import {Status, Request} from "../src/RialtoTypes.sol";
import {IATSSecurity} from "../src/interfaces/IATS.sol";
import {DemoCash} from "../src/demo/DemoCash.sol";

/**
 * Close an auction, then end the position one way or the other.
 *
 * `award` is permissionless on purpose: once the window has shut, the outcome is
 * fully determined by state, so there is nothing for a caller to influence and
 * no reason to restrict who calls it. The same is true of `claim`. Only `repay`
 * is restricted, and only to the borrower, because it moves their money.
 *
 *   ACTION=award  forge script script/Settle.s.sol:Settle --rpc-url $HEDERA_TESTNET_RPC --broadcast -g 140
 *   ACTION=repay  ID=0 ...
 *   ACTION=claim  ID=0 ...
 */
contract Settle is Script {
    function run() external {
        RialtoMarket market = RialtoMarket(payable(vm.envAddress("MARKET_ADDRESS")));
        uint256 id = vm.envOr("ID", uint256(0));
        string memory action = vm.envOr("ACTION", string("award"));

        _report(market, id, "before");

        bytes32 a = keccak256(bytes(action));
        if (a == keccak256("award")) {
            // Anyone may call this. Using the borrower's key here only shows
            // that no privileged party is required.
            vm.startBroadcast(vm.envUint("BORROWER_KEY"));
            market.award(id);
            vm.stopBroadcast();
        } else if (a == keccak256("repay")) {
            uint256 pk = vm.envUint("BORROWER_KEY");
            Request memory r = market.get(id);
            vm.startBroadcast(pk);
            DemoCash(r.cash).approve(address(market), type(uint256).max);
            market.repay(id);
            vm.stopBroadcast();
        } else if (a == keccak256("claim")) {
            vm.startBroadcast(vm.envUint("BORROWER_KEY"));
            market.claim(id);
            vm.stopBroadcast();
        } else {
            revert("ACTION must be award, repay or claim");
        }

        _report(market, id, "after");
    }

    function _report(RialtoMarket market, uint256 id, string memory when) internal view {
        Request memory r = market.get(id);
        (address underwriter,, uint256 repayAmount, bytes32 reasoningRef) = market.bestBid(id);

        console2.log("");
        console2.log(when);
        console2.log("  status        ", _status(r.status));
        console2.log("  principal     ", r.principal);
        console2.log("  best bid      ", repayAmount);
        console2.log("  underwriter   ", underwriter);
        console2.log("  lender        ", r.lender);
        console2.log("  dueAt         ", r.dueAt);
        console2.log("  escrowed      ", IATSSecurity(r.collateral).balanceOf(address(market)));
        if (reasoningRef != bytes32(0)) {
            console2.log("  reasoning ref ");
            console2.logBytes32(reasoningRef);
        }
    }

    function _status(Status s) internal pure returns (string memory) {
        if (s == Status.Open) return "Open";
        if (s == Status.Funded) return "Funded";
        if (s == Status.Repaid) return "Repaid";
        if (s == Status.Defaulted) return "Defaulted";
        return "Cancelled";
    }
}
