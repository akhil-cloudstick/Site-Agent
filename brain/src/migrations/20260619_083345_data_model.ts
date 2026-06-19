import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tenants_status" AS ENUM('provisioning', 'active', 'suspended', 'failed');
  CREATE TYPE "public"."enum_changesets_status" AS ENUM('active', 'previewing', 'publishing', 'published', 'aborted', 'deployed_pending_publish', 'failed_deploy_reverted', 'rolled_back_from_deployed_pending_publish');
  CREATE TYPE "public"."enum_changesets_kind" AS ENUM('content', 'structural');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "tenants" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"status" "enum_tenants_status" DEFAULT 'provisioning' NOT NULL,
  	"github_repo" varchar,
  	"deploy_targets" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "changesets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"status" "enum_changesets_status" DEFAULT 'active' NOT NULL,
  	"kind" "enum_changesets_kind" DEFAULT 'content' NOT NULL,
  	"git_branch" varchar,
  	"head_sha" varchar,
  	"preview_deployment_id" varchar,
  	"production_deployment_id" varchar,
  	"initiated_by_id" integer,
  	"correlation_id" varchar,
  	"published_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"change_set_id_id" integer,
  	"title" varchar,
  	"hero_heading" varchar,
  	"hero_subheading" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_change_set_id_id" integer,
  	"version_title" varchar,
  	"version_hero_heading" varchar,
  	"version_hero_subheading" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tenants_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "changesets_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "pages_id" integer;
  ALTER TABLE "changesets" ADD CONSTRAINT "changesets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "changesets" ADD CONSTRAINT "changesets_initiated_by_id_users_id_fk" FOREIGN KEY ("initiated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_change_set_id_id_changesets_id_fk" FOREIGN KEY ("change_set_id_id") REFERENCES "public"."changesets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_change_set_id_id_changesets_id_fk" FOREIGN KEY ("version_change_set_id_id") REFERENCES "public"."changesets"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "tenants_slug_idx" ON "tenants" USING btree ("slug");
  CREATE INDEX "tenants_updated_at_idx" ON "tenants" USING btree ("updated_at");
  CREATE INDEX "tenants_created_at_idx" ON "tenants" USING btree ("created_at");
  CREATE INDEX "changesets_tenant_idx" ON "changesets" USING btree ("tenant_id");
  CREATE INDEX "changesets_status_idx" ON "changesets" USING btree ("status");
  CREATE INDEX "changesets_initiated_by_idx" ON "changesets" USING btree ("initiated_by_id");
  CREATE INDEX "changesets_correlation_id_idx" ON "changesets" USING btree ("correlation_id");
  CREATE INDEX "changesets_updated_at_idx" ON "changesets" USING btree ("updated_at");
  CREATE INDEX "changesets_created_at_idx" ON "changesets" USING btree ("created_at");
  CREATE INDEX "pages_tenant_idx" ON "pages" USING btree ("tenant_id");
  CREATE INDEX "pages_change_set_id_idx" ON "pages" USING btree ("change_set_id_id");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "pages" USING btree ("_status");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_tenant_idx" ON "_pages_v" USING btree ("version_tenant_id");
  CREATE INDEX "_pages_v_version_version_change_set_id_idx" ON "_pages_v" USING btree ("version_change_set_id_id");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_latest_idx" ON "_pages_v" USING btree ("latest");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tenants_fk" FOREIGN KEY ("tenants_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_changesets_fk" FOREIGN KEY ("changesets_id") REFERENCES "public"."changesets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_tenants_id_idx" ON "payload_locked_documents_rels" USING btree ("tenants_id");
  CREATE INDEX "payload_locked_documents_rels_changesets_id_idx" ON "payload_locked_documents_rels" USING btree ("changesets_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");`)

  // --- Hand-added (Payload can't express partial unique indexes) ---
  // The one-active-ChangeSet-per-Site invariant as a DB GUARANTEE (Codex R1 #1 / R2,
  // DB-Architecture.md). siteId == tenant in v1, so the index is on tenant_id. The
  // predicate MUST equal BLOCKING_STATUSES in src/lib/changeset/status.ts — a unit
  // test asserts they agree, and the migration is the single SQL source.
  await db.execute(sql`
   CREATE UNIQUE INDEX "one_blocking_changeset_per_tenant"
     ON "changesets" USING btree ("tenant_id")
     WHERE "status" IN ('active','previewing','publishing','deployed_pending_publish');`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "one_blocking_changeset_per_tenant";
  ALTER TABLE "tenants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "changesets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "tenants" CASCADE;
  DROP TABLE "changesets" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tenants_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_changesets_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_pages_fk";
  
  DROP INDEX "payload_locked_documents_rels_tenants_id_idx";
  DROP INDEX "payload_locked_documents_rels_changesets_id_idx";
  DROP INDEX "payload_locked_documents_rels_pages_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tenants_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "changesets_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "pages_id";
  DROP TYPE "public"."enum_tenants_status";
  DROP TYPE "public"."enum_changesets_status";
  DROP TYPE "public"."enum_changesets_kind";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum__pages_v_version_status";`)
}
