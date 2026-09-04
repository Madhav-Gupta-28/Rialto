// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Mandates} from "../src/Mandates.sol";

/// Mandates is the authority boundary, so these tests are written as attempts to
/// cross it rather than as demonstrations that the happy path works.
contract MandatesTest is Test {
    Mandates internal mandates;

    address internal alice = makeAddr("alice"); // underwriter
    address internal bob = makeAddr("bob"); // a second underwriter
    address internal agentA = makeAddr("agentA");
    address internal agentB = makeAddr("agentB");
    address internal bond = makeAddr("bond");

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

    function setUp() public {
        mandates = new Mandates();
    }

    function _set(address who, address agent) internal {
        vm.prank(who);
        mandates.setMandate(agent, 100_000e6, 500_000e6, 800, 30 days);
    }

    /* ─────────────────── storing and reading ─────────────────── */

    function test_setMandate_storesEveryField() public {
        vm.expectEmit(true, true, true, true);
        emit MandateSet(alice, agentA, 100_000e6, 500_000e6, 800, 30 days);
        _set(alice, agentA);

        Mandates.Mandate memory m = mandates.mandateOf(alice);
        assertEq(m.agent, agentA);
        assertEq(m.maxPerDeal, 100_000e6);
        assertEq(m.maxTotal, 500_000e6);
        assertEq(m.minRateBps, 800);
        assertEq(m.maxTerm, 30 days);
        assertTrue(m.active);

        assertEq(mandates.ownerOfAgent(agentA), alice, "agent resolves to its owner");
    }

    function test_mandateOf_isInactiveUntilSet() public view {
        Mandates.Mandate memory m = mandates.mandateOf(alice);
        assertFalse(m.active, "an address with no mandate must never read as active");
        assertEq(mandates.ownerOfAgent(agentA), address(0));
    }

    function test_agentZero_meansManualBidding() public {
        _set(alice, address(0));
        assertTrue(mandates.mandateOf(alice).active);
        // address(0) must never be treated as a bound agent, or every unbound
        // caller would resolve to whoever last set a null agent.
        assertEq(mandates.ownerOfAgent(address(0)), address(0));
    }

    /* ─────────────────── the agent binding ─────────────────── */

    /// One compromised key must not be able to spend two balance sheets.
    function test_agentCannotBeBoundToTwoOwners() public {
        _set(alice, agentA);
        vm.prank(bob);
        vm.expectRevert(Mandates.AgentAlreadyBound.selector);
        mandates.setMandate(agentA, 1, 1, 1, 1 days);
    }

    /// The ordering trap: claiming the new key before releasing the old one.
    /// Written naively, re-setting the same agent deletes the binding it just
    /// wrote and silently leaves the agent unable to bid.
    function test_resettingSameAgentKeepsItsBinding() public {
        _set(alice, agentA);
        vm.prank(alice);
        mandates.setMandate(agentA, 1e6, 2e6, 100, 1 days);

        assertEq(mandates.ownerOfAgent(agentA), alice, "re-setting the same agent must not unbind it");
        assertEq(mandates.mandateOf(alice).maxPerDeal, 1e6, "limits still updated");
    }

    function test_changingAgentReleasesThePreviousKey() public {
        _set(alice, agentA);
        _set(alice, agentB);

        assertEq(mandates.ownerOfAgent(agentA), address(0), "old key must lose its authority");
        assertEq(mandates.ownerOfAgent(agentB), alice);
    }

    /// A released key must be claimable by someone else, or rotating an agent
    /// would permanently burn the address for the whole market.
    function test_releasedAgentCanBeClaimedByAnotherOwner() public {
        _set(alice, agentA);
        _set(alice, agentB); // releases agentA
        _set(bob, agentA);
        assertEq(mandates.ownerOfAgent(agentA), bob);
    }

    function test_ownerCannotNameItselfAsAgent() public {
        vm.prank(alice);
        vm.expectRevert(Mandates.AgentIsOwner.selector);
        mandates.setMandate(alice, 1, 1, 1, 1 days);
    }

    /* ─────────────────── standing down ─────────────────── */

    function test_revoke_deactivatesAndUnbinds() public {
        _set(alice, agentA);

        vm.expectEmit(true, true, true, true);
        emit MandateRevoked(alice);
        vm.prank(alice);
        mandates.revoke();

        assertFalse(mandates.mandateOf(alice).active);
        assertEq(mandates.ownerOfAgent(agentA), address(0), "a revoked agent must stop resolving");
    }

    function test_revoke_withoutMandateReverts() public {
        vm.prank(alice);
        vm.expectRevert(Mandates.NoMandate.selector);
        mandates.revoke();
    }

    function test_revoke_twiceReverts() public {
        _set(alice, agentA);
        vm.prank(alice);
        mandates.revoke();
        vm.prank(alice);
        vm.expectRevert(Mandates.NoMandate.selector);
        mandates.revoke();
    }

    function test_canComeBackAfterRevoking() public {
        _set(alice, agentA);
        vm.prank(alice);
        mandates.revoke();
        _set(alice, agentA);

        assertTrue(mandates.mandateOf(alice).active);
        assertEq(mandates.ownerOfAgent(agentA), alice);
    }

    /// Revoking releases the key, so a different owner may then adopt it.
    function test_revokedAgentIsFreeForAnotherOwner() public {
        _set(alice, agentA);
        vm.prank(alice);
        mandates.revoke();
        _set(bob, agentA);
        assertEq(mandates.ownerOfAgent(agentA), bob);
    }

    /* ─────────────────── asset allowlist ─────────────────── */

    function test_allowAsset_isPerOwner() public {
        vm.expectEmit(true, true, true, true);
        emit AssetAllowed(alice, bond, true);
        vm.prank(alice);
        mandates.allowAsset(bond, true);

        assertTrue(mandates.assetAllowed(alice, bond));
        assertFalse(mandates.assetAllowed(bob, bond), "one owner's allowlist must not leak to another");
    }

    function test_allowAsset_canBeWithdrawn() public {
        vm.startPrank(alice);
        mandates.allowAsset(bond, true);
        mandates.allowAsset(bond, false);
        vm.stopPrank();
        assertFalse(mandates.assetAllowed(alice, bond));
    }

    /* ─────────────────── properties ─────────────────── */

    function testFuzz_mandateRoundTrips(
        uint256 maxPerDeal,
        uint256 maxTotal,
        uint16 minRateBps,
        uint64 maxTerm,
        address agent
    ) public {
        vm.assume(agent != alice);
        vm.prank(alice);
        mandates.setMandate(agent, maxPerDeal, maxTotal, minRateBps, maxTerm);

        Mandates.Mandate memory m = mandates.mandateOf(alice);
        assertEq(m.agent, agent);
        assertEq(m.maxPerDeal, maxPerDeal);
        assertEq(m.maxTotal, maxTotal);
        assertEq(m.minRateBps, minRateBps);
        assertEq(m.maxTerm, maxTerm);
        assertTrue(m.active);
    }

    /// No caller may write to another address's mandate. There is no admin, no
    /// owner and no privileged path, so this is a property of the whole
    /// contract rather than of one function.
    function testFuzz_onlySelfCanSetOwnMandate(address caller) public {
        vm.assume(caller != alice && caller != address(0));
        vm.prank(caller);
        mandates.setMandate(address(0), 1, 1, 1, 1 days);
        assertFalse(mandates.mandateOf(alice).active, "alice's mandate is untouched by anyone else");
    }
}
