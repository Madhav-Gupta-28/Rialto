// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title  Isin
 * @notice The check Asset Tokenization Studio runs on an identifier, run
 *         locally first.
 *
 * `deployBond` reverts `WrongISIN(string)` (`0xdf749cc5`) unless the string is
 * exactly twelve characters, and `WrongISINChecksum(string)` unless the twelfth
 * is a correct Luhn check digit over the first eleven — letters expanding to
 * two digits each, `A` = 10 … `Z` = 35. A plausible-looking identifier such as
 * `GB00RIALTO001` is thirteen characters and fails on length before the
 * checksum is reached.
 *
 * Discovering that on-chain costs a failed deployment — around eight HBAR and
 * seven million gas — and the revert carries no reason string through the
 * relay. So the same rule is written out here and checked before broadcasting.
 * It is a script-side guard, not a market rule: nothing in `RialtoMarket`
 * cares what an instrument is called.
 */
library Isin {
    error WrongIsinLength(uint256 length);
    error WrongIsinCharacter(bytes1 character);
    error WrongIsinChecksum(uint256 expected, uint256 found);

    uint256 internal constant LENGTH = 12;

    function validate(string memory isin) internal pure {
        bytes memory s = bytes(isin);
        if (s.length != LENGTH) revert WrongIsinLength(s.length);

        // Expand to digits first: a letter contributes two digits, so the
        // expanded length is not known up front and the parity that Luhn
        // depends on is only settled here.
        uint256[] memory digits = new uint256[](2 * (LENGTH - 1));
        uint256 n;
        for (uint256 i; i < LENGTH - 1; i++) {
            uint256 v = _value(s[i]);
            if (v > 9) {
                digits[n++] = v / 10;
                digits[n++] = v % 10;
            } else {
                digits[n++] = v;
            }
        }

        // Luhn, right to left: double every second digit counting back from the
        // check digit, and cast the two-digit results down.
        uint256 sum;
        for (uint256 i; i < n; i++) {
            uint256 d = digits[n - 1 - i];
            if (i % 2 == 0) {
                d *= 2;
                if (d > 9) d -= 9;
            }
            sum += d;
        }

        uint256 expected = (10 - (sum % 10)) % 10;
        uint256 found = _value(s[LENGTH - 1]);
        if (found > 9) revert WrongIsinCharacter(s[LENGTH - 1]);
        if (expected != found) revert WrongIsinChecksum(expected, found);
    }

    function _value(bytes1 c) private pure returns (uint256) {
        if (c >= 0x30 && c <= 0x39) return uint8(c) - 0x30; // '0'-'9'
        if (c >= 0x41 && c <= 0x5A) return uint8(c) - 0x41 + 10; // 'A'-'Z'
        revert WrongIsinCharacter(c);
    }
}
