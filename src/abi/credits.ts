import * as p from '@subsquid/evm-codec'
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi'
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi'

export const events = {
    CreditRevoked: event("0x70884a2b9de2f609a1f0ea7d2e4f839d66c9b43c4eeb83341f60d2477abbd18c", "CreditRevoked(address,bytes32)", {"_sender": indexed(p.address), "_creditId": indexed(p.bytes32)}),
    CreditUsed: event("0xa68d6ae15d7c3b8ca4d13dbccb4762b825753f5bbafab66b88d893af0c1b7179", "CreditUsed(address,bytes32,(uint256,uint256,bytes32),uint256)", {"_sender": indexed(p.address), "_creditId": indexed(p.bytes32), "_credit": p.struct({"value": p.uint256, "expiresAt": p.uint256, "salt": p.bytes32}), "_value": p.uint256}),
    CreditsUsed: event("0xbf0c0494baf6ed7e1481b0ec6d3ed75f70442f3ac8d509e54e80251640471373", "CreditsUsed(address,uint256,uint256)", {"_sender": indexed(p.address), "_manaTransferred": p.uint256, "_creditedValue": p.uint256}),
    CustomExternalCallAllowed: event("0x42aea540ce16cb737850c62980a0147a6d67c1669f3bd608130065f4ab8d0d1a", "CustomExternalCallAllowed(address,address,bytes4,bool)", {"_sender": indexed(p.address), "_target": indexed(p.address), "_selector": indexed(p.bytes4), "_allowed": p.bool}),
    CustomExternalCallRevoked: event("0x88c65595ff06d7e6a4fef8cff3dd27972091ce965b2d8b7683e9cf254866caed", "CustomExternalCallRevoked(address,bytes32)", {"_sender": indexed(p.address), "_hashedExternalCallSignature": indexed(p.bytes32)}),
    ERC20Withdrawn: event("0xa96614c318e15abef3c2bb730688f3dbda373ce46b0dc591742cf50c4af9aab4", "ERC20Withdrawn(address,address,uint256,address)", {"_sender": indexed(p.address), "_token": indexed(p.address), "_amount": p.uint256, "_to": indexed(p.address)}),
    ERC721Withdrawn: event("0xf28aabb20ed461621aee5d002140242be053f048f15d7b7f76c7ce7fe1caea31", "ERC721Withdrawn(address,address,uint256,address)", {"_sender": indexed(p.address), "_token": indexed(p.address), "_tokenId": p.uint256, "_to": indexed(p.address)}),
    MaxManaCreditedPerHourUpdated: event("0xa2ad351155c7805940d7a9ba2ad8bae56f9a4ed77f4deb432319c3d2d6c7fc2a", "MaxManaCreditedPerHourUpdated(address,uint256)", {"_sender": indexed(p.address), "_maxManaCreditedPerHour": p.uint256}),
    MetaTransactionExecuted: event("0x5845892132946850460bff5a0083f71031bc5bf9aadcd40f1de79423eac9b10b", "MetaTransactionExecuted(address,address,bytes)", {"_userAddress": indexed(p.address), "_relayerAddress": indexed(p.address), "_functionData": p.bytes}),
    Paused: event("0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258", "Paused(address)", {"account": p.address}),
    PrimarySalesAllowedUpdated: event("0xbb75bd668ca63403382c19a30891396fbd78804e1ee0758730a1be76971c8abf", "PrimarySalesAllowedUpdated(address,bool)", {"_sender": indexed(p.address), "_primarySalesAllowed": p.bool}),
    RoleAdminChanged: event("0xbd79b86ffe0ab8e8776151514217cd7cacd52c909f66475c3af44e129f0b00ff", "RoleAdminChanged(bytes32,bytes32,bytes32)", {"role": indexed(p.bytes32), "previousAdminRole": indexed(p.bytes32), "newAdminRole": indexed(p.bytes32)}),
    RoleGranted: event("0x2f8788117e7eff1d82e926ec794901d17c78024a50270940304540a733656f0d", "RoleGranted(bytes32,address,address)", {"role": indexed(p.bytes32), "account": indexed(p.address), "sender": indexed(p.address)}),
    RoleRevoked: event("0xf6391f5c32d9c69d2a47ea670b442974b53935d1edc7fd64eb21e047a839171b", "RoleRevoked(bytes32,address,address)", {"role": indexed(p.bytes32), "account": indexed(p.address), "sender": indexed(p.address)}),
    SecondarySalesAllowedUpdated: event("0x4b13b8f38f82e032ccc7948a9c54be13032efa2471f299d91f857e74fce9f3bc", "SecondarySalesAllowedUpdated(address,bool)", {"_sender": indexed(p.address), "_secondarySalesAllowed": p.bool}),
    Unpaused: event("0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa", "Unpaused(address)", {"account": p.address}),
    UserAllowed: event("0x767240d3c58c1058ed268ca225eb1cc93d85cf46b6e85d8d120b39921475b1c1", "UserAllowed(address,address)", {"_sender": indexed(p.address), "_user": indexed(p.address)}),
    UserDenied: event("0xb6d1c226558b189804a9bb66bc9054b8701668685112f589016bfc152e00f246", "UserDenied(address,address)", {"_sender": indexed(p.address), "_user": indexed(p.address)}),
}

