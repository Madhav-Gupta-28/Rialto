// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Mandates} from "../src/Mandates.sol";
import {RialtoMarket} from "../src/RialtoMarket.sol";
import {Status} from "../src/RialtoTypes.sol";
import {MockERC20, MockSecurity} from "./mocks/Tokens.sol";
import {MockHSS} from "./mocks/MockHSS.sol";

/// Shared fixture. Cash decimals are a constructor knob so the whole suite can
/// be run again at 18 decimals, where a different rounding order would show up.
abstract contract Base is Test {
    Mandates internal mandates;
    RialtoMarket internal market;
    MockSecurity internal bond;
    MockERC20 internal cash;

    address internal constant HSS_ADDR = address(0x16b);

    address internal borrower = makeAddr("borrower");
    address internal alice = makeAddr("alice"); // underwriter
    address internal bob = makeAddr("bob"); // second underwriter
    address internal agentA = makeAddr("agentA");
    address internal agentB = makeAddr("agentB");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant PROSPECTUS = bytes32("prospectus");
    bytes32 internal constant REAL_HASH = keccak256("the document the issuer published");
    bytes32 internal constant LIE_HASH = keccak256("a document the borrower would prefer");

    uint8 internal cashDecimals;
    uint256 internal ONE_CASH;

    uint256 internal principal;
    uint256 internal collateralAmount;
    uint64 internal constant TERM = 30 days;
    uint64 internal constant WINDOW = 1 hours;
    uint256 internal goodBid;

    function _initDecimals(uint8 d) internal {
        cashDecimals = d;
        ONE_CASH = 10 ** d;
    }

    function setUp() public virtual {
        if (ONE_CASH == 0) _initDecimals(6);

        mandates = new Mandates();
        market = new RialtoMarket(mandates);
        bond = new MockSecurity("Acme 2027 Note", "ACME27", 18);
        cash = new MockERC20("USD Coin", "USDC", cashDecimals);

        principal = 100_000 * ONE_CASH;
        collateralAmount = 105_000e18;
        goodBid = 100_800 * ONE_CASH; // ~973 bps annualised over 30 days

        bond.setDocument(PROSPECTUS, "ipfs://prospectus", REAL_HASH);

        bond.mint(borrower, 1_000_000e18);
        cash.mint(alice, 10_000_000 * ONE_CASH);
        cash.mint(bob, 10_000_000 * ONE_CASH);
        cash.mint(borrower, 1_000_000 * ONE_CASH);

        vm.prank(borrower);
        bond.approve(address(market), type(uint256).max);
        vm.prank(alice);
        cash.approve(address(market), type(uint256).max);
        vm.prank(bob);
        cash.approve(address(market), type(uint256).max);
        vm.prank(borrower);
        cash.approve(address(market), type(uint256).max);

        _mandate(alice, agentA);
        _mandate(bob, agentB);
    }

    /* ─────────────────── helpers ─────────────────── */

    function _mandate(address owner, address agent) internal {
        vm.startPrank(owner);
        mandates.setMandate(agent, 500_000 * ONE_CASH, 1_000_000 * ONE_CASH, 500, 60 days);
        mandates.allowAsset(address(bond), true);
        vm.stopPrank();
    }

    function _open() internal returns (uint256 id) {
        vm.prank(borrower);
        id = market.open(
            address(bond), collateralAmount, address(cash), principal, TERM, WINDOW, PROSPECTUS, bytes32(0)
        );
    }

    function _openBidAward() internal returns (uint256 id) {
        id = _open();
        vm.prank(alice);
        market.bid(id, goodBid, bytes32("hcs-1"));
        vm.warp(block.timestamp + WINDOW);
        market.award(id);
    }

    /// Put the Hedera Schedule Service where the contract expects it. Etching
    /// only copies code, so the constructor never runs and the flags have to be
    /// set explicitly afterwards.
    function _installHSS() internal returns (MockHSS hss) {
        MockHSS impl = new MockHSS();
        vm.etch(HSS_ADDR, address(impl).code);
        hss = MockHSS(HSS_ADDR);
        hss.setCapacity(true);
    }

    function _status(uint256 id) internal view returns (Status) {
        return market.get(id).status;
    }
}
