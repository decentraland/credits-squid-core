module.exports = class Data1765974029214 {
    name = 'Data1765974029214'

    async up(db) {
        await db.query(`ALTER TABLE "squid_router_order" ADD "destination_tx_hash" text`)
        await db.query(`ALTER TABLE "squid_router_order" ADD "squid_status" text`)
        await db.query(`CREATE INDEX "IDX_477ba96cefa7a213537c50be8d" ON "squid_router_order" ("destination_tx_hash") `)
    }

    async down(db) {
        await db.query(`ALTER TABLE "squid_router_order" DROP COLUMN "destination_tx_hash"`)
        await db.query(`ALTER TABLE "squid_router_order" DROP COLUMN "squid_status"`)
        await db.query(`DROP INDEX "squid_credits"."IDX_477ba96cefa7a213537c50be8d"`)
    }
}