export const functions = {
    ASSET_TYPE_COLLECTION_ITEM: viewFun("0xba9ea7bd", "ASSET_TYPE_COLLECTION_ITEM()", {}, p.uint256),
    ASSET_TYPE_ERC20: viewFun("0x6c1d8ee6", "ASSET_TYPE_ERC20()", {}, p.uint256),
    ASSET_TYPE_ERC721: viewFun("0x7bb185bd", "ASSET_TYPE_ERC721()", {}, p.uint256),
    ASSET_TYPE_USD_PEGGED_MANA: viewFun("0xa5b2a654", "ASSET_TYPE_USD_PEGGED_MANA()", {}, p.uint256),
    DEFAULT_ADMIN_ROLE: viewFun("0xa217fddf", "DEFAULT_ADMIN_ROLE()", {}, p.bytes32),
    DENIER_ROLE: viewFun("0x80fd8150", "DENIER_ROLE()", {}, p.bytes32),
    EXTERNAL_CALL_REVOKER_ROLE: viewFun("0x2c4d5e3d", "EXTERNAL_CALL_REVOKER_ROLE()", {}, p.bytes32),
    EXTERNAL_CALL_SIGNER_ROLE: viewFun("0x15f20038", "EXTERNAL_CALL_SIGNER_ROLE()", {}, p.bytes32),
    PAUSER_ROLE: viewFun("0xe63ab1e9", "PAUSER_ROLE()", {}, p.bytes32),
    REVOKER_ROLE: viewFun("0x7c4acabf", "REVOKER_ROLE()", {}, p.bytes32),
    SIGNER_ROLE: viewFun("0xa1ebf35d", "SIGNER_ROLE()", {}, p.bytes32),
    allowCustomExternalCall: fun("0x425adff5", "allowCustomExternalCall(address,bytes4,bool)", {"_target": p.address, "_selector": p.bytes4, "_allowed": p.bool}, ),
    allowUser: fun("0x771c456f", "allowUser(address)", {"_user": p.address}, ),
    allowedCustomExternalCalls: viewFun("0xa1b3130b", "allowedCustomExternalCalls(address,bytes4)", {"_0": p.address, "_1": p.bytes4}, p.bool),
    collectionFactory: viewFun("0xcf25a2fd", "collectionFactory()", {}, p.address),
    collectionFactoryV3: viewFun("0x4b5e3a12", "collectionFactoryV3()", {}, p.address),
    collectionStore: viewFun("0xa078d364", "collectionStore()", {}, p.address),
    denyUser: fun("0x48e071d4", "denyUser(address)", {"_user": p.address}, ),
    executeMetaTransaction: fun("0xd8ed1acc", "executeMetaTransaction(address,bytes,bytes)", {"_userAddress": p.address, "_functionData": p.bytes, "_signature": p.bytes}, p.bytes),
    getNonce: viewFun("0x2d0335ab", "getNonce(address)", {"_signer": p.address}, p.uint256),
    getRoleAdmin: viewFun("0x248a9ca3", "getRoleAdmin(bytes32)", {"role": p.bytes32}, p.bytes32),
    grantRole: fun("0x2f2ff15d", "grantRole(bytes32,address)", {"role": p.bytes32, "account": p.address}, ),
    hasRole: viewFun("0x91d14854", "hasRole(bytes32,address)", {"role": p.bytes32, "account": p.address}, p.bool),
    hourOfLastManaCredit: viewFun("0xd1f44ab1", "hourOfLastManaCredit()", {}, p.uint256),
    isDenied: viewFun("0xe838dfbb", "isDenied(address)", {"_0": p.address}, p.bool),
    isRevoked: viewFun("0x4294857f", "isRevoked(bytes32)", {"_0": p.bytes32}, p.bool),
    legacyMarketplace: viewFun("0x298b8f26", "legacyMarketplace()", {}, p.address),
    mana: viewFun("0xbdb001a7", "mana()", {}, p.address),
    manaCreditedThisHour: viewFun("0x4df167be", "manaCreditedThisHour()", {}, p.uint256),
    marketplace: viewFun("0xabc8c7af", "marketplace()", {}, p.address),
    maxManaCreditedPerHour: viewFun("0x626c7fee", "maxManaCreditedPerHour()", {}, p.uint256),
    onERC721Received: viewFun("0x150b7a02", "onERC721Received(address,address,uint256,bytes)", {"_0": p.address, "_1": p.address, "_2": p.uint256, "_3": p.bytes}, p.bytes4),
    pause: fun("0x8456cb59", "pause()", {}, ),
    paused: viewFun("0x5c975abb", "paused()", {}, p.bool),
    primarySalesAllowed: viewFun("0x55c81e2c", "primarySalesAllowed()", {}, p.bool),
    renounceRole: fun("0x36568abe", "renounceRole(bytes32,address)", {"role": p.bytes32, "callerConfirmation": p.address}, ),
    revokeCredit: fun("0xb08235bc", "revokeCredit(bytes32)", {"_credit": p.bytes32}, ),
    revokeCustomExternalCall: fun("0xb16038c0", "revokeCustomExternalCall(bytes32)", {"_hashedCustomExternalCallSignature": p.bytes32}, ),
    revokeRole: fun("0xd547741f", "revokeRole(bytes32,address)", {"role": p.bytes32, "account": p.address}, ),
    secondarySalesAllowed: viewFun("0x3c0b1267", "secondarySalesAllowed()", {}, p.bool),
    spentValue: viewFun("0xed3a61b7", "spentValue(bytes32)", {"_0": p.bytes32}, p.uint256),
    supportsInterface: viewFun("0x01ffc9a7", "supportsInterface(bytes4)", {"interfaceId": p.bytes4}, p.bool),
    unpause: fun("0x3f4ba83a", "unpause()", {}, ),
    updateMaxManaCreditedPerHour: fun("0x5fe34337", "updateMaxManaCreditedPerHour(uint256)", {"_maxManaCreditedPerHour": p.uint256}, ),
    updatePrimarySalesAllowed: fun("0xcc0262f8", "updatePrimarySalesAllowed(bool)", {"_primarySalesAllowed": p.bool}, ),
    updateSecondarySalesAllowed: fun("0xc6cf3dc6", "updateSecondarySalesAllowed(bool)", {"_secondarySalesAllowed": p.bool}, ),
    useCredits: fun("0x1863572d", "useCredits(((uint256,uint256,bytes32)[],bytes[],(address,bytes4,bytes,uint256,bytes32),bytes,uint256,uint256))", {"_args": p.struct({"credits": p.array(p.struct({"value": p.uint256, "expiresAt": p.uint256, "salt": p.bytes32})), "creditsSignatures": p.array(p.bytes), "externalCall": p.struct({"target": p.address, "selector": p.bytes4, "data": p.bytes, "expiresAt": p.uint256, "salt": p.bytes32}), "customExternalCallSignature": p.bytes, "maxUncreditedValue": p.uint256, "maxCreditedValue": p.uint256})}, ),
    usedCustomExternalCallSignature: viewFun("0xd41070b2", "usedCustomExternalCallSignature(bytes32)", {"_0": p.bytes32}, p.bool),
    withdrawERC20: fun("0x5fc3ea0b", "withdrawERC20(address,uint256,address)", {"_token": p.address, "_amount": p.uint256, "_to": p.address}, ),
    withdrawERC721: fun("0x7b9f76b5", "withdrawERC721(address,uint256,address)", {"_token": p.address, "_tokenId": p.uint256, "_to": p.address}, ),
}

