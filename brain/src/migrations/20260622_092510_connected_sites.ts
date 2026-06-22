import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_connected_sites_status" AS ENUM('connected', 'error');
  CREATE TABLE "connected_sites" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"origin_url" varchar NOT NULL,
  	"repo" varchar,
  	"cloudflare_project" varchar,
  	"content_path" varchar DEFAULT 'content.json',
  	"status" "enum_connected_sites_status" DEFAULT 'connected',
  	"last_error" varchar,
  	"live_url" varchar,
  	"draft_content" jsonb,
  	"published_content" jsonb,
  	"previous_content" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "connected_sites_id" integer;
  ALTER TABLE "connected_sites" ADD CONSTRAINT "connected_sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "connected_sites_tenant_idx" ON "connected_sites" USING btree ("tenant_id");
  CREATE INDEX "connected_sites_updated_at_idx" ON "connected_sites" USING btree ("updated_at");
  CREATE INDEX "connected_sites_created_at_idx" ON "connected_sites" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_connected_sites_fk" FOREIGN KEY ("connected_sites_id") REFERENCES "public"."connected_sites"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_connected_sites_id_idx" ON "payload_locked_documents_rels" USING btree ("connected_sites_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "connected_sites" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "connected_sites" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_connected_sites_fk";
  
  DROP INDEX "payload_locked_documents_rels_connected_sites_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "connected_sites_id";
  DROP TYPE "public"."enum_connected_sites_status";`)
}
