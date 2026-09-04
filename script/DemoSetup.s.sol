// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IATSSecurity} from "../src/interfaces/IATS.sol";
import {DemoCash} from "../src/demo/DemoCash.sol";
import {Mandates} from "../src/Mandates.sol";
import {RialtoMarket} from "../src/RialtoMarket.sol";

/**
 * Stand up a demo with three genuinely separate parties.
 *
 * A single key playing every role would prove nothing — the interesting claims
 * are all about what one party cannot do to another. So the borrower, the
 * underwriter and the underwriter's agent are distinct accounts, and each step
 * is broadcast by whoever is actually entitled to take it.
 *
 *   forge script script/DemoSetup.s.sol:DemoSetup \
 *     --rpc-url $HEDERA_TESTNET_RPC --broadcast -g 140 --slow
 */
contract DemoSetup is Script {
    uint256 constant BOND_TO_BORROWER = 105_000e18;
    uint256 constant CASH_TO_UNDERWRITER = 1_000_000e6;
    uint256 constant GAS_ALLOWANCE = 8 ether; // HBAR for each party's own transactions

    function run() external {
        uint256 operatorPk = vm.envUint("PRIVATE_KEY");
        uint256 borrowerPk = vm.envUint("BORROWER_KEY");
        uint256 underwriterPk = vm.envUint("UNDERWRITER_KEY");

        address borrower = vm.addr(borrowerPk);
        address underwriter = vm.addr(underwriterPk);
        address agent = vm.envAddress("AGENT_ADDRESS");

        IATSSecurity bond = IATSSecurity(vm.envAddress("BOND_ADDRESS"));
        RialtoMarket market = RialtoMarket(payable(vm.envAddress("MARKET_ADDRESS")));
        Mandates mandates = Mandates(vm.envAddress("MANDATES_ADDRESS"));

        console2.log("borrower   ", borrower);
        console2.log("underwriter", underwriter);
        console2.log("agent      ", agent);

        /* ── the issuer: admit the parties, hand out the instrument ── */
        vm.startBroadcast(operatorPk);

        DemoCash cash = new DemoCash();
        console2.log("CASH_ADDRESS=", address(cash));

        // Under whitelist mode every address that touches the security has to
        // be on its control list. The borrower needs it to pledge, and the
        // lender needs it to be able to receive the collateral on a default.
        bond.addToControlList(borrower);
        bond.addToControlList(underwriter);

        bond.issue(borrower, BOND_TO_BORROWER, "");
        cash.mint(underwriter, CASH_TO_UNDERWRITER);

        // Each party pays for its own transactions, as it would in reality.
        payable(borrower).transfer(GAS_ALLOWANCE);
        payable(underwriter).transfer(GAS_ALLOWANCE);
        payable(agent).transfer(GAS_ALLOWANCE);

        vm.stopBroadcast();

        /* ── the underwriter: set the limits their agent must bid inside ── */
        vm.startBroadcast(underwriterPk);

        mandates.setMandate({
            agent: agent,
            maxPerDeal: 500_000e6,
            maxTotal: 1_000_000e6,
            minRateBps: 500,
            maxTerm: 60 days
        });
        mandates.allowAsset(address(bond), true);

        // The market moves cash straight from lender to borrower at award, so
        // the allowance is what makes the bid fundable.
        cash.approve(address(market), type(uint256).max);

        vm.stopBroadcast();

        /* ── the borrower: allow the escrow to take the collateral ── */
        vm.startBroadcast(borrowerPk);
        bond.approve(address(market), type(uint256).max);
        vm.stopBroadcast();

        console2.log("");
        console2.log("borrower bond balance ", bond.balanceOf(borrower));
        console2.log("underwriter cash      ", cash.balanceOf(underwriter));
        console2.log("mandate active        ", mandates.mandateOf(underwriter).active);
        console2.log("agent bound to        ", mandates.ownerOfAgent(agent));
        console2.log("");
        console2.log("Put CASH_ADDRESS in .env, then run OpenRequest.");
    }
}