export class Contract extends ContractBase {

    ASSET_TYPE_COLLECTION_ITEM() {
        return this.eth_call(functions.ASSET_TYPE_COLLECTION_ITEM, {})
    }

    ASSET_TYPE_ERC20() {
        return this.eth_call(functions.ASSET_TYPE_ERC20, {})
    }

    ASSET_TYPE_ERC721() {
        return this.eth_call(functions.ASSET_TYPE_ERC721, {})
    }

    ASSET_TYPE_USD_PEGGED_MANA() {
        return this.eth_call(functions.ASSET_TYPE_USD_PEGGED_MANA, {})
    }

    DEFAULT_ADMIN_ROLE() {
        return this.eth_call(functions.DEFAULT_ADMIN_ROLE, {})
    }

    DENIER_ROLE() {
        return this.eth_call(functions.DENIER_ROLE, {})
    }

    EXTERNAL_CALL_REVOKER_ROLE() {
        return this.eth_call(functions.EXTERNAL_CALL_REVOKER_ROLE, {})
    }

    EXTERNAL_CALL_SIGNER_ROLE() {
        return this.eth_call(functions.EXTERNAL_CALL_SIGNER_ROLE, {})
    }

    PAUSER_ROLE() {
        return this.eth_call(functions.PAUSER_ROLE, {})
    }

