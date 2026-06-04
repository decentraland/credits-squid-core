module.exports = class Data1780500000000 {
    name = 'Data1780500000000'

    async up(db) {
        // The MANA the executor actually spent on the swap (NAME price + bridge/gas overhead),
        // distinct from input_amount which is the bridged leg (USDC). Nullable: rows indexed
        // before this column existed keep NULL.
        await db.query(`ALTER TABLE "across_order" ADD "input_mana_amount" numeric`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "across_order" DROP COLUMN "input_mana_amount"`)
    }
}
