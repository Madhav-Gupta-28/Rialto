// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IERC1643} from "./interfaces/IERC1643.sol";
import {IHederaScheduleService} from "./interfaces/IHederaScheduleService.sol";
import {Mandates} from "./Mandates.sol";
import {Status, Request, Bid} from "./RialtoTypes.sol";
import {CouponPassThrough} from "./CouponPassThrough.sol";

/**
 * @title  RialtoMarket
 * @notice An underwriting market for tokenized securities.
 *
 * ## The claim this contract has to survive
 *
 * No price feed is read anywhere in it. Search for one; there isn't a call
 * whose return value can change who gets paid. The repayment is fixed at award
 * by agreement between two parties, and every branch after that depends only on
 * time and on whether that fixed amount arrived. That is the whole design:
 * an illiquid security has no price to read, so pretending to read one is how
 * lending protocols get drained.
 *
 * ## Where the money is
 *
 * Cash never rests here. At award it moves lender -> borrower and at repayment
 * borrower -> lender, both by `transferFrom` inside a single call. Only the
 * collateral is escrowed. On Hedera that also means this contract needs no HTS
 * association for the cash token, which removes a whole class of deployment
 * failure.
 *
 * ## What is deliberately trusted
 *
 * The issuer's document is trusted to be *what the issuer published*, never to
 * be true. Rialto proves which bytes were read, and the underwriter that
 * believes a forged prospectus loses its own capital. That is the mechanism,
 * not a gap in it.
 */