    REVOKER_ROLE() {
        return this.eth_call(functions.REVOKER_ROLE, {})
    }

    SIGNER_ROLE() {
        return this.eth_call(functions.SIGNER_ROLE, {})
    }

    allowedCustomExternalCalls(_0: AllowedCustomExternalCallsParams["_0"], _1: AllowedCustomExternalCallsParams["_1"]) {
        return this.eth_call(functions.allowedCustomExternalCalls, {_0, _1})
    }

    collectionFactory() {
        return this.eth_call(functions.collectionFactory, {})
    }

    collectionFactoryV3() {
        return this.eth_call(functions.collectionFactoryV3, {})
    }

    collectionStore() {
        return this.eth_call(functions.collectionStore, {})
    }

    getNonce(_signer: GetNonceParams["_signer"]) {
        return this.eth_call(functions.getNonce, {_signer})
    }

    getRoleAdmin(role: GetRoleAdminParams["role"]) {
        return this.eth_call(functions.getRoleAdmin, {role})
    }

    hasRole(role: HasRoleParams["role"], account: HasRoleParams["account"]) {
        return this.eth_call(functions.hasRole, {role, account})
    }

    hourOfLastManaCredit() {
        return this.eth_call(functions.hourOfLastManaCredit, {})
    }

    isDenied(_0: IsDeniedParams["_0"]) {
        return this.eth_call(functions.isDenied, {_0})
    }

    isRevoked(_0: IsRevokedParams["_0"]) {
        return this.eth_call(functions.isRevoked, {_0})
    }

    legacyMarketplace() {
        return this.eth_call(functions.legacyMarketplace, {})
    }

    mana() {
        return this.eth_call(functions.mana, {})
    }

    manaCreditedThisHour() {
        return this.eth_call(functions.manaCreditedThisHour, {})
    }

    marketplace() {
        return this.eth_call(functions.marketplace, {})
    }

    maxManaCreditedPerHour() {
        return this.eth_call(functions.maxManaCreditedPerHour, {})
    }

    onERC721Received(_0: OnERC721ReceivedParams["_0"], _1: OnERC721ReceivedParams["_1"], _2: OnERC721ReceivedParams["_2"], _3: OnERC721ReceivedParams["_3"]) {
        return this.eth_call(functions.onERC721Received, {_0, _1, _2, _3})
    }

    paused() {
        return this.eth_call(functions.paused, {})
    }

    primarySalesAllowed() {
        return this.eth_call(functions.primarySalesAllowed, {})
    }

