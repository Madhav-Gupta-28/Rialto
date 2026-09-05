// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @notice The slice of Asset Tokenization Studio that Rialto issues against.
 *
 * Transcribed from `hashgraph/asset-tokenization-studio`,
 * `packages/ats/contracts/contracts/factory/IFactory.sol` and the facet
 * interfaces beside it. Struct field order is load-bearing — it is ABI
 * encoding, not documentation — so this file is a transcription rather than an
 * interpretation.
 */

/* ─────────────────────────── regulation ─────────────────────────── */

enum RegulationType {
    NONE,
    REG_S,
    REG_D
}

enum RegulationSubType {
    NONE,
    REG_D_506_B,
    REG_D_506_C
}

struct AdditionalSecurityData {
    bool countriesControlListType;
    string listOfCountries;
    string info;
}

struct FactoryRegulationData {
    RegulationType regulationType;
    RegulationSubType regulationSubType;
    AdditionalSecurityData additionalSecurityData;
}

/* ─────────────────────────── security ─────────────────────────── */

struct ResolverProxyConfiguration {
    bytes32 key;
    uint256 version;
}

struct ERC20MetadataInfo {
    string name;
    string symbol;
    string isin;
    uint8 decimals;
}

struct Rbac {
    bytes32 role;
    address[] members;
}

struct SecurityData {
    address resolver;
    uint256 maxSupply;
    ResolverProxyConfiguration resolverProxyConfiguration;
    ERC20MetadataInfo erc20MetadataInfo;
    Rbac[] rbacs;
    address[] externalPauses;
    address[] externalControlLists;
    address[] externalKycLists;
    address compliance;
    address identityRegistry;
    bool arePartitionsProtected;
    bool isMultiPartition;
    bool isControllable;
    bool isWhiteList;
    bool clearingActive;
    bool internalKycActivated;
    bool erc20VotesActivated;
}

struct BondDetailsData {
    bytes3 currency;
    uint256 nominalValue;
    uint8 nominalValueDecimals;
    uint256 startingDate;
    uint256 maturityDate;
}

struct BondData {
    SecurityData security;
    BondDetailsData bondDetails;
    address[] proceedRecipients;
    bytes[] proceedRecipientsData;
}

interface IATSFactory {
    function deployBond(BondData calldata bondData, FactoryRegulationData calldata regulationData)
        external
        returns (address bondAddress_);
}

/// @notice The facets Rialto touches on a deployed security.
interface IATSSecurity {
    function setDocument(bytes32 name, string calldata uri, bytes32 documentHash) external;
    function getDocument(bytes32 name) external view returns (string memory, bytes32, uint256);
    function getAllDocuments() external view returns (bytes32[] memory);

    function issue(address tokenHolder, uint256 value, bytes calldata data) external;

    function addToControlList(address account) external returns (bool);
    function isInControlList(address account) external view returns (bool);
    function getControlListType() external view returns (bool);

    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
}

/// @notice Role identifiers, taken verbatim from ATS `constants/roles.sol`.
library ATSRoles {
    bytes32 internal constant DEFAULT_ADMIN = bytes32(0);
    bytes32 internal constant ISSUER = 0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f;
    bytes32 internal constant DOCUMENTER = 0xb7b1452b94e2932605f7ad2a3ceba0bafd68db64704c9bd667f27163c57ca319;
    bytes32 internal constant CONTROL_LIST = 0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d;
    bytes32 internal constant CONTROLLER = 0xb4d2b850c3ed8a234d390d5c157bbb1824883213c335ffe2a0f0761bb168713e;
    bytes32 internal constant KYC = 0x754f499f9fdfbb089d12bdec817a6863d593d8a3ea7f546c00a5cafd20957bfc;
    bytes32 internal constant PAUSER = 0x3cb8b459fdb6e7dc3d2a2aa529e530f885d45e03584adb438423209c86a2731f;
}

/* ─────────────────────────── coupons ─────────────────────────── */

/**
 * @notice A coupon as Asset Tokenization Studio records it.
 *
 * Entitlement is decided by the holder's balance at `recordDate`, captured in a
 * snapshot. That is the whole reason Rialto has to care: while a loan is live
 * the escrow is the holder, so the escrow is the one the security credits.
 */
struct CouponData {
    uint256 recordDate;
    uint256 executionDate;
    uint256 startDate;
    uint256 endDate;
    uint256 fixingDate;
    uint256 rate;
    uint8 rateDecimals;
    uint8 rateStatus;
}

/// @notice What a holder is owed, as an exact fraction rather than a rounded amount.
struct CouponAmountFor {
    uint256 numerator;
    uint256 denominator;
    bool recordDateReached;
}

struct CouponFor {
    uint256 tokenBalance;
    uint8 decimals;
    uint256 nominalValue;
    uint256 nominalValueDecimals;
    bool recordDateReached;
    CouponData coupon;
    CouponAmountFor couponAmount;
    bool isDisabled;
}

interface IATSCoupon {
    function getCouponCount() external view returns (uint256 couponCount_);
    function getCouponFor(uint256 couponID, address account) external view returns (CouponFor memory);
}
