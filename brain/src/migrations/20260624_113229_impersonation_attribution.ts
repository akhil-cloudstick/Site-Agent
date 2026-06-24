import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "changesets" ADD COLUMN "impersonated_by_id" integer;
  ALTER TABLE "changesets" ADD CONSTRAINT "changesets_impersonated_by_id_users_id_fk" FOREIGN KEY ("impersonated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "changesets_impersonated_by_idx" ON "changesets" USING btree ("impersonated_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "changesets" DROP CONSTRAINT "changesets_impersonated_by_id_users_id_fk";
  
  DROP INDEX "changesets_impersonated_by_idx";
  ALTER TABLE "changesets" DROP COLUMN "impersonated_by_id";`)
}
