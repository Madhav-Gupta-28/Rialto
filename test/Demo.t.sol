// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {DemoCash} from "../src/demo/DemoCash.sol";
import {HtsProbe} from "../src/demo/HtsProbe.sol";
import {TimeProbe} from "../src/demo/TimeProbe.sol";
import {MockHSS} from "./mocks/MockHSS.sol";

/**
 * The contracts under `src/demo` are not the protocol, but two of them are
 * deployed on testnet and one of them holds every dUSD the demo moves. "Not
 * part of the protocol" is a reason to keep them out of the market's trust
 * assumptions, not a reason to ship them untested.
 */
contract DemoCashTest is Test {
    DemoCash internal cash;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        cash = new DemoCash();
    }

    function test_metadataIsSixDecimalCash() public view {
        assertEq(cash.name(), "Rialto Demo USD");
        assertEq(cash.symbol(), "dUSD");
        assertEq(cash.decimals(), 6);
    }

    function test_mintCreditsAndTracksSupply() public {
        cash.mint(alice, 1_000e6);
        cash.mint(bob, 500e6);
        assertEq(cash.balanceOf(alice), 1_000e6);
        assertEq(cash.totalSupply(), 1_500e6);
    }

    function test_transferMovesTheBalance() public {
        cash.mint(alice, 1_000e6);
        vm.prank(alice);
        assertTrue(cash.transfer(bob, 400e6));
        assertEq(cash.balanceOf(alice), 600e6);
        assertEq(cash.balanceOf(bob), 400e6);
    }

    function test_transferBeyondTheBalanceIsRefused() public {
        cash.mint(alice, 10e6);
        vm.prank(alice);
        vm.expectRevert(DemoCash.InsufficientBalance.selector);
        cash.transfer(bob, 11e6);
    }

    function test_transferFromSpendsTheAllowance() public {
        cash.mint(alice, 1_000e6);
        vm.prank(alice);
        cash.approve(address(this), 600e6);

        assertTrue(cash.transferFrom(alice, bob, 250e6));
        assertEq(cash.allowance(alice, address(this)), 350e6, "the allowance is drawn down");
        assertEq(cash.balanceOf(bob), 250e6);
    }

    function test_transferFromBeyondTheAllowanceIsRefused() public {
        cash.mint(alice, 1_000e6);
        vm.prank(alice);
        cash.approve(address(this), 100e6);
        vm.expectRevert(DemoCash.InsufficientAllowance.selector);
        cash.transferFrom(alice, bob, 101e6);
    }

    /// An infinite allowance is the one the market asks for, and it must not
    /// decay — otherwise a long-lived approval quietly runs out.
    function test_anInfiniteAllowanceIsNotDrawnDown() public {
        cash.mint(alice, 1_000e6);
        vm.prank(alice);
        cash.approve(address(this), type(uint256).max);

        cash.transferFrom(alice, bob, 900e6);
        assertEq(cash.allowance(alice, address(this)), type(uint256).max);
    }

    /// Balances and supply must not drift apart, whatever order things happen in.
    function testFuzz_supplyAlwaysEqualsTheBalances(uint96 a, uint96 b, uint96 move) public {
        cash.mint(alice, a);
        cash.mint(bob, b);
        vm.assume(move <= a);
        vm.prank(alice);
        cash.transfer(bob, move);
        assertEq(cash.balanceOf(alice) + cash.balanceOf(bob), cash.totalSupply());
    }
}

/// A token with a `balanceOf` that answers nothing, like a native Hedera token.
contract Mute {
    fallback() external {}
}

contract HtsProbeTest is Test {
    HtsProbe internal probe = new HtsProbe();

    /// The finding the probe exists to establish: success with zero bytes is
    /// what a codeless address returns, and it is indistinguishable from a
    /// token that simply answers nothing.
    function test_aCodelessAddressAnswersSuccessWithNoData() public view {
        (bool ok, uint256 len,) = probe.probe(address(0xDEAD), address(this));
        assertTrue(ok, "the call succeeded");
        assertEq(len, 0, "and said nothing");
        assertEq(probe.codeSize(address(0xDEAD)), 0);
    }

    function test_aContractThatAnswersNothingLooksTheSame() public {
        Mute mute = new Mute();
        (bool ok, uint256 len,) = probe.probe(address(mute), address(this));
        assertTrue(ok);
        assertEq(len, 0);
        assertGt(probe.codeSize(address(mute)), 0, "but it does have code, which is the only tell");
    }

    function test_decimalsIsProbedTheSameWay() public {
        Mute mute = new Mute();
        (bool ok, uint256 len,) = probe.probeDecimals(address(mute));
        assertTrue(ok);
        assertEq(len, 0);
    }
}

contract TimeProbeTest is Test {
    address internal constant HSS_ADDR = address(0x16b);
    TimeProbe internal probe;

    function setUp() public {
        probe = new TimeProbe();
        MockHSS impl = new MockHSS();
        vm.etch(HSS_ADDR, address(impl).code);
        // `etch` copies code and not storage, so the constructor never ran and
        // every flag reads as its zero value.
        MockHSS(HSS_ADDR).setCapacity(true);
    }

    function test_schedulingRecordsWhatWasAskedFor() public {
        uint256 t0 = block.timestamp;
        address schedule = probe.scheduleStamp(600);
        assertTrue(schedule != address(0));
        assertEq(probe.scheduledAt(), t0);
        assertEq(probe.expiryAsked(), t0 + 600);
    }

    function test_stampRecordsWhatTheEvmSeesAtExecution() public {
        vm.warp(1_700_000_000);
        probe.stamp();
        assertEq(probe.seenTimestamp(), 1_700_000_000);
        assertEq(probe.calls(), 1);
    }

    function test_schedulingIsRefusedWhenTheSecondIsFull() public {
        MockHSS(HSS_ADDR).setCapacity(false);
        vm.expectRevert(bytes("no capacity"));
        probe.scheduleStamp(600);
    }

    function test_schedulingIsRefusedWhenTheServiceWillNotBook() public {
        MockHSS(HSS_ADDR).setFailCreate(true);
        // A non-success code still returns 64 bytes, so this gets past the
        // length check and comes back with a zero schedule address.
        address schedule = probe.scheduleStamp(600);
        assertEq(schedule, address(0));
    }

    /// A service that answers with too few bytes to decode is not a service.
    function test_schedulingIsRefusedWhenTheAnswerIsTruncated() public {
        ShortAnswerHss short = new ShortAnswerHss();
        vm.etch(HSS_ADDR, address(short).code);
        vm.expectRevert(bytes("schedule call failed"));
        probe.scheduleStamp(600);
    }

    function test_theProbeCanBeFundedForItsOwnScheduling() public {
        (bool ok,) = address(probe).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(probe).balance, 1 ether);
    }
}

/// Reports capacity, then answers `scheduleCall` with a single word.
contract ShortAnswerHss {
    function hasScheduleCapacity(uint256, uint256) external pure returns (bool) {
        return true;
    }

    function scheduleCall(address, uint256, uint256, uint64, bytes memory) external pure returns (bytes32) {
        return bytes32(uint256(22));
    }
}
