import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "model_usage" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"model" varchar NOT NULL,
  	"calls" numeric DEFAULT 0,
  	"fails" numeric DEFAULT 0,
  	"prompt_tokens" numeric DEFAULT 0,
  	"completion_tokens" numeric DEFAULT 0,
  	"last_used_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "error_logs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"action" varchar NOT NULL,
  	"message" varchar NOT NULL,
  	"detail" varchar,
  	"site_id" numeric,
  	"user_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "tenants" ADD COLUMN "plan_label" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "model_usage_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "error_logs_id" integer;
  ALTER TABLE "error_logs" ADD CONSTRAINT "error_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "model_usage_model_idx" ON "model_usage" USING btree ("model");
  CREATE INDEX "model_usage_updated_at_idx" ON "model_usage" USING btree ("updated_at");
  CREATE INDEX "model_usage_created_at_idx" ON "model_usage" USING btree ("created_at");
  CREATE INDEX "error_logs_tenant_idx" ON "error_logs" USING btree ("tenant_id");
  CREATE INDEX "error_logs_action_idx" ON "error_logs" USING btree ("action");
  CREATE INDEX "error_logs_updated_at_idx" ON "error_logs" USING btree ("updated_at");
  CREATE INDEX "error_logs_created_at_idx" ON "error_logs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_model_usage_fk" FOREIGN KEY ("model_usage_id") REFERENCES "public"."model_usage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_error_logs_fk" FOREIGN KEY ("error_logs_id") REFERENCES "public"."error_logs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_model_usage_id_idx" ON "payload_locked_documents_rels" USING btree ("model_usage_id");
  CREATE INDEX "payload_locked_documents_rels_error_logs_id_idx" ON "payload_locked_documents_rels" USING btree ("error_logs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "model_usage" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "error_logs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "model_usage" CASCADE;
  DROP TABLE "error_logs" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_model_usage_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_error_logs_fk";
  
  DROP INDEX "payload_locked_documents_rels_model_usage_id_idx";
  DROP INDEX "payload_locked_documents_rels_error_logs_id_idx";
  ALTER TABLE "tenants" DROP COLUMN "plan_label";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "model_usage_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "error_logs_id";`)
}
