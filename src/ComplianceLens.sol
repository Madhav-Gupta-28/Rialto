// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Status, Request} from "./RialtoTypes.sol";

interface IRialtoMarketView {
    function get(uint256 id) external view returns (Request memory);
}

/**
 * @title  ComplianceLens
 * @notice Answers the question a permissioned market actually gets asked:
 *         "why can't this settle?"
 *
 * A regulated security can be paused, an account can be frozen, removed from a
 * control list, or have its KYC revoked — at any time, by the issuer, without
 * warning anyone holding a position against it. When that happens `repay` and
 * `claim` revert with `TransferFailed`, which is true and useless.
 *
 * This reads the same state the settlement will read and names the obstacle
 * before anyone spends gas discovering it.
 *
 * ## Why it is a separate contract
 *
 * The market is audited and holds collateral. This holds nothing, can change
 * nothing, and is pure observation, so it has no business sharing an address
 * with the escrow. Keeping it out also means a new compliance facet can be
 * taught to the lens without redeploying the market and re-migrating every open
 * position.
 *
 * ## What it is not
 *
 * Advisory only. It reports what the security says right now, and a security
 * can change its mind in the same block that settlement is attempted. The
 * authority is always the transfer itself.
 */
contract ComplianceLens {
    enum Blocker {
        None, // settlement should go through
        NotFunded, // nothing to settle
        SecurityPaused, // the whole security is halted
        BeneficiaryFrozen, // tokens frozen on the account
        BeneficiaryNotListed, // frozen at address level, or never admitted
        BeneficiaryNoKyc, // KYC revoked or never granted
        Unreadable, // the security did not answer a compliance query
        EscrowFrozen, // the escrow's own holding is frozen
        EscrowNotListed, // the escrow came off the control list
        EscrowNoKyc // the escrow's credential is gone
    }

    /// @dev What a single account's standing is, before it is attributed to
    ///      whichever side of the transfer that account is on.
    enum Standing {
        Ok,
        Frozen,
        NotListed,
        NoKyc
    }

    IRialtoMarketView public immutable market;

    constructor(IRialtoMarketView m) {
        market = m;
    }

    /**
     * @notice Who would receive the collateral if this request settled now, and
     *         whether anything is standing in the way.
     *
     * @dev The beneficiary differs by ending: repayment returns the collateral
     *      to the borrower, default hands it to the lender. Checking the wrong
     *      one would clear a settlement that is about to fail.
     */
    function check(uint256 id) public view returns (Blocker blocker, address beneficiary) {
        Request memory r = market.get(id);

        if (r.status != Status.Funded) return (Blocker.NotFunded, address(0));

        // Past maturity the collateral goes to the lender; before it, home to
        // the borrower.
        beneficiary = block.timestamp > r.dueAt ? r.lender : r.borrower;

        (bool ok, bool isPaused) = _boolCall(r.collateral, abi.encodeWithSignature("paused()"));
        if (ok && isPaused) return (Blocker.SecurityPaused, beneficiary);

        // The escrow is the *sender* of every settlement, and a permissioned
        // security screens both sides of a transfer. Under `isWhiteList` the
        // market has to be on the control list to hold collateral at all
        // (§3.5), which means it can also be taken off one — and then no
        // position settles for anyone, whatever the beneficiary's own standing
        // is. Checking only the receiving side would report a clean bill of
        // health for a market that cannot move a token.
        Standing escrow = _standing(r.collateral, address(market));
        if (escrow == Standing.Frozen) return (Blocker.EscrowFrozen, beneficiary);
        if (escrow == Standing.NotListed) return (Blocker.EscrowNotListed, beneficiary);
        if (escrow == Standing.NoKyc) return (Blocker.EscrowNoKyc, beneficiary);

        Standing who = _standing(r.collateral, beneficiary);
        if (who == Standing.Frozen) return (Blocker.BeneficiaryFrozen, beneficiary);
        if (who == Standing.NotListed) return (Blocker.BeneficiaryNotListed, beneficiary);
        if (who == Standing.NoKyc) return (Blocker.BeneficiaryNoKyc, beneficiary);

        return (Blocker.None, beneficiary);
    }

    /**
     * @notice What one account's standing on a security is.
     *
     * @dev Two different freezes, and only one of them answers `isFrozen`.
     *
     *      On ATS v8 `setAddressFrozen(account, true)` leaves `isFrozen`
     *      reading false and removes the account from the control list instead.
     *      Measured on testnet:
     *
     *          before freeze   isFrozen false   isInControlList true
     *          after  freeze   isFrozen false   isInControlList false
     *
     *      So an address freeze surfaces as `NotListed`, which is the
     *      observable truth even though an operator would call it a freeze.
     *      `isFrozen` and `getFrozenTokens` describe the other kind: a partial
     *      freeze of part of a balance, which blocks a transfer of that portion
     *      without touching the control list.
     */
    function standingOf(address security, address account) external view returns (Standing) {
        return _standing(security, account);
    }

    function _standing(address security, address account) private view returns (Standing) {
        (bool ok, bool frozen) = _boolCall(security, abi.encodeWithSignature("isFrozen(address)", account));
        if (ok && frozen) return Standing.Frozen;

        (bool okAmt, uint256 frozenTokens) =
            _uintCall(security, abi.encodeWithSignature("getFrozenTokens(address)", account));
        if (okAmt && frozenTokens > 0) return Standing.Frozen;

        bool listed;
        (ok, listed) = _boolCall(security, abi.encodeWithSignature("isInControlList(address)", account));
        // A control list only blocks when the security is in whitelist mode. In
        // blacklist mode the same answer means the opposite, so the mode has to
        // be read rather than assumed.
        if (ok) {
            (bool okMode, bool whitelist) =
                _boolCall(security, abi.encodeWithSignature("getControlListType()"));
            if (okMode && whitelist && !listed) return Standing.NotListed;
            if (okMode && !whitelist && listed) return Standing.NotListed;
        }

        (bool okKyc, uint256 status) =
            _uintCall(security, abi.encodeWithSignature("getKycStatusFor(address)", account));
        // Only meaningful when the security runs internal KYC at all; a security
        // without it answers with nothing and is left alone.
        if (okKyc) {
            (bool okActive, bool active) =
                _boolCall(security, abi.encodeWithSignature("isInternalKycActivated()"));
            if (okActive && active && status == 0) return Standing.NoKyc;
        }

        return Standing.Ok;
    }

    /// @notice Whether settlement is expected to succeed right now.
    function canSettle(uint256 id) external view returns (bool) {
        (Blocker b,) = check(id);
        return b == Blocker.None;
    }

    /**
     * @dev Raw, like every other outward call in this project: a high-level call
     *      carries an extcodesize check that reverts in the caller's frame for
     *      anything codeless, and on Hedera that includes native tokens.
     *      A security that does not implement a facet answers with empty data,
     *      which is read as "nothing to say" rather than as a blocker.
     */
    function _boolCall(address target, bytes memory data) private view returns (bool ok, bool value) {
        (bool answered, bytes memory out) = target.staticcall(data);
        if (!answered || out.length < 32) return (false, false);
        return (true, abi.decode(out, (bool)));
    }

    function _uintCall(address target, bytes memory data) private view returns (bool ok, uint256 value) {
        (bool answered, bytes memory out) = target.staticcall(data);
        if (!answered || out.length < 32) return (false, 0);
        return (true, abi.decode(out, (uint256)));
    }
}
