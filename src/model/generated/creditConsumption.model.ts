import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, StringColumn as StringColumn_, BigIntColumn as BigIntColumn_, DateTimeColumn as DateTimeColumn_, IntColumn as IntColumn_} from "@subsquid/typeorm-store"
import {UserCreditStats} from "./userCreditStats.model"

/**
 * Represents a credit consumption event on-chain
 */
@Entity_()
export class CreditConsumption {
    constructor(props?: Partial<CreditConsumption>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @ManyToOne_(() => UserCreditStats, {nullable: true})
    beneficiary!: UserCreditStats

    @Index_()
    @StringColumn_({nullable: false})
    contract!: string

    @BigIntColumn_({nullable: false})
    amount!: bigint

    @DateTimeColumn_({nullable: false})
    timestamp!: Date

    @IntColumn_({nullable: false})
    block!: number

    @Index_()
    @StringColumn_({nullable: false})
    txHash!: string
}
