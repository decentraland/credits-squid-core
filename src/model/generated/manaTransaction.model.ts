import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, BigIntColumn as BigIntColumn_, DateTimeColumn as DateTimeColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"

/**
 * Tracks MANA transactions correlated with credit usage
 */
@Entity_()
export class ManaTransaction {
    constructor(props?: Partial<ManaTransaction>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @StringColumn_({nullable: false})
    txHash!: string

    @Index_()
    @StringColumn_({nullable: false})
    fromAddress!: string

    @Index_()
    @StringColumn_({nullable: false})
    toAddress!: string

    @BigIntColumn_({nullable: false})
    totalManaAmount!: bigint

    @BigIntColumn_({nullable: true})
    creditAmount!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    userPaidAmount!: bigint | undefined | null

    @BigIntColumn_({nullable: true})
    daoFeeAmount!: bigint | undefined | null

    @StringColumn_({array: true, nullable: true})
    relatedConsumptionIds!: (string)[] | undefined | null

    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    @IntColumn_({nullable: false})
    block!: number
}
