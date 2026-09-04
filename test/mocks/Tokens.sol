// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * A minimal ERC-20 whose return behaviour can be made deliberately awkward,
 * because the tokens Rialto actually meets are awkward: Hedera's HTS facade,
 * ATS diamonds, and older tokens that return nothing at all.
 */
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    /// 0 = return true, 1 = return nothing, 2 = return false, 3 = revert
    uint8 public returnMode;
    /// basis points skimmed on every transfer, to imitate a fee-on-transfer token
    uint16 public feeBps;

    constructor(string memory n, string memory s, uint8 d) {
        name = n;
        symbol = s;
        decimals = d;
    }

    function setReturnMode(uint8 m) external {
        returnMode = m;
    }

    function setFeeBps(uint16 f) external {
        feeBps = f;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        uint256 fee = (amount * feeBps) / 10_000;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - fee;
        if (fee != 0) totalSupply -= fee;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return _ret();
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _move(from, to, amount);
        return _ret();
    }

    function _ret() internal view returns (bool) {
        if (returnMode == 3) revert("token reverted");
        if (returnMode == 2) return false;
        if (returnMode == 1) {
            // Return no data at all, the way several older tokens do.
            assembly {
                return(0, 0)
            }
        }
        return true;
    }
}

/**
 * A security that carries an ERC-1643 document, the way every Asset
 * Tokenization Studio deployment does. This is the collateral Rialto is built
 * for, and the document is the thing being underwritten.
 */
contract MockSecurity is MockERC20 {
    struct Doc {
        string uri;
        bytes32 hash;
        uint256 timestamp;
    }

    mapping(bytes32 => Doc) private _docs;
    bytes32[] private _names;

    /// When true, getDocument reverts, imitating a token with no such facet.
    bool public documentsBroken;

    constructor(string memory n, string memory s, uint8 d) MockERC20(n, s, d) {}

    function setDocumentsBroken(bool b) external {
        documentsBroken = b;
    }

    function setDocument(bytes32 docName, string calldata uri, bytes32 hash) external {
        if (_docs[docName].timestamp == 0) _names.push(docName);
        _docs[docName] = Doc(uri, hash, block.timestamp);
    }

    function getDocument(bytes32 docName) external view returns (string memory, bytes32, uint256) {
        require(!documentsBroken, "no documentation facet");
        Doc memory d = _docs[docName];
        return (d.uri, d.hash, d.timestamp);
    }

    function getAllDocuments() external view returns (bytes32[] memory) {
        return _names;
    }
}
