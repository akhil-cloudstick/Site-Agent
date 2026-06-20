import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ADD COLUMN "previous_layout" jsonb;
  ALTER TABLE "_pages_v" ADD COLUMN "version_previous_layout" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" DROP COLUMN "previous_layout";
  ALTER TABLE "_pages_v" DROP COLUMN "version_previous_layout";`)
}
