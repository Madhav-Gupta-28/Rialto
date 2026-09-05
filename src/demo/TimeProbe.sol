// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title  TimeProbe
 * @notice Answers one question: what is `block.timestamp` inside a scheduled call?
 *
 * Not part of the protocol. Rialto's scheduled settlement compares
 * `block.timestamp` against a maturity, and two live schedules reverted early
 * and cheaply in a way that looks like the time check failing rather than gas
 * running out. Rather than infer it from fees a third time, this records the
 * value the EVM actually sees and lets it be compared with the consensus second
 * the network reports for the same execution.
 */
interface IHss {
    function scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData)
        external
        returns (int64 responseCode, address scheduleAddress);
    function hasScheduleCapacity(uint256 expirySecond, uint256 gasLimit) external view returns (bool);
}

contract TimeProbe {
    address private constant HSS = address(0x16b);

    uint256 public seenTimestamp;
    uint256 public seenBlock;
    uint256 public calls;
    uint256 public scheduledAt;
    uint256 public expiryAsked;

    event Stamped(uint256 timestamp, uint256 blockNumber, uint256 callIndex);
    event Scheduled(address schedule, uint256 expiry, int64 rc);

    /// The scheduled target. Records what the EVM reports at execution.
    function stamp() external {
        seenTimestamp = block.timestamp;
        seenBlock = block.number;
        calls += 1;
        emit Stamped(block.timestamp, block.number, calls);
    }

    /// Schedule `stamp()` for `secondsAhead` from now, exactly as the market does.
    function scheduleStamp(uint256 secondsAhead) external returns (address schedule) {
        uint256 expiry = block.timestamp + secondsAhead;
        scheduledAt = block.timestamp;
        expiryAsked = expiry;

        (bool ok, bytes memory data) =
            HSS.staticcall(abi.encodeWithSelector(IHss.hasScheduleCapacity.selector, expiry, uint256(400_000)));
        require(ok && data.length >= 32 && abi.decode(data, (bool)), "no capacity");

        (ok, data) = HSS.call(
            abi.encodeWithSelector(
                IHss.scheduleCall.selector, address(this), expiry, uint256(400_000), uint64(0), abi.encodeCall(this.stamp, ())
            )
        );
        require(ok && data.length >= 64, "schedule call failed");

        int64 rc;
        (rc, schedule) = abi.decode(data, (int64, address));
        emit Scheduled(schedule, expiry, rc);
    }

    receive() external payable {}
}
