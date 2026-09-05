// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CouponFor, CouponData, CouponAmountFor} from "../../src/interfaces/IATS.sol";

/**
 * A minimal ERC-20 whose return behaviour can be made deliberately awkward,
 * because the tokens Rialto actually meets are awkward: Hedera's HTS facade,
 * ATS diamonds, and older tokens that return nothing at all.
 */
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    /// 0 = return true, 1 = return nothing, 2 = return false, 3 = revert
    uint8 public returnMode;
    /// basis points skimmed on every transfer, to imitate a fee-on-transfer token
    uint16 public feeBps;

    constructor(string memory n, string memory s, uint8 d) {
        name = n;
        symbol = s;
        decimals = d;
    }

    function setReturnMode(uint8 m) external {
        returnMode = m;
    }

    function setFeeBps(uint16 f) external {
        feeBps = f;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function _move(address from, address to, uint256 amount) internal virtual {
        require(balanceOf[from] >= amount, "balance");
        uint256 fee = (amount * feeBps) / 10_000;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - fee;
        if (fee != 0) totalSupply -= fee;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return _ret();
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _move(from, to, amount);
        return _ret();
    }

    function _ret() internal view returns (bool) {
        if (returnMode == 3) revert("token reverted");
        if (returnMode == 2) return false;
        if (returnMode == 1) {
            // Return no data at all, the way several older tokens do.
            assembly {
                return(0, 0)
            }
        }
        return true;
    }
}

/**
 * A security that carries an ERC-1643 document, the way every Asset
 * Tokenization Studio deployment does. This is the collateral Rialto is built
 * for, and the document is the thing being underwritten.
 */
