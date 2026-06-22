import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "connected_sites" ADD COLUMN "source_path" varchar;
  ALTER TABLE "connected_sites" ADD COLUMN "page_paths" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "connected_sites" DROP COLUMN "source_path";
  ALTER TABLE "connected_sites" DROP COLUMN "page_paths";`)
}