    secondarySalesAllowed() {
        return this.eth_call(functions.secondarySalesAllowed, {})
    }

    spentValue(_0: SpentValueParams["_0"]) {
        return this.eth_call(functions.spentValue, {_0})
    }

    supportsInterface(interfaceId: SupportsInterfaceParams["interfaceId"]) {
        return this.eth_call(functions.supportsInterface, {interfaceId})
    }

    usedCustomExternalCallSignature(_0: UsedCustomExternalCallSignatureParams["_0"]) {
        return this.eth_call(functions.usedCustomExternalCallSignature, {_0})
    }
}

/// Event types
export type CreditRevokedEventArgs = EParams<typeof events.CreditRevoked>
export type CreditUsedEventArgs = EParams<typeof events.CreditUsed>
export type CreditsUsedEventArgs = EParams<typeof events.CreditsUsed>
export type CustomExternalCallAllowedEventArgs = EParams<typeof events.CustomExternalCallAllowed>
export type CustomExternalCallRevokedEventArgs = EParams<typeof events.CustomExternalCallRevoked>
export type ERC20WithdrawnEventArgs = EParams<typeof events.ERC20Withdrawn>
export type ERC721WithdrawnEventArgs = EParams<typeof events.ERC721Withdrawn>
export type MaxManaCreditedPerHourUpdatedEventArgs = EParams<typeof events.MaxManaCreditedPerHourUpdated>
export type MetaTransactionExecutedEventArgs = EParams<typeof events.MetaTransactionExecuted>
export type PausedEventArgs = EParams<typeof events.Paused>
export type PrimarySalesAllowedUpdatedEventArgs = EParams<typeof events.PrimarySalesAllowedUpdated>
export type RoleAdminChangedEventArgs = EParams<typeof events.RoleAdminChanged>
export type RoleGrantedEventArgs = EParams<typeof events.RoleGranted>
export type RoleRevokedEventArgs = EParams<typeof events.RoleRevoked>
export type SecondarySalesAllowedUpdatedEventArgs = EParams<typeof events.SecondarySalesAllowedUpdated>
export type UnpausedEventArgs = EParams<typeof events.Unpaused>
export type UserAllowedEventArgs = EParams<typeof events.UserAllowed>
export type UserDeniedEventArgs = EParams<typeof events.UserDenied>

/// Function types
export type ASSET_TYPE_COLLECTION_ITEMParams = FunctionArguments<typeof functions.ASSET_TYPE_COLLECTION_ITEM>
export type ASSET_TYPE_COLLECTION_ITEMReturn = FunctionReturn<typeof functions.ASSET_TYPE_COLLECTION_ITEM>

export type ASSET_TYPE_ERC20Params = FunctionArguments<typeof functions.ASSET_TYPE_ERC20>
export type ASSET_TYPE_ERC20Return = FunctionReturn<typeof functions.ASSET_TYPE_ERC20>

export type ASSET_TYPE_ERC721Params = FunctionArguments<typeof functions.ASSET_TYPE_ERC721>
export type ASSET_TYPE_ERC721Return = FunctionReturn<typeof functions.ASSET_TYPE_ERC721>

export type ASSET_TYPE_USD_PEGGED_MANAParams = FunctionArguments<typeof functions.ASSET_TYPE_USD_PEGGED_MANA>
export type ASSET_TYPE_USD_PEGGED_MANAReturn = FunctionReturn<typeof functions.ASSET_TYPE_USD_PEGGED_MANA>

export type DEFAULT_ADMIN_ROLEParams = FunctionArguments<typeof functions.DEFAULT_ADMIN_ROLE>
export type DEFAULT_ADMIN_ROLEReturn = FunctionReturn<typeof functions.DEFAULT_ADMIN_ROLE>

export type DENIER_ROLEParams = FunctionArguments<typeof functions.DENIER_ROLE>
export type DENIER_ROLEReturn = FunctionReturn<typeof functions.DENIER_ROLE>

export type EXTERNAL_CALL_REVOKER_ROLEParams = FunctionArguments<typeof functions.EXTERNAL_CALL_REVOKER_ROLE>
export type EXTERNAL_CALL_REVOKER_ROLEReturn = FunctionReturn<typeof functions.EXTERNAL_CALL_REVOKER_ROLE>

