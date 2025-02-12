import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_, StringColumn as StringColumn_, BooleanColumn as BooleanColumn_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {CreditConsumption} from "./creditConsumption.model"

/**
 * Tracks marketplace-specific credit usage
 */
@Entity_()
export class MarketplaceCreditUsage {
    constructor(props?: Partial<MarketplaceCreditUsage>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @ManyToOne_(() => CreditConsumption, {nullable: true})
    creditConsumption!: CreditConsumption

    @Index_()
    @StringColumn_({nullable: false})
    assetId!: string

    @Index_()
    @StringColumn_({nullable: false})
    collectionAddress!: string

    @BooleanColumn_({nullable: false})
    isPrimarySale!: boolean

    @BigIntColumn_({nullable: false})
    price!: bigint
}
