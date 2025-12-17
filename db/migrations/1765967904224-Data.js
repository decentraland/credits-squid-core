module.exports = class Data1765967904224 {
    name = 'Data1765967904224'

    async up(db) {
        await db.query(`CREATE TABLE "squid_router_order" ("id" character varying NOT NULL, "order_hash" text NOT NULL, "credit_ids" text array NOT NULL, "total_credits_used" numeric NOT NULL, "from_address" text NOT NULL, "to_address" text NOT NULL, "filler" text, "from_token" text, "to_token" text, "from_amount" numeric, "fill_amount" numeric, "fee_rate" numeric, "from_chain" numeric, "to_chain" numeric, "tx_hash" text NOT NULL, "block_number" integer NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_b750445f519fd23b35a6abf828a" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_f622e8f132266b5ab66f0f6498" ON "squid_router_order" ("order_hash") `)
        await db.query(`CREATE INDEX "IDX_3e87a3bba50564444682a1b95c" ON "squid_router_order" ("from_address") `)
        await db.query(`CREATE INDEX "IDX_421047c101ec68de7612fc5634" ON "squid_router_order" ("to_address") `)
        await db.query(`CREATE INDEX "IDX_0046ed367224a12681308e3d74" ON "squid_router_order" ("tx_hash") `)
        await db.query(`ALTER TABLE "credit_consumption" ADD "order_hash" text`)
        await db.query(`CREATE INDEX "IDX_8d6f918a02dfa8842212c3d678" ON "credit_consumption" ("order_hash") `)
    }

    async down(db) {
        await db.query(`DROP TABLE "squid_router_order"`)
        await db.query(`DROP INDEX "squid_credits"."IDX_f622e8f132266b5ab66f0f6498"`)
        await db.query(`DROP INDEX "squid_credits"."IDX_3e87a3bba50564444682a1b95c"`)
        await db.query(`DROP INDEX "squid_credits"."IDX_421047c101ec68de7612fc5634"`)
        await db.query(`DROP INDEX "squid_credits"."IDX_0046ed367224a12681308e3d74"`)
        await db.query(`ALTER TABLE "credit_consumption" DROP COLUMN "order_hash"`)
        await db.query(`DROP INDEX "squid_credits"."IDX_8d6f918a02dfa8842212c3d678"`)
    }
}
