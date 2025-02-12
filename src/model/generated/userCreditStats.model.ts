import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, BigIntColumn as BigIntColumn_, DateTimeColumn as DateTimeColumn_, OneToMany as OneToMany_} from "@subsquid/typeorm-store"
import {CreditConsumption} from "./creditConsumption.model"

/**
 * Tracks aggregated credit usage per user
 */
@Entity_()
export class UserCreditStats {
    constructor(props?: Partial<UserCreditStats>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @StringColumn_({nullable: false})
    address!: string

    @BigIntColumn_({nullable: false})
    totalCreditsConsumed!: bigint

    @DateTimeColumn_({nullable: true})
    lastCreditUsage!: Date | undefined | null

    @OneToMany_(() => CreditConsumption, e => e.beneficiary)
    consumptions!: CreditConsumption[]
}
