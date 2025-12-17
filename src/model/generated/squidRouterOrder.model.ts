import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_, DateTimeColumn as DateTimeColumn_} from "@subsquid/typeorm-store"

/**
 * Tracks Squid Router orders that use credits
 */
@Entity_()
export class SquidRouterOrder {
    constructor(props?: Partial<SquidRouterOrder>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @StringColumn_({nullable: false})
    orderHash!: string

    @StringColumn_({array: true, nullable: false})
    creditIds!: (string)[]

    @BigIntColumn_({nullable: false})
    totalCreditsUsed!: bigint

    @Index_()
    @StringColumn_({nullable: false})
    fromAddress!: string

    @Index_()
    @StringColumn_({nullable: false})
    toAddress!: string

    @StringColumn_({nullable: true})
    filler!: string | undefined | null

    @StringColumn_({nullable: true})
    fromToken!: string | undefined | null

    @StringColumn_({nullable: true})
    toToken!: string | undefined | null

    @BigIntColumn_({nullable: true})
    fromAmount!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    fillAmount!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    feeRate!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    fromChain!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    toChain!: bigint | undefined | null

    @Index_()
    @StringColumn_({nullable: false})
    txHash!: string

    @Index_()
    @StringColumn_({nullable: true})
    destinationTxHash!: string | undefined | null

    @StringColumn_({nullable: true})
    squidStatus!: string | undefined | null

    @IntColumn_({nullable: false})
    blockNumber!: number

    @DateTimeColumn_({nullable: false})
    timestamp!: Date
}
