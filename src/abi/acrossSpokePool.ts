import * as p from '@subsquid/evm-codec'
import { event, indexed } from '@subsquid/evm-abi'
import type { EventParams as EParams } from '@subsquid/evm-abi'

/**
 * Across V3.5+ SpokePool deposit event.
 *
 * Verified on-chain against the Polygon SpokePool (0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096):
 * topic0 = 0x32ed1a409ef04c7b0227189c3a103dc5ac10e775a15b785dcc510201f7c25ad3.
 *
 * This is the NEW unified `FundsDeposited` event (bytes32 addresses, uint256 depositId),
 * NOT the legacy `V3FundsDeposited` (address fields, uint32 depositId). The deployed pool
 * emits the unified one — confirmed by decoding a real log.
 *
 * Indexed: destinationChainId, depositId, depositor. The rest are in the data section.
 */
export const events = {
  FundsDeposited: event(
    '0x32ed1a409ef04c7b0227189c3a103dc5ac10e775a15b785dcc510201f7c25ad3',
    'FundsDeposited(bytes32,bytes32,uint256,uint256,uint256,uint256,uint32,uint32,uint32,bytes32,bytes32,bytes32,bytes)',
    {
      inputToken: p.bytes32,
      outputToken: p.bytes32,
      inputAmount: p.uint256,
      outputAmount: p.uint256,
      destinationChainId: indexed(p.uint256),
      depositId: indexed(p.uint256),
      quoteTimestamp: p.uint32,
      fillDeadline: p.uint32,
      exclusivityDeadline: p.uint32,
      depositor: indexed(p.bytes32),
      recipient: p.bytes32,
      exclusiveRelayer: p.bytes32,
      message: p.bytes
    }
  )
}

export type FundsDepositedEventArgs = EParams<typeof events.FundsDeposited>
