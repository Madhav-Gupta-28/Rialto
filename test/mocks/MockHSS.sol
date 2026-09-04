// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * A stand-in for the Hedera Schedule Service system contract at 0x…016b.
 *
 * The real one is a network service, so tests etch this at that address to
 * exercise the scheduling path. It mirrors the two behaviours that matter:
 * `scheduleCall` returns a response code rather than reverting, and capacity
 * can be refused for a given second.
 */
contract MockHSS {
    int64 public constant SUCCESS = 22;
    int64 public constant CAPACITY_EXCEEDED = 33;

    struct Scheduled {
        address to;
        uint256 expiry;
        uint256 gasLimit;
        bytes callData;
        bool deleted;
        bool executed;
    }

    Scheduled[] public scheduled;

    bool public capacity = true;
    bool public failCreate; // return a non-success code
    bool public revertAll; // fail at the EVM level, as a wrong address would

    uint256 public deleteCount;

    function setCapacity(bool c) external {
        capacity = c;
    }

    function setFailCreate(bool f) external {
        failCreate = f;
    }

    function setRevertAll(bool r) external {
        revertAll = r;
    }

    function count() external view returns (uint256) {
        return scheduled.length;
    }

    function hasScheduleCapacity(uint256, uint256) external view returns (bool) {
        require(!revertAll, "HSS down");
        return capacity;
    }

    function scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64, bytes memory callData)
        external
        returns (int64, address)
    {
        require(!revertAll, "HSS down");
        if (failCreate) return (CAPACITY_EXCEEDED, address(0));
        scheduled.push(
            Scheduled({
                to: to,
                expiry: expirySecond,
                gasLimit: gasLimit,
                callData: callData,
                deleted: false,
                executed: false
            })
        );
        // A schedule address only has to be unique and non-zero here.
        return (SUCCESS, address(uint160(0xC0FFEE00 + scheduled.length)));
    }

    function deleteSchedule(address) external returns (int64) {
        require(!revertAll, "HSS down");
        deleteCount++;
        return SUCCESS;
    }

    /// Fire a pending schedule, the way the network would at its expiry second.
    function fire(uint256 i) external returns (bool ok, bytes memory ret) {
        Scheduled storage s = scheduled[i];
        require(!s.deleted && !s.executed, "not pending");
        s.executed = true;
        (ok, ret) = s.to.call{gas: s.gasLimit}(s.callData);
    }
}
