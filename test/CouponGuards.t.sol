// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CouponPassThrough} from "../src/CouponPassThrough.sol";
import {CouponFor, CouponData, CouponAmountFor} from "../src/interfaces/IATS.sol";

/// `CouponPassThrough` is a library of internal functions, so reaching its
/// reverts from a test needs a real call boundary in the way.
contract CouponHarness {
    function owed(address security, address escrow, uint256 couponId, uint256 pledged, uint8 cashDecimals)
        external
        view
        returns (uint256, uint256)
    {
        return CouponPassThrough.owed(security, escrow, couponId, pledged, cashDecimals);
    }

    function tryRecordDate(address security, address escrow, uint256 couponId)
        external
        view
        returns (bool, uint256)
    {
        return CouponPassThrough.tryRecordDate(security, escrow, couponId);
    }

    function decimalsOf(address token) external view returns (uint8) {
        return CouponPassThrough.decimalsOf(token);
    }
}

/// Answers every coupon query with whatever the test needs it to answer.
contract StubSecurity {
    CouponFor private answer;
    bool public reverts;
    bytes public shortData;
    bool public useShort;

    function setReverts(bool r) external {
        reverts = r;
    }

    function setShort(bytes calldata d) external {
        shortData = d;
        useShort = true;
    }

    function set(uint256 tokenBalance, uint256 numerator, uint256 denominator, bool reached, uint256 recordDate)
        external
    {
        answer.tokenBalance = tokenBalance;
        answer.decimals = 18;
        answer.recordDateReached = reached;
        answer.coupon = CouponData(recordDate, 0, 0, 0, 0, 0, 0, 0);
        answer.couponAmount = CouponAmountFor(numerator, denominator, reached);
        useShort = false;
    }

    function getCouponFor(uint256, address) external view returns (CouponFor memory) {
        require(!reverts, "no");
        if (useShort) {
            bytes memory d = shortData;
            assembly {
                return(add(d, 32), mload(d))
            }
        }
        return answer;
    }
}

/// A token that will not say how many decimals it has.
contract MuteToken {
    fallback() external {}
}

contract CouponGuardsTest is Test {
    CouponHarness internal h = new CouponHarness();
    StubSecurity internal sec = new StubSecurity();

    /* ═════════ owed ═════════ */

    /// Asking before the record date is not a zero answer, it is no answer.
    function test_owedRevertsBeforeTheRecordDateIsReached() public {
        sec.set(1_000e18, 5e20, 1e18, false, 4242);
        vm.expectRevert(CouponPassThrough.RecordDateNotReached.selector);
        h.owed(address(sec), address(this), 1, 1_000e18, 6);
    }

    /// Nothing was in the snapshot, so nothing is owed — and it must not divide.
    function test_owedIsZeroWhenTheSnapshotHeldNothing() public {
        sec.set(0, 0, 1e18, true, 4242);
        (uint256 cash, uint256 recordDate) = h.owed(address(sec), address(this), 1, 1_000e18, 6);
        assertEq(cash, 0);
        assertEq(recordDate, 4242, "the record date is still reported");
    }

    function test_owedIsZeroWhenTheCouponPaysNothing() public {
        sec.set(1_000e18, 0, 0, true, 99);
        (uint256 cash,) = h.owed(address(sec), address(this), 1, 1_000e18, 6);
        assertEq(cash, 0, "a zero denominator must return, not divide by it");
    }

    function test_owedIsZeroWhenNothingWasPledged() public {
        sec.set(1_000e18, 5e20, 1e18, true, 99);
        (uint256 cash,) = h.owed(address(sec), address(this), 1, 0, 6);
        assertEq(cash, 0);
    }

    function test_owedRevertsWhenTheSecurityWillNotAnswer() public {
        sec.setReverts(true);
        vm.expectRevert(CouponPassThrough.CouponUnreadable.selector);
        h.owed(address(sec), address(this), 1, 1e18, 6);
    }

    /// A struct that decodes at fixed offsets still has to be long enough.
    function test_owedRevertsOnATruncatedAnswer() public {
        sec.setShort(new bytes(16 * 32));
        vm.expectRevert(CouponPassThrough.CouponUnreadable.selector);
        h.owed(address(sec), address(this), 1, 1e18, 6);
    }

    /// A codeless address answers every call with success and no data. That is
    /// the Hedera trap, and it must read as unreadable rather than as zero.
    function test_owedRevertsForACodelessSecurity() public {
        address codeless = address(0xDEAD);
        assertEq(codeless.code.length, 0);
        vm.expectRevert(CouponPassThrough.CouponUnreadable.selector);
        h.owed(codeless, address(this), 1, 1e18, 6);
    }

    /* ═════════ tryRecordDate — reports rather than reverts ═════════ */

    function test_tryRecordDateReportsFailureInsteadOfReverting() public {
        sec.setReverts(true);
        (bool ok, uint256 rd) = h.tryRecordDate(address(sec), address(this), 1);
        assertFalse(ok);
        assertEq(rd, 0);
    }

    function test_tryRecordDateRefusesATruncatedAnswer() public {
        sec.setShort(new bytes(16 * 32));
        (bool ok,) = h.tryRecordDate(address(sec), address(this), 1);
        assertFalse(ok, "short data is not an answer");
    }

    function test_tryRecordDateReadsARealOne() public {
        sec.set(1e18, 1, 1e18, true, 777);
        (bool ok, uint256 rd) = h.tryRecordDate(address(sec), address(this), 1);
        assertTrue(ok);
        assertEq(rd, 777);
    }

    /* ═════════ decimalsOf ═════════ */

    function test_decimalsOfRevertsWhenTheTokenWillNotSay() public {
        MuteToken mute = new MuteToken();
        vm.expectRevert(CouponPassThrough.CouponUnreadable.selector);
        h.decimalsOf(address(mute));
    }

    function test_decimalsOfRevertsForACodelessToken() public {
        vm.expectRevert(CouponPassThrough.CouponUnreadable.selector);
        h.decimalsOf(address(0xBEEF));
    }
}
