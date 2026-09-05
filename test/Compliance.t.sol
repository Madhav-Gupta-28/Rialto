// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {RialtoMarket} from "../src/RialtoMarket.sol";
import {ComplianceLens, IRialtoMarketView} from "../src/ComplianceLens.sol";
import {Status} from "../src/RialtoTypes.sol";

/**
 * What a permissioned security does to a live loan.
 *
 * A regulated instrument can be paused, an account frozen, delisted or have its
 * KYC revoked, at any moment, by the issuer, without consulting anyone holding
 * a position against it. Rialto cannot prevent that and should not try. What it
 * must do is fail safely — never losing the collateral, never paying the wrong
 * party — and say plainly what is in the way.
 */
contract ComplianceTest is Base {
    ComplianceLens internal lens;
    address internal issuer = makeAddr("issuer"); // whoever attests the credentials

    function setUp() public override {
        super.setUp();
        lens = new ComplianceLens(IRialtoMarketView(address(market)));
    }

    /* ═════════ the security is halted ═════════ */

    /**
     * Pausing stops settlement in both directions, and neither side loses
     * anything by it. The position simply waits.
     */
    function test_aPausedSecurityStopsSettlementAndResumesIntact() public {
        uint256 id = _openBidAward();
        assertTrue(lens.canSettle(id), "settleable while the security is running");

        bond.pause();

        (ComplianceLens.Blocker b,) = lens.check(id);
        assertEq(uint8(b), uint8(ComplianceLens.Blocker.SecurityPaused), "and the lens names it");
        assertFalse(lens.canSettle(id));

        vm.prank(borrower);
        vm.expectRevert(RialtoMarket.TransferFailed.selector);
        market.repay(id);

        // Nothing was lost. The collateral is still escrowed against a request
        // that is still Funded.
        assertEq(uint8(_status(id)), uint8(Status.Funded));
        assertEq(bond.balanceOf(address(market)), collateralAmount);

        bond.unpause();
        assertTrue(lens.canSettle(id), "and it resumes");

        vm.prank(borrower);
        market.repay(id);
        assertEq(uint8(_status(id)), uint8(Status.Repaid));
        assertEq(bond.balanceOf(borrower), 1_000_000e18, "collateral home, in full");
    }

    /* ═════════ the party due the collateral is frozen ═════════ */

    /**
     * The known limit, made visible.
     *
     * A lender frozen before maturity cannot receive the collateral, so `claim`
     * cannot complete. That is the security's decision, not the market's, and
     * the right behaviour is to refuse rather than to pay someone else.
     */
    function test_aFrozenLenderBlocksClaimAndTheLensSaysSo() public {
        uint256 id = _openBidAward();
        vm.warp(block.timestamp + TERM + 1);

        bond.setAddressFrozen(alice, true);

        (ComplianceLens.Blocker b, address beneficiary) = lens.check(id);
        assertEq(uint8(b), uint8(ComplianceLens.Blocker.BeneficiaryFrozen));
        assertEq(beneficiary, alice, "past maturity the collateral is the lender's");

        vm.expectRevert(RialtoMarket.TransferFailed.selector);
        market.claim(id);
        assertEq(uint8(_status(id)), uint8(Status.Funded), "still claimable once unfrozen");

        bond.setAddressFrozen(alice, false);
        market.claim(id);
        assertEq(uint8(_status(id)), uint8(Status.Defaulted));
        assertEq(bond.balanceOf(alice), collateralAmount);
    }

    /// Before maturity the collateral is the borrower's, so it is the borrower
    /// whose compliance matters. Checking the wrong party would clear a
    /// settlement that is about to fail.
    function test_theLensChecksWhoeverIsActuallyDueTheCollateral() public {
        uint256 id = _openBidAward();

        bond.setAddressFrozen(borrower, true);
        (ComplianceLens.Blocker b, address who) = lens.check(id);
        assertEq(who, borrower, "before maturity, the borrower");
        assertEq(uint8(b), uint8(ComplianceLens.Blocker.BeneficiaryFrozen));

        bond.setAddressFrozen(borrower, false);
        bond.setAddressFrozen(alice, true);
        (b, who) = lens.check(id);
        assertEq(who, borrower, "the lender being frozen does not block a repayment");
        assertEq(uint8(b), uint8(ComplianceLens.Blocker.None));
    }

    /* ═════════ delisting and KYC ═════════ */

    /**
     * An address freeze on ATS does not answer `isFrozen`.
     *
     * `setAddressFrozen(account, true)` leaves `isFrozen` false and removes the
     * account from the control list instead — measured on testnet. So the lens
     * reports it as not listed, which is the observable truth. Recorded here so
     * the label is not mistaken for a bug later.
     */
    function test_anAddressFreezeSurfacesAsDelisting() public {
        uint256 id = _openBidAward();
        bond.setControlListType(true);
        bond.setInControlList(borrower, true);
        bond.setInControlList(address(market), true);
        bond.setInControlList(alice, true);
        assertTrue(lens.canSettle(id));

        // What ATS actually does when an address is frozen.
        bond.setInControlList(borrower, false);

        (ComplianceLens.Blocker b,) = lens.check(id);
        assertEq(uint8(b), uint8(ComplianceLens.Blocker.BeneficiaryNotListed));
    }

    /// A partial token freeze is the other kind, and it does answer.
    function test_aPartialTokenFreezeIsNamedAsAFreeze() public {
        uint256 id = _openBidAward();
        bond.setFrozenTokens(borrower, 1);

        (ComplianceLens.Blocker b,) = lens.check(id);
        assertEq(uint8(b), uint8(ComplianceLens.Blocker.BeneficiaryFrozen));
    }

    function test_aDelistedBeneficiaryIsNamed() public {
        uint256 id = _openBidAward();
        assertTrue(lens.canSettle(id));

        // The security runs a whitelist. Everyone who has to move a token is on
        // it — the escrow included, which is what makes the borrower's removal
        // the only obstacle rather than one of two.
        bond.setControlListType(true);
        bond.setInControlList(address(market), true);
        bond.setInControlList(alice, true);
        bond.setInControlList(borrower, false);

        (ComplianceLens.Blocker b,) = lens.check(id);
        assertEq(uint8(b), uint8(ComplianceLens.Blocker.BeneficiaryNotListed));
    }

    function test_revokedKycIsNamed() public {
        uint256 id = _openBidAward();

        bond.activateInternalKyc();
        bond.addIssuer(issuer);
        _admit(address(market));
        _admit(alice);
        // The borrower's KYC is never granted.

        (ComplianceLens.Blocker b,) = lens.check(id);
        assertEq(uint8(b), uint8(ComplianceLens.Blocker.BeneficiaryNoKyc));

        _admit(borrower);
        assertTrue(lens.canSettle(id), "and granting it clears the way");
    }

    /// A credential is issued by someone. An unregistered issuer cannot mint one,
    /// which is the difference between KYC as a flag and KYC as an attestation.
    function test_anUnregisteredIssuerCannotGrantKyc() public {
        bond.activateInternalKyc();

        vm.expectRevert(abi.encodeWithSignature("AccountIsNotIssuer(address)", issuer));
        _admit(borrower);

        bond.addIssuer(issuer);
        _admit(borrower);
        assertEq(bond.getKycStatusFor(borrower), 1);
    }

    function _admit(address account) internal {
        bond.grantKyc(account, "did:test:rialto", block.timestamp, block.timestamp + 365 days, issuer);
    }

    /* ═════════ the escrow has a standing of its own ═════════ */

    /**
     * The market is the sender of every settlement, and a permissioned security
     * screens both sides. Delisting the escrow stops every position at once —
     * and a lens that only looked at who is being paid would say nothing is
     * wrong right up until the transfer reverts.
     */
    function test_aDelistedEscrowIsNamedAndNotMistakenForAHealthyDeal() public {
        uint256 id = _openBidAward();
        assertTrue(lens.canSettle(id));

        // Whitelist mode, everyone admitted except the escrow itself.
        bond.setControlListType(true);
        bond.setInControlList(borrower, true);
        bond.setInControlList(alice, true);
        bond.setInControlList(address(market), false);

        (ComplianceLens.Blocker b, address who) = lens.check(id);
        assertEq(
            uint8(b), uint8(ComplianceLens.Blocker.EscrowNotListed), "the escrow is named, not the borrower"
        );
        assertEq(who, borrower, "and the beneficiary still reads as the party due the collateral");

        // Not a false alarm: the settlement really does fail.
        vm.prank(borrower);
        vm.expectRevert(RialtoMarket.TransferFailed.selector);
        market.repay(id);
        assertEq(uint8(_status(id)), uint8(Status.Funded));
        assertEq(bond.balanceOf(address(market)), collateralAmount, "collateral untouched");

        bond.setInControlList(address(market), true);
        assertTrue(lens.canSettle(id), "and readmitting the escrow clears it");
        vm.prank(borrower);
        market.repay(id);
        assertEq(uint8(_status(id)), uint8(Status.Repaid));
    }

    /// The escrow needs a credential of its own once internal KYC is on.
    function test_anEscrowWithoutKycIsNamed() public {
        uint256 id = _openBidAward();

        bond.activateInternalKyc();
        bond.addIssuer(issuer);
        _admit(borrower);
        _admit(alice);
        // The escrow's credential is never issued.

        (ComplianceLens.Blocker b,) = lens.check(id);
        assertEq(uint8(b), uint8(ComplianceLens.Blocker.EscrowNoKyc));

        _admit(address(market));
        assertTrue(lens.canSettle(id));
    }

    /// A frozen escrow is the escrow's problem, not the beneficiary's.
    function test_aFrozenEscrowIsNotBlamedOnTheBeneficiary() public {
        uint256 id = _openBidAward();

        bond.setAddressFrozen(address(market), true);

        (ComplianceLens.Blocker b, address who) = lens.check(id);
        assertEq(uint8(b), uint8(ComplianceLens.Blocker.EscrowFrozen));
        assertEq(who, borrower);
    }

    /**
     * Order matters. When both sides are blocked the escrow is reported first,
     * because that one stops every position on the market rather than this one.
     */
    function test_theEscrowIsReportedBeforeTheBeneficiary() public {
        uint256 id = _openBidAward();

        bond.setControlListType(true);
        bond.setInControlList(address(market), false);
        bond.setInControlList(borrower, false);

        (ComplianceLens.Blocker b,) = lens.check(id);
        assertEq(uint8(b), uint8(ComplianceLens.Blocker.EscrowNotListed));
    }

    /* ═════════ the lens is honest about what it does not know ═════════ */

    /// A security with no compliance facets is not blocked by their absence.
    function test_aPlainTokenIsNeverReportedAsBlocked() public {
        vm.prank(alice);
        mandates.allowAsset(address(cash), true);

        // `cash` is a plain ERC-20 with no pause, freeze or KYC at all.
        cash.mint(borrower, 500_000e6);
        vm.prank(borrower);
        cash.approve(address(market), type(uint256).max);

        vm.prank(borrower);
        uint256 id =
            market.open(address(cash), 1_000e6, address(bond), 100e18, TERM, WINDOW, PROSPECTUS, bytes32(0));
        assertEq(uint8(_status(id)), uint8(Status.Open));

        (ComplianceLens.Blocker b,) = lens.check(id);
        assertEq(uint8(b), uint8(ComplianceLens.Blocker.NotFunded), "unfunded, not blocked");
    }

    function test_anUnfundedRequestIsNotBlocked() public {
        uint256 id = _open();
        (ComplianceLens.Blocker b, address who) = lens.check(id);
        assertEq(uint8(b), uint8(ComplianceLens.Blocker.NotFunded));
        assertEq(who, address(0));
    }
}
