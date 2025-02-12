import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_, DateTimeColumn as DateTimeColumn_} from "@subsquid/typeorm-store"

/**
 * Tracks daily credit usage for reporting
 */
@Entity_()
export class DailyCreditUsage {
    constructor(props?: Partial<DailyCreditUsage>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    totalAmount!: bigint

    @IntColumn_({nullable: false})
    uniqueUsers!: number

    @IntColumn_({nullable: false})
    usageCount!: number

    @DateTimeColumn_({nullable: false})
    timestamp!: Date
}
