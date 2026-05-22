module.exports = class Data1779442821302 {
    name = 'Data1779442821302'

    async up(db) {
        await db.query(`ALTER TABLE "squid_router_order" ADD "beneficiary" text`)
        await db.query(`CREATE INDEX "IDX_78454b2944ab9c17d6d86c3dc6" ON "squid_router_order" ("beneficiary") `)
    }

    async down(db) {
        await db.query(`ALTER TABLE "squid_router_order" DROP COLUMN "beneficiary"`)
        await db.query(`DROP INDEX "squid_credits"."IDX_78454b2944ab9c17d6d86c3dc6"`)
    }
}