contract RialtoMarket {
    Mandates public immutable mandates;

    /**
     * Hedera Schedule Service, the system contract at `0x…016b` (HIP-1215).
     * Only ever reached through the guarded helpers at the bottom of this file,
     * because on any network without it these calls fail at the EVM level.
     */
    address private constant HSS = address(0x16b);
    int64 private constant HSS_SUCCESS = 22;

    /**
     * Gas handed to the scheduled `claim`.
     *
     * Set from a measurement, not an estimate. A `claim` against a real Asset
     * Tokenization Studio security used **472,252 gas** on testnet: the transfer
     * runs through a diamond's control-list and compliance facets, which a
     * plain ERC-20 mock does not. The first version budgeted 400,000, every
     * unit test passed because the mock is cheap, and the schedule then fired
     * in production and reverted out of gas.
     *
     * `eth_estimateGas` reported 277,394 for the same call, which is why the
     * number here comes from a receipt instead — the relay under-reports, as
     * §3.4.4 says in as many words.
     *
     * Unused gas is refunded, so the headroom costs almost nothing; the only
     * pressure against raising it further is that `hasScheduleCapacity` is
     * likelier to refuse a larger reservation.
     */
    uint256 private constant CLAIM_GAS = 1_200_000;

    /// An auction shorter than this cannot be reacted to by a human bidder.
    uint64 public constant MIN_BID_WINDOW = 60;

    /**
     * And an auction longer than this cannot be resolved at all.
     *
     * `award` and `cancel` both require the deadline to have passed, so an
     * unbounded window is a way to strand a request in Open forever — and with
     * it every underwriter who bid, whose `reservedExposure` could then never be
     * released. That is the same grief AWARD_WINDOW exists to stop, reached
     * through a different door.
     */
    uint64 public constant MAX_BID_WINDOW = 7 days;

    /**
     * 60 days, not 90, and the number comes from a measured network limit
     * rather than a preference. Hedera refuses a scheduled transaction whose
     * expiry is more than `scheduling.maxExpirationFutureSeconds` = 5,356,800s
     * (62 days) ahead. Verified on live testnet and mainnet:
     * `hasScheduleCapacity` is true at exactly 62 days and false at 63. A term
     * past that ceiling could not have its settlement scheduled at award, which
     * is what `_scheduleSettlement` depends on. 60 leaves two days of margin.
     */
    uint64 public constant MAX_TERM = 60 days;

    /**
     * After the auction closes, `award` has this long to succeed. Past it,
     * anyone may cancel the request.
     *
     * This exists because `award` can fail for reasons nobody controls — a
     * revoked cash allowance, a lender removed from the security's control
     * list. Without a permissionless escape, a borrower who simply walked away
     * would pin the winning bidder's capacity in `reservedExposure` forever,
     * and that is a cheap grief: open requests, attract bids, disappear.
     */
    uint64 public constant AWARD_WINDOW = 7 days;

    uint16 public constant BPS = 10_000;

    /**
     * How far past maturity the settlement is scheduled.
     *
     * Not one second, which is the obvious choice and is wrong. A scheduled
     * call on Hedera executes with a `block.timestamp` that *lags* the second
     * it was scheduled for. Measured directly with a probe contract on testnet:
     * a call scheduled for 1788608600 ran at consensus 1788608600.149 and saw
     * `block.timestamp == 1788608598`, two seconds early.
     *
     * `claim` requires `block.timestamp > dueAt`, so scheduling at `dueAt + 1`
     * hands the network a call that reverts `StillCurrent` — which is exactly
     * what happened twice in production, silently, while every unit test passed
     * because Foundry's clock has no such lag.
     *
     * A minute of margin costs a minute of settlement latency on a loan
     * measured in days, and absorbs far more drift than has ever been observed.
     */
    uint64 public constant SETTLEMENT_MARGIN = 60;

    /// Ceiling above which `rateBps` caps instead of risking an overflow.
    uint256 private constant MAX_AMOUNT = type(uint128).max;

    Request[] private _requests;

    mapping(uint256 => Bid) public bestBid;
    mapping(uint256 => uint256) public bidCount;

    /// Principal on positions already funded.
    mapping(address => uint256) public liveExposure;

    /**
     * Principal committed by a standing best bid that has not yet resolved.
     *
     * Without this, `maxTotal` is checkable but not enforceable: an underwriter
     * could hold the best bid on twenty auctions at once, each passing the
     * limit check independently, and breach it the moment they all awarded.
     */
    mapping(address => uint256) public reservedExposure;

    /// requestId => the HSS schedule that will call `claim` at maturity, if one
    /// was created. `address(0)` means settlement is manual only.
    mapping(uint256 => address) public settlementSchedule;

    /**
     * Cash the lender owes the borrower for income the collateral threw off
     * while it was pledged — the manufactured payment.
     *
     * A coupon belongs to whoever holds the security on its record date, and
     * while a loan is live that is this contract. The borrower still owns the
     * bond economically and gets it back on repayment, so the income is theirs.
     * Under the GMRA the collateral taker owes it to the collateral giver, and
     * in practice it is netted at repayment rather than wired separately, which
     * is what `repay` does with this figure.
     */
    mapping(uint256 => uint256) public manufacturedOwed;

    /// requestId => couponId => already counted, so it cannot be counted twice.
    mapping(uint256 => mapping(uint256 => bool)) public couponRecorded;

    /// Enough for the read, the arithmetic and two storage writes.
    uint256 private constant COUPON_GAS = 900_000;

    event Requested(
        uint256 indexed id,
        address indexed borrower,
        address collateral,
        uint256 collateralAmount,
        uint256 principal,
        uint64 term,
        bytes32 docName,
        bytes32 docHash,
        bool docFromChain
    );
    event BidPlaced(
        uint256 indexed id,
        address indexed underwriter,
        address submitter,
        uint256 repayAmount,
        bytes32 reasoningRef
    );
    event Awarded(uint256 indexed id, address indexed lender, uint256 principal, uint256 repayAmount, uint64 dueAt);
    event Repaid(uint256 indexed id, uint256 amount);
    event Defaulted(uint256 indexed id, address indexed lender, uint256 collateralAmount);
    event Cancelled(uint256 indexed id, address indexed by);
    event BidReleased(uint256 indexed id, address indexed underwriter);
    event SettlementScheduled(uint256 indexed id, address indexed schedule, uint256 expirySecond);
    event SettlementReleaseFailed(uint256 indexed id, address indexed schedule);
    event CouponRecorded(uint256 indexed id, uint256 indexed couponId, address indexed beneficiary, uint256 amount);
    event ManufacturedPaymentSettled(
        uint256 indexed id, address indexed payer, address indexed beneficiary, uint256 amount
    );
    event CouponScheduled(uint256 indexed id, uint256 indexed couponId, address schedule, uint256 recordDate);

    error BadWindow();
    error BadTerm();
    error ZeroAmount();
    error ZeroAddress();
    error CashIsCollateral();
    error NotOpen();
    error AuctionClosed();
    error AuctionLive();
    error NoBids();
    error NotBetter();
    error BelowPrincipal();
    error NoMandate();
    error OverPerDeal();
    error OverTotal();
    error RateTooLow();
    error TermTooLong();
    error AssetNotAllowed();
    error NotBorrower();
    error TooLate();
    error StillCurrent();
    error TransferFailed();
    error NothingReceived();
    error Reentrancy();
    error NotAwarded();
    error CouponOutsideLoan();
    error AlreadyRecorded();
    error NothingOwed();
    error CouponUnschedulable();

    /**
     * Collateral is an arbitrary third-party contract — an ATS diamond whose
     * facets this contract has never seen. Any transfer can hand control back.
     * Every state-changing entry point is guarded, and the accounting is also
     * written before the transfers, so this is the second line rather than the
     * first.
     */
    uint256 private _lock = 1;

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(Mandates m) {
        if (address(m) == address(0)) revert ZeroAddress();
        mandates = m;
    }

    /* ─────────────────────────── borrower ─────────────────────────── */

    /**
     * @notice Open a funding request against a tokenized security.
     *
     * The collateral is escrowed immediately, so an underwriter is always
     * bidding on something already locked that cannot be pulled out from under
     * them mid-auction.
     *
     * @param docName Which document on the security to read, e.g. "prospectus".
     * @param fallbackDocHash Used *only* when the collateral exposes no
     *        ERC-1643 document. When it does, the on-chain hash wins and this
     *        argument is ignored entirely.
     *
     * @dev The document hash is read from the security itself rather than taken
     *      on the borrower's word. Letting a borrower name the hash would break
     *      the one property this market sells: that a bid is bound to the bytes
     *      the issuer actually published. A borrower could otherwise point
     *      underwriters at a flattering document while the security carried
     *      another. The fallback exists so a plain ERC-20 can still be used as
     *      collateral in testing, and `docFromChain` records which path was
     *      taken so no reader has to guess.
     */
    function open(
        address collateral,
        uint256 collateralAmount,
        address cash,
        uint256 principal,
        uint64 term,
        uint64 bidWindow,
        bytes32 docName,
        bytes32 fallbackDocHash
    ) external nonReentrant returns (uint256 id) {
        if (collateral == address(0) || cash == address(0)) revert ZeroAddress();
        if (collateral == cash) revert CashIsCollateral();
        if (bidWindow < MIN_BID_WINDOW || bidWindow > MAX_BID_WINDOW) revert BadWindow();
        if (term == 0 || term > MAX_TERM) revert BadTerm();
        if (principal == 0 || collateralAmount == 0) revert ZeroAmount();

        (bytes32 docHash, bool docFromChain) = _documentHash(collateral, docName);
        if (!docFromChain) docHash = fallbackDocHash;

        // Record what actually arrived rather than what was asked for. A token
        // that takes a cut on transfer would otherwise leave the request
        // promising more collateral than the contract holds, and the shortfall
        // would only surface at settlement.
        uint256 received = _pullMeasured(collateral, msg.sender, address(this), collateralAmount);

        id = _requests.length;
        _requests.push(
            Request({
                borrower: msg.sender,
                term: term,
                status: Status.Open,
                collateral: collateral,
                bidDeadline: uint64(block.timestamp) + bidWindow,
                docFromChain: docFromChain,
                cash: cash,
                dueAt: 0,
                lender: address(0),
                collateralAmount: received,
                principal: principal,
                repayAmount: 0,
                docName: docName,
                docHash: docHash
            })
        );

        emit Requested(id, msg.sender, collateral, received, principal, term, docName, docHash, docFromChain);
    }

    /**
     * @notice Withdraw a request that never funded, returning the collateral.
     *
     * @dev Permitted even when a winning bid exists, because `award` pulls cash
     *      from the lender and can fail for reasons outside anyone's control.
     *      Without this escape the collateral would be trapped in a request
     *      that can never settle. No cash has moved at this point, so cancelling
     *      costs the bidder nothing but the deal.
     *
     *      Before `AWARD_WINDOW` elapses only the borrower may cancel. After it,
     *      anyone may — otherwise a borrower who walked away would pin the
     *      winning bidder's `reservedExposure` indefinitely. The collateral goes
     *      to the borrower either way, so a third party gains nothing by
     *      calling it beyond freeing their own capacity.
     */
    function cancel(uint256 id) external nonReentrant {
        Request storage r = _requests[id];
        if (r.status != Status.Open) revert NotOpen();
        if (block.timestamp < r.bidDeadline) revert AuctionLive();
        if (block.timestamp < r.bidDeadline + AWARD_WINDOW && msg.sender != r.borrower) revert NotBorrower();

        Bid memory cur = bestBid[id];
        if (cur.underwriter != address(0)) reservedExposure[cur.underwriter] -= r.principal;

        r.status = Status.Cancelled;
        emit Cancelled(id, msg.sender);

        _push(r.collateral, r.borrower, r.collateralAmount);
    }

    /**
     * @notice Release the standing bid on a request nobody resolved, freeing the
     *         bidder's committed capacity.
     *
     * @dev `cancel` does this too, but it returns the collateral in the same
     *      transaction — so if that transfer cannot succeed, because the
     *      borrower has been removed from the security's control list say, the
     *      whole call reverts and the bidder's capacity is locked with it. This
     *      separates the two, so an underwriter's balance sheet never depends on
     *      whether someone else's collateral can move.
     *
     *      Grants nothing new: past AWARD_WINDOW anyone can already cancel the
     *      request outright.
     */
    function releaseBid(uint256 id) external {
        Request storage r = _requests[id];
        if (r.status != Status.Open) revert NotOpen();
        if (block.timestamp < r.bidDeadline + AWARD_WINDOW) revert AuctionLive();

        Bid memory cur = bestBid[id];
        if (cur.underwriter == address(0)) revert NoBids();

        reservedExposure[cur.underwriter] -= r.principal;
        delete bestBid[id];
        emit BidReleased(id, cur.underwriter);
    }

    /* ─────────────────────────── underwriter ─────────────────────────── */

    /**
     * @notice Bid to fund a request. Lowest repayment wins.
     *
     * Callable by an underwriter directly or by the agent key their mandate
     * names. Both paths produce an identical on-chain bid: the contract cannot
     * tell a model from a person and does not care.
     *
     * @param reasoningRef An HCS message reference, published before the
     *        outcome is known. The contract never reads it — it exists so the
     *        record of *why* precedes the record of *what happened*.
     *
     * @dev Every limit checked here was set by the capital owner in `Mandates`.
     *      A fully compromised agent key can do nothing its owner did not
     *      already authorise.
     */
    function bid(uint256 id, uint256 repayAmount, bytes32 reasoningRef) external nonReentrant {
        Request storage r = _requests[id];
        if (r.status != Status.Open) revert NotOpen();
        if (block.timestamp >= r.bidDeadline) revert AuctionClosed();

        // A repayment below principal is a gift, not a loan. `rateBps` floors at
        // zero, so without this an underwriter whose mandate allows a zero
        // minimum rate could be handed one by a careless agent.
        if (repayAmount < r.principal) revert BelowPrincipal();

        // Resolve who is actually lending: the caller, or the owner that bound
        // this agent key.
        address underwriter = mandates.ownerOfAgent(msg.sender);
        if (underwriter == address(0)) underwriter = msg.sender;

        Mandates.Mandate memory m = mandates.mandateOf(underwriter);
        if (!m.active) revert NoMandate();
        if (m.agent != address(0) && msg.sender != m.agent && msg.sender != underwriter) revert NoMandate();

        if (r.principal > m.maxPerDeal) revert OverPerDeal();
        if (r.term > m.maxTerm) revert TermTooLong();
        if (!mandates.assetAllowed(underwriter, r.collateral)) revert AssetNotAllowed();
        if (rateBps(r.principal, repayAmount, r.term) < m.minRateBps) revert RateTooLow();

        Bid memory cur = bestBid[id];
        if (cur.underwriter != address(0) && repayAmount >= cur.repayAmount) revert NotBetter();

        // Release the outgoing bidder before checking the incoming one, so an
        // underwriter improving their own bid is not measured against itself.
        if (cur.underwriter != address(0)) reservedExposure[cur.underwriter] -= r.principal;

        if (liveExposure[underwriter] + reservedExposure[underwriter] + r.principal > m.maxTotal) {
            // Put the released reservation back before reverting. A failed bid
            // must not free somebody else's commitment.
            if (cur.underwriter != address(0)) reservedExposure[cur.underwriter] += r.principal;
            revert OverTotal();
        }
        reservedExposure[underwriter] += r.principal;

        bestBid[id] = Bid(underwriter, msg.sender, repayAmount, reasoningRef);
        unchecked {
            bidCount[id] += 1;
        }
        emit BidPlaced(id, underwriter, msg.sender, repayAmount, reasoningRef);
    }

    /* ─────────────────────────── settlement ─────────────────────────── */

    /**
     * @notice Close the auction and settle both legs atomically.
     * @dev Permissionless once the window has closed. The outcome is fully
     *      determined by state, so there is nothing for a caller to influence
     *      and no reason to restrict who calls it.
     *
     *      A mandate revoked between bid and award does not undo the bid. The
     *      bid was a commitment of capital against a locked asset; revocation
     *      withdraws permission to take on *new* exposure.
     */
    function award(uint256 id) external nonReentrant {
        Request storage r = _requests[id];
        if (r.status != Status.Open) revert NotOpen();
        if (block.timestamp < r.bidDeadline) revert AuctionLive();

        Bid memory b = bestBid[id];
        if (b.underwriter == address(0)) revert NoBids();

        r.status = Status.Funded;
        r.lender = b.underwriter;
        r.repayAmount = b.repayAmount;
        r.dueAt = uint64(block.timestamp) + r.term;

        reservedExposure[b.underwriter] -= r.principal;
        liveExposure[b.underwriter] += r.principal;

        emit Awarded(id, b.underwriter, r.principal, b.repayAmount, r.dueAt);

        // Cash moves lender -> borrower directly. It never rests here.
        _pull(r.cash, b.underwriter, r.borrower, r.principal);

        // Ask Hedera to call claim(id) itself at maturity. Best-effort by
        // construction; a failure here must never fail the award.
        _scheduleSettlement(id, r.dueAt);
    }

    /// @notice Repay the agreed amount and take the collateral back.
    function repay(uint256 id) external nonReentrant {
        Request storage r = _requests[id];
        if (r.status != Status.Funded) revert NotOpen();
        if (msg.sender != r.borrower) revert NotBorrower();
        if (block.timestamp > r.dueAt) revert TooLate(); // late is default; see claim()

        r.status = Status.Repaid;
        liveExposure[r.lender] -= r.principal;

        // Net off income the collateral earned while it was pledged rather than
        // moving it separately. This is how repo settles a manufactured payment,
        // and it means the obligation needs no enforcement: the lender simply
        // receives less.
        // Net only as far as the repayment reaches. A coupon worth more than the
        // whole repayment is reachable rather than theoretical — a large pledge
        // against a small principal earns more than the loan costs — and zeroing
        // the obligation here would hand the lender the difference. The residual
        // survives as a debt the lender still owes, payable through
        // `settleManufacturedPayment`, exactly as on a default.
        uint256 due = repaymentDue(id);
        uint256 owed = manufacturedOwed[id];
        uint256 netted = owed > r.repayAmount ? r.repayAmount : owed;
        manufacturedOwed[id] = owed - netted;

        emit Repaid(id, due);
        if (netted != 0) emit ManufacturedPaymentSettled(id, r.lender, r.borrower, netted);

        // The pending claim would revert harmlessly on a repaid request, but
        // releasing it returns the reserved second and the gas deposit.
        _cancelSettlement(id);

        if (due != 0) _pull(r.cash, msg.sender, r.lender, due);
        _push(r.collateral, r.borrower, r.collateralAmount);
    }

    /**
     * @notice After the due date, an unrepaid position hands the collateral to
     *         the lender.
     *
     * There is no auction, no liquidator, no price and no partial outcome. The
     * haircut agreed at award is the lender's entire protection, which is
     * exactly why it is theirs to choose.
     *
     * @dev Permissionless, parameterless beyond `id`, and it pays the lender
     *      recorded in storage rather than `msg.sender`. That is what makes it
     *      safe to hand to the network as a scheduled call: the scheduler is
     *      just another caller with no special power.
     */
    function claim(uint256 id) external nonReentrant {
        Request storage r = _requests[id];
        if (r.status != Status.Funded) revert NotOpen();
        if (block.timestamp <= r.dueAt) revert StillCurrent();

        r.status = Status.Defaulted;
        liveExposure[r.lender] -= r.principal;
        delete settlementSchedule[id];

        emit Defaulted(id, r.lender, r.collateralAmount);

        _push(r.collateral, r.lender, r.collateralAmount);
    }

    /* ─────────────────── the manufactured payment ─────────────────── */

    /**
     * @notice Record what a coupon paid on collateral that was pledged when its
     *         record date passed, and credit it to the borrower.
     *
     * A coupon belongs to whoever holds the security on the record date, and
     * while a loan is live that is this contract. Without this the borrower —
     * who still owns the bond and gets it back on repayment — is credited with
     * nothing, and the income accrues to an escrow that has no way to spend it.
     *
     * @dev Permissionless, and normally nobody calls it by hand: `award` asks
     *      Hedera to call it on the record date. Anyone may, because the answer
     *      is fixed by the security's own snapshot and there is nothing for a
     *      caller to steer.
     *
     *      The amount is apportioned by this request's share of the escrow's
     *      balance, because that balance covers every live request against the
     *      same security at once. Crediting one request with the escrow's whole
     *      payable would pay one borrower using another borrower's coupon.
     */
    function recordCoupon(uint256 id, uint256 couponId) public {
        Request storage r = _requests[id];
        if (r.dueAt == 0) revert NotAwarded();
        if (couponRecorded[id][couponId]) revert AlreadyRecorded();

        (uint256 amount, uint256 recordDate) = CouponPassThrough.owed(
            r.collateral, address(this), couponId, r.collateralAmount, CouponPassThrough.decimalsOf(r.cash)
        );

        // Only income earned *while pledged* passes through this contract.
        // Anything outside the term is between the holder and the issuer.
        uint64 awardedAt = r.dueAt - r.term;
        if (recordDate < awardedAt || recordDate > r.dueAt) revert CouponOutsideLoan();

        couponRecorded[id][couponId] = true;
        manufacturedOwed[id] += amount;

        emit CouponRecorded(id, couponId, r.borrower, amount);
    }

    /**
     * @notice Pay a manufactured payment that repayment did not net off.
     * @dev `repay` nets the obligation against what the borrower owes, which is
     *      how repo settles it and needs no enforcement. This is the other path:
     *      a position that defaulted, or a coupon recorded after repayment had
     *      already happened.
     */
    function settleManufacturedPayment(uint256 id) external nonReentrant {
        Request storage r = _requests[id];
        uint256 amount = manufacturedOwed[id];
        if (amount == 0) revert NothingOwed();

        manufacturedOwed[id] = 0;
        emit ManufacturedPaymentSettled(id, msg.sender, r.borrower, amount);

        _pull(r.cash, msg.sender, r.borrower, amount);
    }

    /**
     * @notice What the borrower actually hands over at repayment.
     * @dev The agreed repayment less income the collateral earned while pledged.
     *      Floored at zero: a coupon larger than the fee is an odd loan, not a
     *      licence to drain the lender.
     */
    function repaymentDue(uint256 id) public view returns (uint256) {
        Request memory r = _requests[id];
        uint256 owed = manufacturedOwed[id];
        return owed >= r.repayAmount ? 0 : r.repayAmount - owed;
    }

    /* ─────────────────── settlement the network performs ─────────────────── */

    /**
     * @dev Ask HSS to invoke `claim(id)` on this contract one second after
     *      maturity.
     *
     *      This grants no authority that did not already exist. `claim` is
     *      permissionless, takes only an id, and pays the lender from storage.
     *      A schedule is therefore exactly as powerful as a passer-by; it
     *      only removes the need for one to show up.
     *
     *      Every failure path is a no-op that degrades to manual `claim()`:
     *      the second may be full, this contract may hold no HBAR, or the
     *      network may predate v0.68.0 or not be Hedera at all. A funding
     *      market must not fail to fund because a convenience could not be
     *      arranged, so both calls are wrapped — including the capacity check,
     *      which is a `staticcall` that returns empty data on a chain with
     *      nothing deployed at `0x…016b` and would otherwise revert the whole
     *      award while decoding.
     */
    function _scheduleSettlement(uint256 id, uint64 dueAt) private {
        uint256 expiry = uint256(dueAt) + SETTLEMENT_MARGIN;
        address schedule = _schedule(expiry, CLAIM_GAS, abi.encodeCall(this.claim, (id)));
        if (schedule == address(0)) return;

        settlementSchedule[id] = schedule;
        emit SettlementScheduled(id, schedule, expiry);
    }

    /**
     * @notice Ask Hedera to call `recordCoupon` on a coupon's record date.
     *
     * Separate from `award`, and it has to be. **Hedera permits at most one
     * scheduled call per transaction**: an `award` that books its own settlement
     * and then tries to book a coupon is rejected outright with
     * `NO_SCHEDULING_ALLOWED_AFTER_SCHEDULED_RECURSION`, and the loan does not
     * fund at all. Found on testnet, where an award that had worked all day
     * started reverting the moment a coupon fell inside the term.
     *
     * So the settlement is booked at award, because it is the one that must not
     * be forgotten, and a coupon is booked by a second transaction that anyone
     * may send. `recordCoupon` stays permissionless either way, so a coupon that
     * nobody books is still claimable by hand.
     */
    function scheduleCoupon(uint256 id, uint256 couponId) external returns (address schedule) {
        Request memory r = _requests[id];
        if (r.dueAt == 0) revert NotAwarded();

        (bool ok, uint256 recordDate) = CouponPassThrough.tryRecordDate(r.collateral, address(this), couponId);
        if (!ok) revert CouponUnschedulable();
        if (recordDate <= block.timestamp || recordDate > r.dueAt) revert CouponOutsideLoan();

        schedule = _schedule(
            recordDate + SETTLEMENT_MARGIN, COUPON_GAS, abi.encodeCall(this.recordCoupon, (id, couponId))
        );
        if (schedule == address(0)) revert CouponUnschedulable();
        emit CouponScheduled(id, couponId, schedule, recordDate);
    }

    /**
     * @dev Book one call with the Hedera Schedule Service, or report that it
     *      could not be booked.
     *
     *      Raw calls on purpose, and the reason is easy to get wrong. HSS is a
     *      *native* system contract: it answers calls but has no EVM bytecode at
     *      all, so `eth_getCode` on 0x…016b returns `0x`. Solidity emits an
     *      extcodesize check before every high-level call, which reverts in this
     *      frame where `try/catch` cannot see it — and guarding on
     *      `code.length` fails from the other side, reading zero on Hedera and
     *      disabling scheduling on the only network that supports it.
     *
     *      A raw call does neither. On Hedera it reaches the service; on a chain
     *      with nothing deployed there it returns success with empty returndata,
     *      which the length checks read as "no scheduling here".
     */
    function _schedule(uint256 expiry, uint256 gasLimit, bytes memory callData) private returns (address) {
        (bool ok, bytes memory data) = HSS.staticcall(
            abi.encodeWithSelector(IHederaScheduleService.hasScheduleCapacity.selector, expiry, gasLimit)
        );
        if (!ok || data.length < 32 || !abi.decode(data, (bool))) return address(0);

        (ok, data) = HSS.call(
            abi.encodeWithSelector(
                IHederaScheduleService.scheduleCall.selector, address(this), expiry, gasLimit, uint64(0), callData
            )
        );
        if (!ok || data.length < 64) return address(0);

        (int64 rc, address schedule) = abi.decode(data, (int64, address));
        return rc == HSS_SUCCESS ? schedule : address(0);
    }

    /// @dev Release a schedule that can no longer do anything useful.
    function _cancelSettlement(uint256 id) private {
        address schedule = settlementSchedule[id];
        if (schedule == address(0)) return;
        delete settlementSchedule[id];
        // Releasing the slot is a courtesy and must never fail a repayment, so
        // the outcome is reported rather than enforced.
        (bool released,) = HSS.call(abi.encodeWithSelector(IHederaScheduleService.deleteSchedule.selector, schedule));
        if (!released) emit SettlementReleaseFailed(id, schedule);
    }

    /**
     * @notice Accept HBAR so the contract can pay for scheduling.
     * @dev A convenience budget, not user funds. No accounting depends on this
     *      balance and an empty one degrades to manual settlement. There is
     *      deliberately no withdrawal function, because adding one would create
     *      the only privileged role in the contract.
     */
    receive() external payable {}

    /* ─────────────────────────── views ─────────────────────────── */

    function requests() external view returns (uint256) {
        return _requests.length;
    }

    function get(uint256 id) external view returns (Request memory) {
        return _requests[id];
    }

    /**
     * @notice Annualised simple rate in basis points.
     * @dev Multiplies before dividing. At 6-decimal cash the other ordering
     *      truncates a small fee to zero, and an underwriter's minimum rate
     *      would then be trivially satisfiable.
     */
    function rateBps(uint256 principal, uint256 repayAmount, uint64 term) public pure returns (uint16) {
        if (repayAmount <= principal || principal == 0 || term == 0) return 0;

        // Cap rather than overflow. No real token supply approaches 2^128, and
        // a bid that large loses the auction regardless, so returning the
        // ceiling is both safe and honest — where a panic here would be a
        // denial of service on an otherwise valid transaction.
        if (principal > MAX_AMOUNT || repayAmount > MAX_AMOUNT) return type(uint16).max;

        // With both operands under 2^128 the bounds are provable:
        //   fee * BPS * 365 days  <  2^128 * 2^39  =  2^167
        //   principal * term      <  2^128 * 2^64  =  2^192
        uint256 fee = repayAmount - principal;
        uint256 bps = (fee * BPS * 365 days) / (principal * term);
        return bps > type(uint16).max ? type(uint16).max : uint16(bps);
    }

    /* ─────────────────────────── documents ─────────────────────────── */

    /**
     * @dev Read a document hash off the security itself.
     *      Returns `fromChain = false` when the collateral has no ERC-1643
     *      facet, when the call reverts, or when the document is unset — never
     *      a partially trusted result.
     */
    function _documentHash(address collateral, bytes32 docName) private view returns (bytes32, bool) {
        // Raw, for the same reason the Schedule Service calls are raw. A native
        // HTS token has no EVM bytecode either — `eth_getCode` on one returns
        // `0x` — so a high-level call here reverts on the extcodesize check
        // before it is made, and `try/catch` cannot see it. That would make it
        // impossible to pledge any native Hedera token as collateral.
        (bool ok, bytes memory data) =
            collateral.staticcall(abi.encodeWithSelector(IERC1643.getDocument.selector, docName));

        // (string uri, bytes32 hash, uint256 timestamp): the hash is the second
        // word regardless of how long the URI is. Read it directly rather than
        // decoding, so malformed return data cannot revert this call.
        if (!ok || data.length < 96) return (bytes32(0), false);
        bytes32 hash;
        assembly {
            hash := mload(add(data, 64))
        }
        if (hash == bytes32(0)) return (bytes32(0), false);
        return (hash, true);
    }

    /* ─────────────────────────── transfers ─────────────────────────── */

    /**
     * @dev Tolerant of tokens that return nothing as well as those returning a
     *      bool. Hedera's HTS facade returns a 32-byte true; ATS diamonds and
     *      older tokens vary. Assume nothing, and treat a short or malformed
     *      return as a failure rather than as success.
     */
    function _pull(address token, address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount));
        _check(token, ok, data);
    }

    function _push(address token, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        _check(token, ok, data);
    }

    /// @dev Pull, then report what the balance actually moved by.
    function _pullMeasured(address token, address from, address to, uint256 amount) private returns (uint256) {
        uint256 before = _balanceOf(token, to);
        _pull(token, from, to, amount);
        uint256 received = _balanceOf(token, to) - before;
        if (received == 0) revert NothingReceived();
        return received;
    }

    /**
     * @dev Raw, like every other outward call in this contract. A high-level
     *      call carries an extcodesize check that reverts in *this* frame for
     *      any codeless address, and on Hedera a native HTS token has no
     *      bytecode. Reading a balance must fail with this contract's own error
     *      rather than an uncatchable one raised before the call is made.
     */
    function _balanceOf(address token, address who) private view returns (uint256) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSelector(IERC20.balanceOf.selector, who));
        if (!ok || data.length < 32) revert TransferFailed();
        return abi.decode(data, (uint256));
    }

    /**
     * @dev Empty returndata means "this token returns nothing on success" only
     *      if something is actually there to answer. A call to an address with
     *      no code also succeeds with zero bytes, and on Hedera a native HTS
     *      token is indistinguishable from one — verified on testnet from a
     *      deployed contract, where `balanceOf` and `decimals` on HTS USDC both
     *      return ok with a zero-length payload and `code.length` reads 0.
     *
     *      Accepting that would be the worst bug this contract could have:
     *      `award` would mark a position funded, record a lender and start the
     *      clock while no cash had moved at all. So an empty answer is only
     *      trusted from an address that has code.
     *
     *      The consequence is a real constraint rather than a workaround: the
     *      cash leg must be an ERC-20 contract, not a raw HTS token id.
     */
    function _check(address token, bool ok, bytes memory data) private view {
        if (!ok) revert TransferFailed();
        if (data.length == 0) {
            if (token.code.length == 0) revert TransferFailed();
            return;
        }
        if (data.length < 32 || !abi.decode(data, (bool))) revert TransferFailed();
    }
}
