// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {ComplianceLens, IRialtoMarketView} from "../src/ComplianceLens.sol";

/// A security that answers compliance queries with nothing readable. Not a
/// contrivance: a plain ERC-20 pledged as collateral looks exactly like this,
/// and so does a native Hedera token, which has no EVM bytecode at all.
contract SilentSecurity {
    fallback() external {}
}

/// Answers, but with too few bytes to decode.
contract TruncatedSecurity {
    fallback() external {
        assembly {
            mstore(0, 1)
            return(0, 16)
        }
    }
}

/**
 * The lens read one account at a time.
 *
 * `check` is the whole-request question; `standingOf` is the piece the agent
 * asks before it bids, because an underwriter that cannot receive the
 * collateral on a default is pricing a secured loan while owning an unsecured
 * one. It is the same code path either way, so it is worth pinning directly.
 */
contract LensGuardsTest is Base {
    ComplianceLens internal lens;
    address internal issuer = makeAddr("issuer");

    function setUp() public override {
        super.setUp();
        lens = new ComplianceLens(IRialtoMarketView(address(market)));
    }

    function test_aClearAccountReadsAsOk() public view {
        assertEq(uint8(lens.standingOf(address(bond), borrower)), uint8(ComplianceLens.Standing.Ok));
    }

    function test_aFrozenAccountReadsAsFrozen() public {
        bond.setAddressFrozen(alice, true);
        assertEq(uint8(lens.standingOf(address(bond), alice)), uint8(ComplianceLens.Standing.Frozen));
    }

    /// A partial freeze blocks the transfer without touching the control list.
    function test_partiallyFrozenTokensAlsoReadAsFrozen() public {
        bond.setFrozenTokens(alice, 1);
        assertEq(uint8(lens.standingOf(address(bond), alice)), uint8(ComplianceLens.Standing.Frozen));
    }

    function test_anUnlistedAccountUnderAWhitelistReadsAsNotListed() public {
        bond.setControlListType(true);
        bond.setInControlList(alice, false);
        assertEq(uint8(lens.standingOf(address(bond), alice)), uint8(ComplianceLens.Standing.NotListed));
    }

    /**
     * The same answer means the opposite under a blacklist, which is why the
     * mode is read rather than assumed. Being *on* the list is the blocker here.
     */
    function test_aListedAccountUnderABlacklistReadsAsNotListed() public {
        bond.setControlListType(false);
        bond.setInControlList(alice, true);
        assertEq(uint8(lens.standingOf(address(bond), alice)), uint8(ComplianceLens.Standing.NotListed));
    }

    function test_anAccountWithoutAKycCredentialReadsAsNoKyc() public {
        bond.activateInternalKyc();
        bond.addIssuer(issuer);
        assertEq(uint8(lens.standingOf(address(bond), alice)), uint8(ComplianceLens.Standing.NoKyc));

        bond.grantKyc(alice, "did:test:rialto", block.timestamp, block.timestamp + 365 days, issuer);
        assertEq(uint8(lens.standingOf(address(bond), alice)), uint8(ComplianceLens.Standing.Ok));
    }

    /// KYC status is only meaningful when the security runs internal KYC. A
    /// security that does not must not have every account read as unbanked.
    function test_kycIsIgnoredWhenTheSecurityDoesNotRunIt() public view {
        assertEq(uint8(lens.standingOf(address(bond), alice)), uint8(ComplianceLens.Standing.Ok));
    }

    /* ═════════ a security that says nothing ═════════ */

    function test_aSilentSecurityBlocksNobody() public {
        SilentSecurity silent = new SilentSecurity();
        assertEq(uint8(lens.standingOf(address(silent), alice)), uint8(ComplianceLens.Standing.Ok));
    }

    function test_aTruncatedAnswerIsNotAnAnswer() public {
        TruncatedSecurity t = new TruncatedSecurity();
        assertEq(uint8(lens.standingOf(address(t), alice)), uint8(ComplianceLens.Standing.Ok));
    }

    /// The Hedera case: no code at all, every call succeeding with no data.
    function test_aCodelessSecurityBlocksNobody() public view {
        assertEq(uint8(lens.standingOf(address(0xDEAD), alice)), uint8(ComplianceLens.Standing.Ok));
    }
}
