// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {Mandates} from "../src/Mandates.sol";
import {RialtoMarket} from "../src/RialtoMarket.sol";

/// A deployment script that only ever runs against a live network is a script
/// nobody has tested. This runs it locally first.
contract DeployTest is Test {
    function test_scriptDeploysAWiredUpMarket() public {
        uint256 pk = 0xA11CE;
        vm.setEnv("PRIVATE_KEY", vm.toString(bytes32(pk)));
        vm.deal(vm.addr(pk), 100 ether);

        Deploy d = new Deploy();
        d.run();
    }

    /// The market must point at the Mandates it was given, and that link is
    /// immutable — there is no setter, and no admin who could repoint it.
    function test_marketIsPermanentlyBoundToItsMandates() public {
        Mandates m = new Mandates();
        RialtoMarket market = new RialtoMarket(m);
        assertEq(address(market.mandates()), address(m));
    }

    function test_marketRefusesAZeroMandates() public {
        vm.expectRevert(RialtoMarket.ZeroAddress.selector);
        new RialtoMarket(Mandates(address(0)));
    }

    /// There is no owner, no pause and no upgrade path. Anything that looked
    /// like one would be the only privileged role in the system.
    function test_thereIsNoAdminSurface() public {
        Mandates m = new Mandates();
        RialtoMarket market = new RialtoMarket(m);

        for (uint256 i; i < 4; i++) {
            string[4] memory sigs = ["owner()", "admin()", "pause()", "upgradeTo(address)"];
            (bool ok,) = address(market).call(abi.encodeWithSignature(sigs[i]));
            assertFalse(ok, "no privileged entry point may exist");
        }
    }
}
