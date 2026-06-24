import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_settings_ai_provider" AS ENUM('openrouter');
  CREATE TABLE "settings_ai_models" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL
  );
  
  CREATE TABLE "settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"ai_provider" "enum_settings_ai_provider" DEFAULT 'openrouter' NOT NULL,
  	"ai_api_key_ciphertext" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "tenants" ADD COLUMN "allow_operator_edit" boolean DEFAULT false;
  ALTER TABLE "settings_ai_models" ADD CONSTRAINT "settings_ai_models_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "settings_ai_models_order_idx" ON "settings_ai_models" USING btree ("_order");
  CREATE INDEX "settings_ai_models_parent_id_idx" ON "settings_ai_models" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "settings_ai_models" CASCADE;
  DROP TABLE "settings" CASCADE;
  ALTER TABLE "tenants" DROP COLUMN "allow_operator_edit";
  DROP TYPE "public"."enum_settings_ai_provider";`)
}
