// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Isin} from "../src/demo/Isin.sol";

/**
 * The rule ATS enforces, checked against identifiers whose validity is not in
 * dispute: real ISINs published by the issuers named.
 *
 * The point of the suite is the negative cases. Each one is a way a plausible
 * identifier fails, and each would otherwise be discovered by a reverted
 * deployment with no reason string attached.
 */
/// `expectRevert` only sees a revert from a lower call depth, and a library
/// call shares this one's. The harness puts a real call boundary in the way.
contract IsinHarness {
    function validate(string calldata isin) external pure {
        Isin.validate(isin);
    }
}

contract IsinTest is Test {
    IsinHarness internal isin = new IsinHarness();

    function test_realIsinsPass() public view {
        isin.validate("US0378331005"); // Apple
        isin.validate("GB0002634946"); // BAE Systems
        isin.validate("US5949181045"); // Microsoft
        isin.validate("DE0005190003"); // BMW
        isin.validate("AU0000XVGZA3"); // the ISO 6166 worked example
        isin.validate("GB00RIALTO00"); // the demo instrument
    }

    /// Thirteen characters. This is the one that actually happened.
    function test_theObviousLongerVersionIsRejected() public {
        vm.expectRevert(abi.encodeWithSelector(Isin.WrongIsinLength.selector, 13));
        isin.validate("GB00RIALTO001");
    }

    function test_shortIsRejected() public {
        vm.expectRevert(abi.encodeWithSelector(Isin.WrongIsinLength.selector, 11));
        isin.validate("US037833100");
    }

    function test_aWrongCheckDigitIsRejected() public {
        vm.expectRevert(abi.encodeWithSelector(Isin.WrongIsinChecksum.selector, 5, 6));
        isin.validate("US0378331006");
    }

    function test_lowercaseIsRejected() public {
        vm.expectRevert(abi.encodeWithSelector(Isin.WrongIsinCharacter.selector, bytes1("s")));
        isin.validate("Us0378331005");
    }

    /// A letter in the check position cannot be a check digit at all.
    function test_aLetterCheckDigitIsRejected() public {
        vm.expectRevert(abi.encodeWithSelector(Isin.WrongIsinCharacter.selector, bytes1("A")));
        isin.validate("US037833100A");
    }

    /**
     * Luhn catches every single-digit substitution, so a mistyped digit anywhere
     * in the body fails rather than deploying an instrument under the wrong
     * identifier.
     *
     * The property is stated over the digit positions only, and that is not
     * tidiness. A letter expands to two digits, so replacing one with a digit
     * shortens the expansion and shifts which positions get doubled — the
     * guarantee is about substitutions of equal length and does not survive
     * that. The fuzzer found it: `US0378331005` with the `S` replaced still
     * checksums. Asserting the stronger claim would have been asserting
     * something false.
     */
    function testFuzz_aMistypedDigitIsCaught(uint8 position, uint8 replacement) public {
        bytes memory s = bytes("US0378331005");
        position = uint8(bound(position, 2, 10)); // the digits, not the country code
        bytes1 c = bytes1(uint8(bound(replacement, 0x30, 0x39)));
        vm.assume(c != s[position]);
        s[position] = c;

        // The expected check digit moves with the typo, so the assertion is on
        // which rule failed rather than on its arguments.
        try isin.validate(string(s)) {
            revert("a mistyped digit was accepted");
        } catch (bytes memory reason) {
            assertEq(bytes4(reason), Isin.WrongIsinChecksum.selector);
        }
    }
}
