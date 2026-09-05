// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IATSKyc, IATSSecurity, ATSRoles} from "../src/interfaces/IATS.sol";

interface IAccessControl {
    function hasRole(bytes32 role, address account) external view returns (bool);
    function grantRole(bytes32 role, address account) external;
}

/**
 * Admit an account to the security: control list, then a KYC credential.
 *
 * These are two different permissions and they fail differently. Control-list
 * removal is what an address freeze looks like from outside (§3.6c); a missing
 * credential is its own state, and `getKycStatusFor` cannot tell you whether it
 * was never granted or has been revoked. A settlement blocked by either one is
 * only delayed — the position stays funded and the collateral stays escrowed
 * until whichever permission is missing is restored.
 *
 * The issuer usually has to admit itself first. `activateInternalKyc` and
 * `addIssuer` sit behind roles the factory does not hand out, and holding the
 * `KYC` role is not enough: it permits revoking a credential, not issuing one.
 *
 *   ACCOUNT=0x… forge script script/AdmitUnderwriter.s.sol:AdmitUnderwriter \
 *     --rpc-url $HEDERA_TESTNET_RPC --broadcast -g 140 --slow
 */
contract AdmitUnderwriter is Script {
    uint256 constant CREDENTIAL_VALID_FOR = 365 days;

    function run() external {
        uint256 operatorPk = vm.envUint("PRIVATE_KEY");
        address operator = vm.addr(operatorPk);
        address account = vm.envAddress("ACCOUNT");

        address bond = vm.envAddress("BOND_ADDRESS");
        IATSKyc kyc = IATSKyc(bond);
        IAccessControl roles = IAccessControl(bond);

        vm.startBroadcast(operatorPk);

        if (!roles.hasRole(ATSRoles.INTERNAL_KYC_MANAGER, operator)) {
            roles.grantRole(ATSRoles.INTERNAL_KYC_MANAGER, operator);
        }
        if (!roles.hasRole(ATSRoles.SSI_MANAGER, operator)) {
            roles.grantRole(ATSRoles.SSI_MANAGER, operator);
        }

        // Without a registered issuer every grant reverts AccountIsNotIssuer,
        // naming the issuer rather than the account being admitted — which
        // reads like the wrong thing failed.
        if (!kyc.isIssuer(operator)) kyc.addIssuer(operator);
        if (!kyc.isInternalKycActivated()) kyc.activateInternalKyc();

        if (!IATSSecurity(bond).isInControlList(account)) {
            IATSSecurity(bond).addToControlList(account);
        }

        kyc.grantKyc(
            account,
            vm.envOr("VC_ID", string("did:hedera:testnet:rialto")),
            block.timestamp,
            block.timestamp + CREDENTIAL_VALID_FOR,
            operator
        );

        vm.stopBroadcast();

        console2.log("account        ", account);
        console2.log("on control list", IATSSecurity(bond).isInControlList(account));
        console2.log("kyc status     ", kyc.getKycStatusFor(account));
    }
}
