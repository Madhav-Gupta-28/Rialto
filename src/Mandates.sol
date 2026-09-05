// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title  Mandates
 * @notice An underwriter's standing limits, set by the underwriter and enforced
 *         by the market.
 *
 * This is the boundary between what an agent may *think* and what it may *do*.
 * An underwriting agent reads a prospectus and forms an opinion, which is a
 * judgement call made by a language model on untrusted input. That opinion is
 * allowed to be wrong. What it is not allowed to do is exceed the limits its
 * owner set here, because nothing in this contract is advisory: a bid outside
 * these limits cannot be recorded at all.
 *
 * The security property is therefore not "the agent behaves well". It is that a
 * fully compromised agent key can do nothing its owner did not already
 * authorise, and the worst case is a bad deal inside the owner's own limits,
 * funded with the owner's own money.
 */
contract Mandates {
    struct Mandate {
        address agent; // the one key permitted to bid on the owner's behalf
        uint256 maxPerDeal; // largest principal in a single request
        uint256 maxTotal; // largest aggregate live exposure
        uint16 minRateBps; // lowest annualised rate the owner will accept
        uint64 maxTerm; // longest term, in seconds
        bool active;
    }

    mapping(address => Mandate) private _mandates; // owner   => mandate
    mapping(address => mapping(address => bool)) private _assets; // owner   => collateral => allowed
    mapping(address => address) private _ownerOfAgent; // agent   => owner

    event MandateSet(
        address indexed owner,
        address indexed agent,
        uint256 maxPerDeal,
        uint256 maxTotal,
        uint16 minRateBps,
        uint64 maxTerm
    );
    event MandateRevoked(address indexed owner);
    event AssetAllowed(address indexed owner, address indexed asset, bool allowed);

    error AgentAlreadyBound();
    error NoMandate();
    error AgentIsOwner();

    /**
     * @notice Set or replace the caller's mandate.
     * @param agent The key permitted to bid for the caller. May be `address(0)`
     *              for an underwriter who intends to bid by hand — the market
     *              treats both paths identically and cannot tell them apart.
     * @param maxPerDeal Largest principal the caller will fund in one request.
     * @param maxTotal Largest aggregate exposure across every live position.
     * @param minRateBps Lowest annualised rate, in basis points, the caller accepts.
     * @param maxTerm Longest term, in seconds, the caller accepts.
     */
    function setMandate(address agent, uint256 maxPerDeal, uint256 maxTotal, uint16 minRateBps, uint64 maxTerm)
        external
    {
        // An owner naming itself as its own agent would make `ownerOfAgent`
        // resolve the owner to itself, which is harmless but hides a mistake:
        // it usually means someone pasted the wrong address. Reject it so the
        // error surfaces here rather than as a confusing bid failure later.
        if (agent == msg.sender) revert AgentIsOwner();

        // One agent key serves exactly one owner. Without this, a single
        // compromised key could bid against several balance sheets at once, and
        // each owner's limits would be enforced correctly while the key's total
        // authority was the sum of all of them.
        if (agent != address(0)) {
            address bound = _ownerOfAgent[agent];
            if (bound != address(0) && bound != msg.sender) revert AgentAlreadyBound();
            _ownerOfAgent[agent] = msg.sender;
        }

        // Releasing the previous key must happen after the new one is claimed,
        // so that re-setting the same agent does not delete its own binding.
        //
        // The ownership check is not redundant. A revoked mandate keeps its old
        // agent recorded, and revoking frees that key for anyone else to adopt.
        // Without this, an owner who revoked and then set a new agent would
        // delete whatever binding the key had acquired in the meantime — one
        // account silently disabling another account's agent.
        address prev = _mandates[msg.sender].agent;
        if (prev != address(0) && prev != agent && _ownerOfAgent[prev] == msg.sender) {
            delete _ownerOfAgent[prev];
        }

        _mandates[msg.sender] = Mandate({
            agent: agent,
            maxPerDeal: maxPerDeal,
            maxTotal: maxTotal,
            minRateBps: minRateBps,
            maxTerm: maxTerm,
            active: true
        });
        emit MandateSet(msg.sender, agent, maxPerDeal, maxTotal, minRateBps, maxTerm);
    }

    /**
     * @notice Stand the caller down. Their agent key stops being able to bid
     *         immediately.
     * @dev Deliberately does not touch positions already funded. Revoking a
     *      mandate withdraws permission to take on *new* exposure; it cannot
     *      unwind a deal the underwriter already agreed to, because the borrower
     *      has the cash and is entitled to their term.
     */
    function revoke() external {
        Mandate storage m = _mandates[msg.sender];
        if (!m.active) revert NoMandate();
        if (m.agent != address(0)) delete _ownerOfAgent[m.agent];
        m.active = false;
        emit MandateRevoked(msg.sender);
    }

    /// @notice Allow or disallow a collateral asset for the caller's mandate.
    function allowAsset(address asset, bool allowed) external {
        _assets[msg.sender][asset] = allowed;
        emit AssetAllowed(msg.sender, asset, allowed);
    }

    /* ─────────────────────────── views ─────────────────────────── */

    function mandateOf(address owner) external view returns (Mandate memory) {
        return _mandates[owner];
    }

    /// @notice The owner an agent key bids for, or `address(0)` if unbound.
    function ownerOfAgent(address agent) external view returns (address) {
        return _ownerOfAgent[agent];
    }

    function assetAllowed(address owner, address asset) external view returns (bool) {
        return _assets[owner][asset];
    }
}
