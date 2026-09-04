// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @notice Hedera Schedule Service, the system contract at `0x…016b`.
 *
 * HIP-1215 ("Generalized Scheduled Contract Calls") is Final and shipped in
 * consensus node v0.68.0. It is what lets a contract ask the network to call it
 * back at a future second — no keeper, no cron box, no off-chain signer.
 *
 * Verified live on Hedera testnet and mainnet on 2026-09-04 by calling
 * `hasScheduleCapacity` through the JSON-RPC relay. See ARCHITECTURE.md §3.6
 * for the reproduction commands and the measured 62-day expiry ceiling.
 *
 * @dev None of these revert on a business failure; they return a Hedera
 *      response code, where 22 is SUCCESS. Call sites must check the code
 *      rather than wait for a revert that will not come. They *can* still fail
 *      at the EVM level on a network where nothing is deployed at `0x…016b`,
 *      which is why every call site also wraps them.
 */
interface IHederaScheduleService {
    function scheduleCall(
        address to,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64 value,
        bytes memory callData
    ) external returns (int64 responseCode, address scheduleAddress);

    function deleteSchedule(address scheduleAddress) external returns (int64 responseCode);

    function hasScheduleCapacity(uint256 expirySecond, uint256 gasLimit) external view returns (bool);
}
