// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {Mandates} from "../../src/Mandates.sol";
import {RialtoMarket} from "../../src/RialtoMarket.sol";
import {Request} from "../../src/RialtoTypes.sol";
import {MockERC20} from "../mocks/Tokens.sol";
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
} from "../../src/interfaces/IATS.sol";

/**
 * The day-one gate, run against live Hedera testnet state without spending a
 * tinybar.
 *
 * Issuing a security through the real Asset Tokenization Studio factory is the
 * one step that cannot be faked with a mock, because the whole argument for
 * building on ATS is that a regulated security's offering document already
 * lives on-chain under a role-gated write. This forks testnet, deploys a bond
 * through the live factory, attaches a document, and then has RialtoMarket read
 * that hash straight off the security.
 *
 *   forge test --match-path "test/fork/*" -vv
 *
 * Skipped automatically when the RPC is unreachable, so the default suite stays
 * green offline.
 */
contract ATSForkTest is Test {
    IATSFactory internal factory;
    address internal resolver;

    bytes32 internal constant BOND_CONFIG = bytes32(uint256(2));
    bytes32 internal constant PROSPECTUS = bytes32("prospectus");
    bytes32 internal constant DOC_HASH = keccak256("Rialto demo prospectus v1");
    bytes32 internal constant LIE_HASH = keccak256("a document the borrower would prefer");

    address internal issuer = makeAddr("issuer");
    address internal underwriter = makeAddr("underwriter");

    bool internal forked;

    /**
     * Opt-in. Forking Hedera for a diamond deployment is hundreds of state
     * reads over a rate-limited relay and can take minutes, so `forge test`
     * must not wander into it by accident:
     *
     *     FORK=1 forge test --match-path "test/fork/*" -vv
     */
    function setUp() public {
        if (vm.envOr("FORK", uint256(0)) != 1) return;
        try vm.createSelectFork(vm.envOr("HEDERA_TESTNET_RPC", string("https://testnet.hashio.io/api"))) {
            forked = true;
        } catch {
            return;
        }
        factory = IATSFactory(vm.envOr("ATS_FACTORY", address(0xd1F118A40f3b02883D35909eF2517e7EDd78379d)));
        resolver = vm.envOr("ATS_RESOLVER", address(0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a));

        vm.deal(issuer, 10_000 ether);
        vm.deal(underwriter, 10_000 ether);
    }

    modifier onlyForked() {
        if (!forked) {
            console2.log("skipped: set FORK=1 to run against live Hedera testnet");
            return;
        }
        _;
    }

    /// The factory and resolver are where the spec says they are, and answer
    /// the v8 ABI. This is the cheapest thing to get wrong.
    function test_theLiveFactoryAndResolverAreReachable() public view onlyForked {
        assertGt(address(factory).code.length, 0, "factory has no code");
        assertGt(resolver.code.length, 0, "resolver has no code");

        (bool ok, bytes memory data) =
            resolver.staticcall(abi.encodeWithSignature("getLatestVersionByConfiguration(bytes32)", BOND_CONFIG));
        assertTrue(ok, "resolver did not answer");
        assertEq(abi.decode(data, (uint256)), 1, "BOND configuration must be registered at version 1");
    }

    /**
     * The gate itself, done once.
     *
     * Deploying an ATS security is a full diamond deployment, and over a forked
     * RPC each one costs hundreds of state reads. So this is a single test that
     * walks the whole path rather than three that each redeploy a bond.
     */
    function test_theWholeDayOneGate() public onlyForked {
        // ── 1. a real security, issued through the live factory ──
        IATSSecurity bond = _issueBond(true);
        console2.log("bond    ", address(bond));
        console2.log("name    ", bond.name());
        console2.log("symbol  ", bond.symbol());

        // ── 2. carrying a real document ──
        (string memory uri, bytes32 hash, uint256 ts) = bond.getDocument(PROSPECTUS);
        assertEq(hash, DOC_HASH, "the document hash must survive the round trip");
        assertEq(uri, "ipfs://bafyrialtoprospectus");
        assertGt(ts, 0, "the document carries a timestamp");
        assertEq(bond.balanceOf(issuer), 1_000_000e18, "the issuance landed");

        Mandates mandates = new Mandates();
        RialtoMarket market = new RialtoMarket(mandates);
        MockERC20 cash = new MockERC20("USD Coin", "USDC", 6);

        vm.prank(issuer);
        bond.approve(address(market), type(uint256).max);

        // ── 3. the ERC-3643 trap, demonstrated rather than described ──
        // Until the escrow is on the control list it cannot hold the security.
        // This is the constraint that makes ordinary AMMs incompatible with
        // permissioned assets, and it is a deployment step, not a footnote.
        assertFalse(bond.isInControlList(address(market)), "not listed yet");
        vm.prank(issuer);
        vm.expectRevert();
        market.open(address(bond), 105_000e18, address(cash), 100_000e6, 30 days, 1 hours, PROSPECTUS, bytes32(0));

        vm.prank(issuer);
        bond.addToControlList(address(market));
        assertTrue(bond.isInControlList(address(market)), "now the market may hold collateral");

        // ── 4. the keystone, against a real security rather than a mock ──
        // The borrower passes a hash it would prefer. The security's own
        // document wins, and the request records that it did.
        vm.prank(issuer);
        uint256 id = market.open(
            address(bond), 105_000e18, address(cash), 100_000e6, 30 days, 1 hours, PROSPECTUS, LIE_HASH
        );

        Request memory r = market.get(id);
        assertEq(r.docHash, DOC_HASH, "the on-chain document wins over the borrower's argument");
        assertTrue(r.docFromChain, "and the request records where the hash came from");
        assertTrue(r.docHash != LIE_HASH, "the borrower's preferred hash never lands");
        assertEq(bond.balanceOf(address(market)), 105_000e18, "collateral escrowed on a real ATS security");

        console2.log("");
        console2.log("day one gate: bond issued, document attached, hash read by the market");
    }

    /* ─────────────────── helpers ─────────────────── */

    function _issueBond(bool whitelist) internal returns (IATSSecurity) {
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
            members[0] = issuer;
            rbacs[i] = Rbac({role: roles[i], members: members});
        }

        BondData memory bondData = BondData({
            security: SecurityData({
                resolver: resolver,
                maxSupply: 10_000_000e18,
                resolverProxyConfiguration: ResolverProxyConfiguration({key: BOND_CONFIG, version: 1}),
                erc20MetadataInfo: ERC20MetadataInfo({
                    name: "Rialto Demo Senior Note 2027",
                    symbol: "RDN27",
                    isin: "GB00RIALTO00",
                    decimals: 18
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
            }),
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

        vm.startPrank(issuer);
        address bond = factory.deployBond(bondData, reg);
        IATSSecurity security = IATSSecurity(bond);
        if (whitelist) security.addToControlList(issuer);
        security.setDocument(PROSPECTUS, "ipfs://bafyrialtoprospectus", DOC_HASH);
        security.issue(issuer, 1_000_000e18, "");
        vm.stopPrank();

        return security;
    }
}
