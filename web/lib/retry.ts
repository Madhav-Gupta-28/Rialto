/**
 * Whether a failed read is worth asking about again.
 *
 * A transport that timed out is worth another try. A revert is not: it is the
 * contract's answer, and asking a second and a third time returns it verbatim
 * while the page sits on a spinner. `get(999)` on a market holding twenty-one
 * loans reverts with an out-of-bounds panic, and under a blanket retry that
 * turns "no such request" into several seconds of "Reading Hedera testnet…"
 * before the same answer arrives.
 *
 * viem nests its errors, so the revert is found by walking the cause chain
 * rather than by reading the outermost name — which is always the generic
 * `ContractFunctionExecutionError`, revert or not.
 */
export function isRevert(error: unknown): boolean {
  let cause: unknown = error;
  for (let depth = 0; cause && depth < 8; depth++) {
    const name = (cause as { name?: unknown }).name;
    if (name === "ContractFunctionRevertedError") return true;
    cause = (cause as { cause?: unknown }).cause;
  }
  return false;
}

/** Two more tries for anything that might succeed; none for anything settled. */
export function retryRead(failureCount: number, error: unknown): boolean {
  return !isRevert(error) && failureCount < 2;
}
