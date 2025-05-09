module.exports = class Data1746794180946 {
    name = 'Data1746794180946'

    async up(db) {
        await db.query(`CREATE TABLE "user_credit_stats" ("id" character varying NOT NULL, "address" text NOT NULL, "total_credits_consumed" numeric NOT NULL, "last_credit_usage" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_bcad8f413f718359398e798c9ae" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_766ea4ab6ae127b6b9d7f7b6c4" ON "user_credit_stats" ("address") `)
        await db.query(`CREATE TABLE "credit_consumption" ("id" character varying NOT NULL, "credit_id" text NOT NULL, "contract" text NOT NULL, "amount" numeric NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "block" integer NOT NULL, "tx_hash" text NOT NULL, "beneficiary_id" character varying, CONSTRAINT "PK_e6419ee754be1f85ef1bdf3303b" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_f70643cdcb5d34c397f5400cc3" ON "credit_consumption" ("credit_id") `)
        await db.query(`CREATE INDEX "IDX_aeda08f9257733a47ae7a8407d" ON "credit_consumption" ("beneficiary_id") `)
        await db.query(`CREATE INDEX "IDX_d3b724c7a5d9b9f19af5c596cf" ON "credit_consumption" ("contract") `)
        await db.query(`CREATE INDEX "IDX_ee0233b512bc1e86f6276fecf8" ON "credit_consumption" ("tx_hash") `)
        await db.query(`CREATE TABLE "mana_transaction" ("id" character varying NOT NULL, "tx_hash" text NOT NULL, "from_address" text NOT NULL, "to_address" text NOT NULL, "total_mana_amount" numeric NOT NULL, "credit_amount" numeric, "user_paid_amount" numeric, "dao_fee_amount" numeric, "related_consumption_ids" text array, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "block" integer NOT NULL, CONSTRAINT "PK_267a908dd35f05c17a281fb2341" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_925948d142bce0efe8c4100ca0" ON "mana_transaction" ("tx_hash") `)
        await db.query(`CREATE INDEX "IDX_3d761c1f4ed5f31f8786ec7419" ON "mana_transaction" ("from_address") `)
        await db.query(`CREATE INDEX "IDX_3ce3cd15a6b59c67e6e7f6cd90" ON "mana_transaction" ("to_address") `)
        await db.query(`CREATE TABLE "hourly_credit_usage" ("id" character varying NOT NULL, "total_amount" numeric NOT NULL, "usage_count" integer NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_2dd4c7d6b79896f6b908280d2fc" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "daily_credit_usage" ("id" character varying NOT NULL, "total_amount" numeric NOT NULL, "unique_users" integer NOT NULL, "usage_count" integer NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_b69b3f47600e3870274969ebbb9" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "marketplace_credit_usage" ("id" character varying NOT NULL, "asset_id" text NOT NULL, "collection_address" text NOT NULL, "is_primary_sale" boolean NOT NULL, "price" numeric NOT NULL, "credit_consumption_id" character varying, CONSTRAINT "PK_24836a8c692bee0433f8fb8b36a" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_e5647789223aecfbf3780e1581" ON "marketplace_credit_usage" ("credit_consumption_id") `)
        await db.query(`CREATE INDEX "IDX_89057e613d380ae4177118da0f" ON "marketplace_credit_usage" ("asset_id") `)
        await db.query(`CREATE INDEX "IDX_3c0a44b2eafee0a08e3e6f4deb" ON "marketplace_credit_usage" ("collection_address") `)
        await db.query(`ALTER TABLE "credit_consumption" ADD CONSTRAINT "FK_aeda08f9257733a47ae7a8407d7" FOREIGN KEY ("beneficiary_id") REFERENCES "user_credit_stats"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
        await db.query(`ALTER TABLE "marketplace_credit_usage" ADD CONSTRAINT "FK_e5647789223aecfbf3780e1581e" FOREIGN KEY ("credit_consumption_id") REFERENCES "credit_consumption"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
    }

    async down(db) {
        await db.query(`DROP TABLE "user_credit_stats"`)
        await db.query(`DROP INDEX "public"."IDX_766ea4ab6ae127b6b9d7f7b6c4"`)
        await db.query(`DROP TABLE "credit_consumption"`)
        await db.query(`DROP INDEX "public"."IDX_f70643cdcb5d34c397f5400cc3"`)
        await db.query(`DROP INDEX "public"."IDX_aeda08f9257733a47ae7a8407d"`)
        await db.query(`DROP INDEX "public"."IDX_d3b724c7a5d9b9f19af5c596cf"`)
        await db.query(`DROP INDEX "public"."IDX_ee0233b512bc1e86f6276fecf8"`)
        await db.query(`DROP TABLE "mana_transaction"`)
        await db.query(`DROP INDEX "public"."IDX_925948d142bce0efe8c4100ca0"`)
        await db.query(`DROP INDEX "public"."IDX_3d761c1f4ed5f31f8786ec7419"`)
        await db.query(`DROP INDEX "public"."IDX_3ce3cd15a6b59c67e6e7f6cd90"`)
        await db.query(`DROP TABLE "hourly_credit_usage"`)
        await db.query(`DROP TABLE "daily_credit_usage"`)
        await db.query(`DROP TABLE "marketplace_credit_usage"`)
        await db.query(`DROP INDEX "public"."IDX_e5647789223aecfbf3780e1581"`)
        await db.query(`DROP INDEX "public"."IDX_89057e613d380ae4177118da0f"`)
        await db.query(`DROP INDEX "public"."IDX_3c0a44b2eafee0a08e3e6f4deb"`)
        await db.query(`ALTER TABLE "credit_consumption" DROP CONSTRAINT "FK_aeda08f9257733a47ae7a8407d7"`)
        await db.query(`ALTER TABLE "marketplace_credit_usage" DROP CONSTRAINT "FK_e5647789223aecfbf3780e1581e"`)
    }
}
