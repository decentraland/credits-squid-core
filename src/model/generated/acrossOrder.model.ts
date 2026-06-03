import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_, DateTimeColumn as DateTimeColumn_} from "@subsquid/typeorm-store"

/**
 * Tracks Across (V4) cross-chain deposits that use credits.
 * Parallel to SquidRouterOrder but for the Across bridge: the source side emits a
 * FundsDeposited event on the Polygon SpokePool, and the destination fill is resolved
 * asynchronously via the Across deposit-status API.
 */
@Entity_()
export class AcrossOrder {
    constructor(props?: Partial<AcrossOrder>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @StringColumn_({nullable: false})
    depositId!: string

    @StringColumn_({array: true, nullable: false})
    creditIds!: (string)[]

    @BigIntColumn_({nullable: false})
    totalCreditsUsed!: bigint

    @Index_()
    @StringColumn_({nullable: true})
    beneficiary!: string | undefined | null

    @Index_()
    @StringColumn_({nullable: false})
    depositor!: string

    @StringColumn_({nullable: true})
    recipient!: string | undefined | null

    @StringColumn_({nullable: true})
    inputToken!: string | undefined | null

    @StringColumn_({nullable: true})
    outputToken!: string | undefined | null

    @BigIntColumn_({nullable: true})
    inputAmount!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    outputAmount!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    destinationChainId!: bigint | undefined | null

    @Index_()
    @StringColumn_({nullable: false})
    txHash!: string

    @Index_()
    @StringColumn_({nullable: true})
    destinationTxHash!: string | undefined | null

    @StringColumn_({nullable: true})
    acrossStatus!: string | undefined | null

    @IntColumn_({nullable: false})
    blockNumber!: number

    @DateTimeColumn_({nullable: false})
    timestamp!: Date
}
