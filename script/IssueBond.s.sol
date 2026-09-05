// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {
    IATSFactory,
    IATSSecurity,
    ATSRoles,
    BondData,
    BondDetailsData,
    SecurityData,
    ERC20MetadataInfo,
    ResolverProxyConfiguration,
    Rbac,
    FactoryRegulationData,
    AdditionalSecurityData,
    RegulationType,
    RegulationSubType
} from "../src/interfaces/IATS.sol";
import {Isin} from "../src/demo/Isin.sol";

/**
 * Issue a real bond through the live Asset Tokenization Studio factory, attach
 * its offering document, and mint a holding.
 *
 * This is the day-one gate. Everything else in Rialto is independent of ATS and
 * would work against a plain ERC-20, but the claim the project rests on — that
 * a bid is bound to the bytes an issuer published under a role-gated write — is
 * only true if the document really lives on the security. So it gets issued for
 * real, on testnet, and the hash gets read back out.
 *
 *   forge script script/IssueBond.s.sol:IssueBond \
 *     --rpc-url $HEDERA_TESTNET_RPC --broadcast -g 2500 --slow
 *
 * `--slow` matters here: the steps are sequential and Hedera's relay will
 * happily accept a setDocument aimed at a bond that has not finished deploying.
 */
contract IssueBond is Script {
    /// Configuration id 2 on the Business Logic Resolver is BOND, registered at
    /// version 1. Enumerated on testnet: the resolver reports 8 configurations,
    /// ids 1 through 8.
    bytes32 internal constant BOND_CONFIG = bytes32(uint256(2));
    uint256 internal constant BOND_VERSION = 1;

    bytes32 internal constant PROSPECTUS = bytes32("prospectus");

    /// A real ISIN: twelve characters with a Luhn check digit, which ATS
    /// verifies. `Isin.validate` runs the same rule before anything is
    /// broadcast, because the on-chain version of this check costs a failed
    /// seven-million-gas deployment and reports it as a bare revert.
    string internal constant ISIN = "GB00RIALTO00";

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address operator = vm.addr(pk);
        IATSFactory factory = IATSFactory(vm.envAddress("ATS_FACTORY"));
        address resolver = vm.envAddress("ATS_RESOLVER");

        Isin.validate(ISIN);
        _requireAliasAddress(address(factory), "ATS_FACTORY");
        _requireAliasAddress(resolver, "ATS_RESOLVER");

        // The document this bond is underwritten on. In the demo the bytes live
        // at the URI; the hash is what the market freezes and what an agent
        // re-derives before it is allowed to reason about the contents.
        string memory uri = vm.envOr("PROSPECTUS_URI", string("ipfs://bafyrialtoprospectus"));
        bytes32 docHash = vm.envOr("PROSPECTUS_HASH", keccak256(bytes("Rialto demo prospectus v1")));

        // Whitelist mode is the honest default. It is the ERC-3643 trap that
        // makes ordinary AMMs incompatible with permissioned securities: every
        // address that touches the token must be on its control list, including
        // the escrow contract. Rialto has to work under it, so it is tested
        // under it.
        bool whitelist = vm.envOr("WHITELIST", true);
        address market = vm.envOr("MARKET_ADDRESS", address(0));

        console2.log("operator ", operator);
        console2.log("balance  ", operator.balance);
        console2.log("factory  ", address(factory));
        console2.log("whitelist", whitelist);

        vm.startBroadcast(pk);

        address bond = _deployBond(factory, resolver, operator, whitelist);
        console2.log("BOND_ADDRESS=", bond);

        IATSSecurity security = IATSSecurity(bond);

        // Under whitelist mode nothing can hold the token until it is listed —
        // the issuer included, or the mint below reverts.
        if (whitelist) {
            security.addToControlList(operator);
            if (market != address(0)) {
                security.addToControlList(market);
                console2.log("control list: added the market", market);
            }
        }

        // The keystone. Without this the security is just an ERC-20 with a
        // transfer gate, and there is nothing for an underwriter to price.
        security.setDocument(PROSPECTUS, uri, docHash);
        console2.log("document set");

        security.issue(operator, 1_000_000e18, "");
        console2.log("issued to the operator");

        vm.stopBroadcast();

        _verify(security, operator, docHash);
    }

    /**
     * @dev A Hedera contract deployed through the EVM has an alias, and its
     *      long-zero form is not interchangeable with it. `eth_getCode` answers
     *      identically on both — which is exactly what makes the long-zero form
     *      look usable — but the factory *calls into* the resolver, and that
     *      call reverts with a bare CONTRACT_REVERT_EXECUTED and no reason.
     *      Verified by diffing two calldatas identical but for one word:
     *
     *          0xba2d5fc2083a0b8f164c50e65d782087fba18e0a   deploys
     *          0x00000000000000000000000000000000008c9142   reverts
     *
     *      A long-zero address has twelve leading zero bytes. Refuse it here
     *      rather than pay for the discovery.
     */
    function _requireAliasAddress(address a, string memory name) internal pure {
        require(a != address(0), string.concat(name, " is unset"));
        require(
            uint256(uint160(a)) >> 64 != 0,
            string.concat(name, " is a long-zero address; use the EVM address from the ATS env example")
        );
    }

    function _deployBond(IATSFactory factory, address resolver, address operator, bool whitelist)
        internal
        returns (address)
    {
        // Every role the demo needs, all held by the operator. A real issuer
        // would split these; concentrating them here keeps the script honest
        // about what it is doing rather than hiding grants in later calls.
        Rbac[] memory rbacs = new Rbac[](6);
        bytes32[6] memory roles = [
            ATSRoles.DEFAULT_ADMIN,
            ATSRoles.ISSUER,
            ATSRoles.DOCUMENTER,
            ATSRoles.CONTROL_LIST,
            ATSRoles.CONTROLLER,
            ATSRoles.KYC
        ];
        for (uint256 i; i < roles.length; i++) {
            address[] memory members = new address[](1);
            members[0] = operator;
            rbacs[i] = Rbac({role: roles[i], members: members});
        }

        SecurityData memory security = SecurityData({
            resolver: resolver,
            maxSupply: 10_000_000e18,
            resolverProxyConfiguration: ResolverProxyConfiguration({key: BOND_CONFIG, version: BOND_VERSION}),
            erc20MetadataInfo: ERC20MetadataInfo({
                name: "Rialto Demo Senior Note 2027", symbol: "RDN27", isin: ISIN, decimals: 18
            }),
            rbacs: rbacs,
            externalPauses: new address[](0),
            externalControlLists: new address[](0),
            externalKycLists: new address[](0),
            compliance: address(0),
            identityRegistry: address(0),
            arePartitionsProtected: false,
            isMultiPartition: false,
            isControllable: true,
            isWhiteList: whitelist,
            clearingActive: false,
            internalKycActivated: false,
            erc20VotesActivated: false
        });

        BondData memory bondData = BondData({
            security: security,
            bondDetails: BondDetailsData({
                currency: 0x474250, // "GBP"
                nominalValue: 100,
                nominalValueDecimals: 0,
                startingDate: block.timestamp + 1 days,
                maturityDate: block.timestamp + 365 days
            }),
            proceedRecipients: new address[](0),
            proceedRecipientsData: new bytes[](0)
        });

        FactoryRegulationData memory reg = FactoryRegulationData({
            regulationType: RegulationType.REG_S,
            regulationSubType: RegulationSubType.NONE,
            additionalSecurityData: AdditionalSecurityData({
                countriesControlListType: true,
                listOfCountries: "",
                info: "Rialto demo instrument. Not an offer of securities."
            })
        });

        return factory.deployBond(bondData, reg);
    }

    /// Read back what was written. A deployment that is not verified from the
    /// chain is a deployment nobody has checked.
    function _verify(IATSSecurity security, address operator, bytes32 expectedHash) internal view {
        (string memory uri, bytes32 hash, uint256 ts) = security.getDocument(PROSPECTUS);

        console2.log("");
        console2.log("name     ", security.name());
        console2.log("symbol   ", security.symbol());
        console2.log("decimals ", security.decimals());
        console2.log("balance  ", security.balanceOf(operator));
        console2.log("doc uri  ", uri);
        console2.log("doc time ", ts);
        console2.logBytes32(hash);

        require(hash == expectedHash, "document hash on chain does not match what was written");
        require(security.balanceOf(operator) > 0, "issuance did not land");
        console2.log("");
        console2.log("verified: the document is on the security and the hash matches");
    }
}