contract MockSecurity is MockERC20 {
    struct Doc {
        string uri;
        bytes32 hash;
        uint256 timestamp;
    }

    mapping(bytes32 => Doc) private _docs;
    bytes32[] private _names;

    /// When true, getDocument reverts, imitating a token with no such facet.
    bool public documentsBroken;

    constructor(string memory n, string memory s, uint8 d) MockERC20(n, s, d) {}

    function setDocumentsBroken(bool b) external {
        documentsBroken = b;
    }

    function setDocument(bytes32 docName, string calldata uri, bytes32 hash) external {
        if (_docs[docName].timestamp == 0) _names.push(docName);
        _docs[docName] = Doc(uri, hash, block.timestamp);
    }

    function getDocument(bytes32 docName) external view returns (string memory, bytes32, uint256) {
        require(!documentsBroken, "no documentation facet");
        Doc memory d = _docs[docName];
        return (d.uri, d.hash, d.timestamp);
    }

    function getAllDocuments() external view returns (bytes32[] memory) {
        return _names;
    }

    /* ─────────────────────────── compliance ─────────────────────────── */

    /**
     * Pause, freeze and KYC, enforced on transfer rather than merely reported.
     *
     * A mock that answers `paused() == true` while still moving tokens would
     * make every compliance test pass for the wrong reason. These block the
     * transfer, so the market really does see the failure a regulated security
     * would hand it.
     */
    bool public paused;
    bool public internalKycActivated;
    /// true = whitelist (must be listed), false = blacklist (must not be).
    /// Defaults to blacklist with an empty list, so nothing is blocked until a
    /// test says otherwise.
    bool public controlListType;
    mapping(address => bool) public inControlList;
    mapping(address => bool) public isFrozen;
    mapping(address => uint256) public kycStatus; // 0 = none, 1 = granted
    mapping(address => bool) public isIssuer;

    struct Credential {
        string vcId;
        uint256 validFrom;
        uint256 validTo;
        address issuer;
    }

    mapping(address => Credential) public kycOf;

    error TransferBlocked();
    error AccountIsNotIssuer(address issuer);

    function pause() external {
        paused = true;
    }

    function unpause() external {
        paused = false;
    }

    function setAddressFrozen(address account, bool frozen) external {
        isFrozen[account] = frozen;
    }

    mapping(address => uint256) public getFrozenTokens;

    function setFrozenTokens(address account, uint256 amount) external {
        getFrozenTokens[account] = amount;
    }

    function setControlListType(bool whitelist) external {
        controlListType = whitelist;
    }

    function getControlListType() external view returns (bool) {
        return controlListType;
    }

    function setInControlList(address account, bool listed) external {
        inControlList[account] = listed;
    }

    function addToControlList(address account) external returns (bool) {
        inControlList[account] = true;
        return true;
    }

    function isInControlList(address account) external view returns (bool) {
        return inControlList[account];
    }

    function activateInternalKyc() external {
        internalKycActivated = true;
    }

    function isInternalKycActivated() external view returns (bool) {
        return internalKycActivated;
    }

    function addIssuer(address issuer) external {
        isIssuer[issuer] = true;
    }

    /**
     * @dev This is the signature ATS actually exposes. There is no
     *      `grantKyc(address)` on a deployed security — asking for one gets
     *      `FunctionNotFound` from the diamond (§3.8) — so a mock offering the
     *      short form would let every KYC test pass against a shape the chain
     *      rejects.
     *
     *      The issuer check is modelled because it was measured: an
     *      unregistered issuer reverts `AccountIsNotIssuer`. The validity
     *      window is stored and deliberately not enforced, because what a real
     *      security answers for a lapsed credential has not been measured, and
     *      guessing it here would be the same mistake in a smaller place.
     */
    function grantKyc(
        address account,
        string calldata vcId,
        uint256 validFrom,
        uint256 validTo,
        address issuer
    ) external returns (bool) {
        if (!isIssuer[issuer]) revert AccountIsNotIssuer(issuer);
        kycOf[account] = Credential({vcId: vcId, validFrom: validFrom, validTo: validTo, issuer: issuer});
        kycStatus[account] = 1;
        return true;
    }

    function revokeKyc(address account) external returns (bool) {
        kycStatus[account] = 0;
        return true;
    }

    function getKycStatusFor(address account) external view returns (uint256) {
        return kycStatus[account];
    }

    function _move(address from, address to, uint256 amount) internal override {
        _compliance(from, to);
        super._move(from, to, amount);
    }

    /// @dev Applied to both sides of every transfer, as a real security does.
    function _compliance(address from, address to) internal view {
        if (paused) revert TransferBlocked();
        if (isFrozen[from] || isFrozen[to]) revert TransferBlocked();
        if (internalKycActivated && (kycStatus[from] == 0 || kycStatus[to] == 0)) revert TransferBlocked();
        if (controlListType) {
            if (!inControlList[from] || !inControlList[to]) revert TransferBlocked();
        } else {
            if (inControlList[from] || inControlList[to]) revert TransferBlocked();
        }
    }

    /* ─────────────────────────── coupons ─────────────────────────── */

    /**
     * A stand-in for the ATS coupon facet.
     *
     * It does not reproduce ATS's day-count arithmetic, and does not need to.
     * The property Rialto depends on is the one preserved here: the payable is
     * returned as an exact fraction and is *proportional to the holder's
     * balance*, which is what makes a pledged position's share of the escrow's
     * coupon computable at all.
     *
     * Checked against the real thing on testnet, where a coupon on a live ATS
     * security reported 143.785674 payable to an escrow holding 10,500 tokens
     * and 57.514269 to a holder of 4,200 — the same rate per token.
     */
    struct CouponRec {
        uint256 recordDate;
        uint256 ratePerToken; // scaled by 1e18
        bool set;
    }

    CouponRec[] private _coupons;

    function setCouponAt(uint256 recordDate, uint256 ratePerToken) external returns (uint256 couponId) {
        _coupons.push(CouponRec({recordDate: recordDate, ratePerToken: ratePerToken, set: true}));
        return _coupons.length;
    }

    function getCouponCount() external view returns (uint256) {
        return _coupons.length;
    }

    function getCouponFor(uint256 couponId, address account) external view returns (CouponFor memory c_) {
        require(couponId >= 1 && couponId <= _coupons.length, "no such coupon");
        CouponRec memory c = _coupons[couponId - 1];

        c_.tokenBalance = balanceOf[account];
        c_.decimals = decimals;
        c_.nominalValue = 100;
        c_.nominalValueDecimals = 0;
        c_.recordDateReached = block.timestamp >= c.recordDate;

        c_.coupon = CouponData({
            recordDate: c.recordDate,
            executionDate: c.recordDate + 1 days,
            startDate: c.recordDate,
            endDate: c.recordDate + 30 days,
            fixingDate: c.recordDate,
            rate: c.ratePerToken,
            rateDecimals: 18,
            rateStatus: 1
        });

        // Proportional to balance, as an exact fraction, exactly as ATS returns it.
        c_.couponAmount = CouponAmountFor({
            numerator: c_.tokenBalance * c.ratePerToken,
            denominator: 1e18 * (10 ** uint256(decimals)),
            recordDateReached: c_.recordDateReached
        });
        c_.isDisabled = false;
    }
}