export type EXTERNAL_CALL_SIGNER_ROLEParams = FunctionArguments<typeof functions.EXTERNAL_CALL_SIGNER_ROLE>
export type EXTERNAL_CALL_SIGNER_ROLEReturn = FunctionReturn<typeof functions.EXTERNAL_CALL_SIGNER_ROLE>

export type PAUSER_ROLEParams = FunctionArguments<typeof functions.PAUSER_ROLE>
export type PAUSER_ROLEReturn = FunctionReturn<typeof functions.PAUSER_ROLE>

export type REVOKER_ROLEParams = FunctionArguments<typeof functions.REVOKER_ROLE>
export type REVOKER_ROLEReturn = FunctionReturn<typeof functions.REVOKER_ROLE>

export type SIGNER_ROLEParams = FunctionArguments<typeof functions.SIGNER_ROLE>
export type SIGNER_ROLEReturn = FunctionReturn<typeof functions.SIGNER_ROLE>

export type AllowCustomExternalCallParams = FunctionArguments<typeof functions.allowCustomExternalCall>
export type AllowCustomExternalCallReturn = FunctionReturn<typeof functions.allowCustomExternalCall>

export type AllowUserParams = FunctionArguments<typeof functions.allowUser>
export type AllowUserReturn = FunctionReturn<typeof functions.allowUser>

export type AllowedCustomExternalCallsParams = FunctionArguments<typeof functions.allowedCustomExternalCalls>
export type AllowedCustomExternalCallsReturn = FunctionReturn<typeof functions.allowedCustomExternalCalls>

export type CollectionFactoryParams = FunctionArguments<typeof functions.collectionFactory>
export type CollectionFactoryReturn = FunctionReturn<typeof functions.collectionFactory>

export type CollectionFactoryV3Params = FunctionArguments<typeof functions.collectionFactoryV3>
export type CollectionFactoryV3Return = FunctionReturn<typeof functions.collectionFactoryV3>

export type CollectionStoreParams = FunctionArguments<typeof functions.collectionStore>
export type CollectionStoreReturn = FunctionReturn<typeof functions.collectionStore>

export type DenyUserParams = FunctionArguments<typeof functions.denyUser>
export type DenyUserReturn = FunctionReturn<typeof functions.denyUser>

export type ExecuteMetaTransactionParams = FunctionArguments<typeof functions.executeMetaTransaction>
export type ExecuteMetaTransactionReturn = FunctionReturn<typeof functions.executeMetaTransaction>

export type GetNonceParams = FunctionArguments<typeof functions.getNonce>
export type GetNonceReturn = FunctionReturn<typeof functions.getNonce>

export type GetRoleAdminParams = FunctionArguments<typeof functions.getRoleAdmin>
export type GetRoleAdminReturn = FunctionReturn<typeof functions.getRoleAdmin>

export type GrantRoleParams = FunctionArguments<typeof functions.grantRole>
export type GrantRoleReturn = FunctionReturn<typeof functions.grantRole>

export type HasRoleParams = FunctionArguments<typeof functions.hasRole>
export type HasRoleReturn = FunctionReturn<typeof functions.hasRole>

export type HourOfLastManaCreditParams = FunctionArguments<typeof functions.hourOfLastManaCredit>
export type HourOfLastManaCreditReturn = FunctionReturn<typeof functions.hourOfLastManaCredit>

export type IsDeniedParams = FunctionArguments<typeof functions.isDenied>
export type IsDeniedReturn = FunctionReturn<typeof functions.isDenied>

export type IsRevokedParams = FunctionArguments<typeof functions.isRevoked>
export type IsRevokedReturn = FunctionReturn<typeof functions.isRevoked>

export type LegacyMarketplaceParams = FunctionArguments<typeof functions.legacyMarketplace>
export type LegacyMarketplaceReturn = FunctionReturn<typeof functions.legacyMarketplace>

export type ManaParams = FunctionArguments<typeof functions.mana>
export type ManaReturn = FunctionReturn<typeof functions.mana>

