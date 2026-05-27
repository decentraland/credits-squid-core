module.exports = class Data1779870266674 {
    name = 'Data1779870266674'

    async up(db) {
        await db.query(`CREATE TABLE "across_order" ("id" character varying NOT NULL, "deposit_id" text NOT NULL, "credit_ids" text array NOT NULL, "total_credits_used" numeric NOT NULL, "beneficiary" text, "depositor" text NOT NULL, "recipient" text, "input_token" text, "output_token" text, "input_amount" numeric, "output_amount" numeric, "destination_chain_id" numeric, "tx_hash" text NOT NULL, "destination_tx_hash" text, "across_status" text, "block_number" integer NOT NULL, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_ee5e0b24f6bab8d5efbadafa76e" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_1d458fc40cb5438d4d1b14d72c" ON "across_order" ("deposit_id") `)
        await db.query(`CREATE INDEX "IDX_579d149944da787ec9b42ce92f" ON "across_order" ("beneficiary") `)
        await db.query(`CREATE INDEX "IDX_702eab35d610fc751dac343887" ON "across_order" ("depositor") `)
        await db.query(`CREATE INDEX "IDX_601667dc913a1e9c22836d5ece" ON "across_order" ("tx_hash") `)
        await db.query(`CREATE INDEX "IDX_64627a8e8cacc4ad122cf05546" ON "across_order" ("destination_tx_hash") `)
    }

    async down(db) {
        // DROP TABLE removes the table and all its indexes; schema-agnostic.
        await db.query(`DROP TABLE "across_order"`)
    }
}
