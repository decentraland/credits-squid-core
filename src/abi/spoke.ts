import * as p from '@subsquid/evm-codec'
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi'
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi'

export const events = {
    FeesCollected: event("0x9bcb6d1f38f6800906185471a11ede9a8e16200853225aa62558db6076490f2d", "FeesCollected(address,address,uint256)", {"feeCollector": indexed(p.address), "token": indexed(p.address), "amount": indexed(p.uint256)}),
    Initialized: event("0xc7f505b2f371ae2175ee4913f4499e1f2633a7b5936321eed1cdaeb6115181d2", "Initialized(uint64)", {"version": p.uint64}),
    OrderCreated: event("0x181de28643611afcf1cb4c095a1ef99c157e78437294f478c978e4a56e1ca77e", "OrderCreated(bytes32,(address,address,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,bytes32))", {"orderHash": indexed(p.bytes32), "order": p.struct({"fromAddress": p.address, "toAddress": p.address, "filler": p.address, "fromToken": p.address, "toToken": p.address, "expiry": p.uint256, "fromAmount": p.uint256, "fillAmount": p.uint256, "feeRate": p.uint256, "fromChain": p.uint256, "toChain": p.uint256, "postHookHash": p.bytes32})}),
    OrderFilled: event("0x6955fd9b2a7639a9baac024897cad7007b45ffa74cbfe9582d58401ff6b977b7", "OrderFilled(bytes32,(address,address,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,bytes32))", {"orderHash": indexed(p.bytes32), "order": p.struct({"fromAddress": p.address, "toAddress": p.address, "filler": p.address, "fromToken": p.address, "toToken": p.address, "expiry": p.uint256, "fromAmount": p.uint256, "fillAmount": p.uint256, "feeRate": p.uint256, "fromChain": p.uint256, "toChain": p.uint256, "postHookHash": p.bytes32})}),
    OrderRefunded: event("0xa60671d8537ed193e567f86ddf28cf35dc67073b5ad80a2d41359cfa78db0a1e", "OrderRefunded(bytes32)", {"orderHash": indexed(p.bytes32)}),
    OwnershipTransferred: event("0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0", "OwnershipTransferred(address,address)", {"previousOwner": indexed(p.address), "newOwner": indexed(p.address)}),
    PeerSet: event("0x238399d427b947898edb290f5ff0f9109849b1c3ba196a42e35f00c50a54b98b", "PeerSet(uint32,bytes32)", {"eid": p.uint32, "peer": p.bytes32}),
    SettlementForwarded: event("0x69f975bd70ea51b973eb6aff3812f49adf595bd59d6f3d29840d5695cc19ba30", "SettlementForwarded(bytes32)", {"orderHash": indexed(p.bytes32)}),
    SpokeInitialized: event("0xf25a5e989fb7e02dc64e8a2c85e4fbaae049d3ce88c8cbb840860122201da24b", "SpokeInitialized(address,address,address,address,string,string)", {"gateway": indexed(p.address), "gasService": indexed(p.address), "squidMulticall": p.address, "feeCollector": p.address, "hubChainName": p.string, "hubAddress": p.string}),
    TokensReleased: event("0xd48052bf92f3eec93ecdeeec72ea80e1071c926cb4d6e5a37ee71be8a0ce9a10", "TokensReleased(bytes32)", {"orderHash": indexed(p.bytes32)}),
    TrustedAddressRemoved: event("0xf9400637a329865492b8d0d4dba4eafc7e8d5d0fae5e27b56766816d2ae1b2ca", "TrustedAddressRemoved(string)", {"chain": p.string}),
    TrustedAddressSet: event("0xdb6b260ea45f7fe513e1d3b8c21017a29e3a41610e95aefb8862b81c69aec61c", "TrustedAddressSet(string,string)", {"chain": p.string, "address_": p.string}),
}

/// Event types
export type FeesCollectedEventArgs = EParams<typeof events.FeesCollected>
export type InitializedEventArgs = EParams<typeof events.Initialized>
export type OrderCreatedEventArgs = EParams<typeof events.OrderCreated>
export type OrderFilledEventArgs = EParams<typeof events.OrderFilled>
export type OrderRefundedEventArgs = EParams<typeof events.OrderRefunded>
export type OwnershipTransferredEventArgs = EParams<typeof events.OwnershipTransferred>
export type PeerSetEventArgs = EParams<typeof events.PeerSet>
export type SettlementForwardedEventArgs = EParams<typeof events.SettlementForwarded>
export type SpokeInitializedEventArgs = EParams<typeof events.SpokeInitialized>
export type TokensReleasedEventArgs = EParams<typeof events.TokensReleased>
export type TrustedAddressRemovedEventArgs = EParams<typeof events.TrustedAddressRemoved>
export type TrustedAddressSetEventArgs = EParams<typeof events.TrustedAddressSet>

