import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, IntColumn as IntColumn_, DateTimeColumn as DateTimeColumn_} from "@subsquid/typeorm-store"

/**
 * Tracks hourly credit usage for rate limiting
 */
@Entity_()
export class HourlyCreditUsage {
    constructor(props?: Partial<HourlyCreditUsage>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    totalAmount!: bigint

    @IntColumn_({nullable: false})
    usageCount!: number

    @DateTimeColumn_({nullable: false})
    timestamp!: Date
}
