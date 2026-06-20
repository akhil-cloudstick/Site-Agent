import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_products_items" ADD COLUMN "description" varchar;
  ALTER TABLE "_pages_v_blocks_products_items" ADD COLUMN "description" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_products_items" DROP COLUMN "description";
  ALTER TABLE "_pages_v_blocks_products_items" DROP COLUMN "description";`)
}
