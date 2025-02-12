module.exports = class Data1691424065505 {
    name = 'Data1691424065505'

    async up(db) {
        // Create UserCreditStats table first since it's referenced by CreditConsumption
        await db.query(`CREATE TABLE "user_credit_stats" (
            "id" character varying NOT NULL,
            "address" text NOT NULL,
            "total_credits_consumed" numeric NOT NULL,
            "last_credit_usage" TIMESTAMP WITH TIME ZONE,
            CONSTRAINT "PK_user_credit_stats" PRIMARY KEY ("id")
        )`)
        await db.query(`CREATE INDEX "IDX_user_credit_stats_address" ON "user_credit_stats" ("address")`)

        // Create CreditConsumption table
        await db.query(`CREATE TABLE "credit_consumption" (
            "id" character varying NOT NULL,
            "credit_id" text NOT NULL,
            "beneficiary_id" character varying NOT NULL,
            "amount" numeric NOT NULL,
            "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
            "block" integer NOT NULL,
            "tx_hash" text NOT NULL,
            CONSTRAINT "PK_credit_consumption" PRIMARY KEY ("id"),
            CONSTRAINT "FK_credit_consumption_beneficiary" FOREIGN KEY ("beneficiary_id") REFERENCES "user_credit_stats" ("id")
        )`)
        await db.query(`CREATE INDEX "IDX_credit_consumption_credit_id" ON "credit_consumption" ("credit_id")`)
        await db.query(`CREATE INDEX "IDX_credit_consumption_tx_hash" ON "credit_consumption" ("tx_hash")`)

        // Create HourlyCreditUsage table
        await db.query(`CREATE TABLE "hourly_credit_usage" (
            "id" character varying NOT NULL,
            "total_amount" numeric NOT NULL,
            "usage_count" integer NOT NULL,
            "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
            CONSTRAINT "PK_hourly_credit_usage" PRIMARY KEY ("id")
        )`)

        // Create DailyCreditUsage table
        await db.query(`CREATE TABLE "daily_credit_usage" (
            "id" character varying NOT NULL,
            "total_amount" numeric NOT NULL,
            "unique_users" integer NOT NULL,
            "usage_count" integer NOT NULL,
            "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
            CONSTRAINT "PK_daily_credit_usage" PRIMARY KEY ("id")
        )`)

        // Create MarketplaceCreditUsage table
        await db.query(`CREATE TABLE "marketplace_credit_usage" (
            "id" character varying NOT NULL,
            "credit_consumption_id" character varying NOT NULL,
            "asset_id" text NOT NULL,
            "collection_address" text NOT NULL,
            "is_primary_sale" boolean NOT NULL,
            "price" numeric NOT NULL,
            CONSTRAINT "PK_marketplace_credit_usage" PRIMARY KEY ("id"),
            CONSTRAINT "FK_marketplace_credit_usage_consumption" FOREIGN KEY ("credit_consumption_id") REFERENCES "credit_consumption" ("id")
        )`)
        await db.query(`CREATE INDEX "IDX_marketplace_credit_usage_asset" ON "marketplace_credit_usage" ("asset_id")`)
        await db.query(`CREATE INDEX "IDX_marketplace_credit_usage_collection" ON "marketplace_credit_usage" ("collection_address")`)
    }

    async down(db) {
        await db.query(`DROP TABLE "marketplace_credit_usage"`)
        await db.query(`DROP TABLE "daily_credit_usage"`)
        await db.query(`DROP TABLE "hourly_credit_usage"`)
        await db.query(`DROP TABLE "credit_consumption"`)
        await db.query(`DROP TABLE "user_credit_stats"`)
        await db.query(`DROP INDEX "IDX_marketplace_credit_usage_asset"`)
        await db.query(`DROP INDEX "IDX_marketplace_credit_usage_collection"`)
        await db.query(`DROP INDEX "IDX_credit_consumption_credit_id"`)
        await db.query(`DROP INDEX "IDX_credit_consumption_tx_hash"`)
        await db.query(`DROP INDEX "IDX_user_credit_stats_address"`)
    }
}