export type ManaCreditedThisHourParams = FunctionArguments<typeof functions.manaCreditedThisHour>
export type ManaCreditedThisHourReturn = FunctionReturn<typeof functions.manaCreditedThisHour>

export type MarketplaceParams = FunctionArguments<typeof functions.marketplace>
export type MarketplaceReturn = FunctionReturn<typeof functions.marketplace>

export type MaxManaCreditedPerHourParams = FunctionArguments<typeof functions.maxManaCreditedPerHour>
export type MaxManaCreditedPerHourReturn = FunctionReturn<typeof functions.maxManaCreditedPerHour>

export type OnERC721ReceivedParams = FunctionArguments<typeof functions.onERC721Received>
export type OnERC721ReceivedReturn = FunctionReturn<typeof functions.onERC721Received>

export type PauseParams = FunctionArguments<typeof functions.pause>
export type PauseReturn = FunctionReturn<typeof functions.pause>

export type PausedParams = FunctionArguments<typeof functions.paused>
export type PausedReturn = FunctionReturn<typeof functions.paused>

export type PrimarySalesAllowedParams = FunctionArguments<typeof functions.primarySalesAllowed>
export type PrimarySalesAllowedReturn = FunctionReturn<typeof functions.primarySalesAllowed>

export type RenounceRoleParams = FunctionArguments<typeof functions.renounceRole>
export type RenounceRoleReturn = FunctionReturn<typeof functions.renounceRole>

export type RevokeCreditParams = FunctionArguments<typeof functions.revokeCredit>
export type RevokeCreditReturn = FunctionReturn<typeof functions.revokeCredit>

export type RevokeCustomExternalCallParams = FunctionArguments<typeof functions.revokeCustomExternalCall>
export type RevokeCustomExternalCallReturn = FunctionReturn<typeof functions.revokeCustomExternalCall>

export type RevokeRoleParams = FunctionArguments<typeof functions.revokeRole>
export type RevokeRoleReturn = FunctionReturn<typeof functions.revokeRole>

export type SecondarySalesAllowedParams = FunctionArguments<typeof functions.secondarySalesAllowed>
export type SecondarySalesAllowedReturn = FunctionReturn<typeof functions.secondarySalesAllowed>

export type SpentValueParams = FunctionArguments<typeof functions.spentValue>
export type SpentValueReturn = FunctionReturn<typeof functions.spentValue>

export type SupportsInterfaceParams = FunctionArguments<typeof functions.supportsInterface>
export type SupportsInterfaceReturn = FunctionReturn<typeof functions.supportsInterface>

export type UnpauseParams = FunctionArguments<typeof functions.unpause>
export type UnpauseReturn = FunctionReturn<typeof functions.unpause>

export type UpdateMaxManaCreditedPerHourParams = FunctionArguments<typeof functions.updateMaxManaCreditedPerHour>
export type UpdateMaxManaCreditedPerHourReturn = FunctionReturn<typeof functions.updateMaxManaCreditedPerHour>

export type UpdatePrimarySalesAllowedParams = FunctionArguments<typeof functions.updatePrimarySalesAllowed>
export type UpdatePrimarySalesAllowedReturn = FunctionReturn<typeof functions.updatePrimarySalesAllowed>

export type UpdateSecondarySalesAllowedParams = FunctionArguments<typeof functions.updateSecondarySalesAllowed>
export type UpdateSecondarySalesAllowedReturn = FunctionReturn<typeof functions.updateSecondarySalesAllowed>

export type UseCreditsParams = FunctionArguments<typeof functions.useCredits>
export type UseCreditsReturn = FunctionReturn<typeof functions.useCredits>

export type UsedCustomExternalCallSignatureParams = FunctionArguments<typeof functions.usedCustomExternalCallSignature>
export type UsedCustomExternalCallSignatureReturn = FunctionReturn<typeof functions.usedCustomExternalCallSignature>

export type WithdrawERC20Params = FunctionArguments<typeof functions.withdrawERC20>
export type WithdrawERC20Return = FunctionReturn<typeof functions.withdrawERC20>

export type WithdrawERC721Params = FunctionArguments<typeof functions.withdrawERC721>
export type WithdrawERC721Return = FunctionReturn<typeof functions.withdrawERC721>

