import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Schema-layer isolation (m2-fk-constraints): no `pages` row may exist without an
 * owner. Payload leaves draft-enabled relationship columns nullable; the app layer
 * (the ChangeSet hook + the audited adapter) already guarantees both are set, so
 * promoting them to NOT NULL is safe and adds a database-enforced backstop.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "pages" ALTER COLUMN "tenant_id" SET NOT NULL;`)
  await db.execute(sql`ALTER TABLE "pages" ALTER COLUMN "change_set_id_id" SET NOT NULL;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "pages" ALTER COLUMN "tenant_id" DROP NOT NULL;`)
  await db.execute(sql`ALTER TABLE "pages" ALTER COLUMN "change_set_id_id" DROP NOT NULL;`)
}
