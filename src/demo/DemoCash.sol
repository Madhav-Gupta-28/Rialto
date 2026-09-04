// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title  DemoCash
 * @notice A plain 6-decimal ERC-20 standing in for the cash leg on testnet.
 *
 * Not part of the protocol. Rialto never holds the cash token — it moves lender
 * to borrower at award and back at repayment, inside a single call — so the only
 * thing the market needs from it is a working `transferFrom`. On mainnet this
 * would be USDC through its HTS facade; here it is this, because obtaining and
 * associating a testnet HTS token adds a dependency the demo does not need.
 *
 * `mint` is deliberately open. This token has no value and pretending otherwise
 * with an owner check would only obscure that.
 */
contract DemoCash {
    string public constant name = "Rialto Demo USD";
    string public constant symbol = "dUSD";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a < amount) revert InsufficientAllowance();
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        uint256 b = balanceOf[from];
        if (b < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = b - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}
