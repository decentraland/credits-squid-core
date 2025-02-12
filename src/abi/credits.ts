import * as p from '@subsquid/evm-codec'
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi'
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi'

export const events = {
    CreditSpent: event("0xa47f5a81bf499da7a7307475aa5ec19aff21a382b8f36bc98455404239b6e16c", "CreditSpent(bytes32,address,uint256)", {"_creditId": indexed(p.bytes32), "beneficiary": indexed(p.address), "amount": p.uint256}),
}

export const functions = {
    consumeCredit: fun("0x99a4a4c2", "consumeCredit(bytes32,uint256)", {"_creditSignature": p.bytes32, "amount": p.uint256}, ),
}

export class Contract extends ContractBase {
}

/// Event types
export type CreditSpentEventArgs = EParams<typeof events.CreditSpent>

/// Function types
export type ConsumeCreditParams = FunctionArguments<typeof functions.consumeCredit>
export type ConsumeCreditReturn = FunctionReturn<typeof functions.consumeCredit>

