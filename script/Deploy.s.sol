// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {Mandates} from "../src/Mandates.sol";
import {RialtoMarket} from "../src/RialtoMarket.sol";

/**
 * Deploy Rialto.
 *
 *   forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url $HEDERA_TESTNET_RPC --broadcast -g 2500
 *
 * The `-g 2500` is not optional on Hedera and it is not a gas *limit*. It is
 * `--gas-estimate-multiplier`, and Hedera's relay under-reports the gas a
 * deployment needs badly enough that the default 130% silently runs out
 * mid-constructor. `--gas-limit` looks like the right flag and is not: forge
 * treats it as an alias for `--block-gas-limit` and ignores it here, which
 * costs a deployment's worth of HBAR to discover.
 */
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address operator = vm.addr(pk);

        console2.log("operator ", operator);
        console2.log("balance  ", operator.balance);
        console2.log("chainid  ", block.chainid);

        vm.startBroadcast(pk);

        Mandates mandates = new Mandates();
        RialtoMarket market = new RialtoMarket(mandates);

        // Seed the market with a little HBAR so it can pay for scheduling its
        // own settlements. Nothing depends on this balance: an empty one just
        // means maturity is settled by a manual claim() instead. Skipped when
        // the operator is thin, so a low balance cannot fail the deployment.
        if (operator.balance > 20 ether) {
            (bool ok,) = payable(address(market)).call{value: 5 ether}("");
            if (ok) console2.log("funded market for scheduling");
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("MANDATES_ADDRESS=", address(mandates));
        console2.log("MARKET_ADDRESS=  ", address(market));
        console2.log("");
        _reportScheduleService();
    }

    /**
     * Report whether the Hedera Schedule Service is reachable from here.
     *
     * The market degrades to manual settlement without it, so this is
     * information rather than a gate — but knowing which mode a deployment is
     * in beats finding out at the first maturity.
     */
    function _reportScheduleService() internal view {
        address hss = address(0x16b);
        if (hss.code.length == 0) {
            console2.log("HSS: absent -- settlement will be manual claim()");
            return;
        }
        (bool ok, bytes memory data) =
            hss.staticcall(abi.encodeWithSignature("hasScheduleCapacity(uint256,uint256)", block.timestamp + 1 days, 400_000));
        if (ok && data.length >= 32) {
            console2.log("HSS: live, capacity in 24h =", abi.decode(data, (bool)));
        } else {
            console2.log("HSS: present but did not answer -- settlement will be manual");
        }
    }
}
