import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ADD COLUMN "features_enabled" boolean DEFAULT false;
  ALTER TABLE "pages" ADD COLUMN "features_heading" varchar;
  ALTER TABLE "pages" ADD COLUMN "features_item1_title" varchar;
  ALTER TABLE "pages" ADD COLUMN "features_item1_text" varchar;
  ALTER TABLE "pages" ADD COLUMN "features_item2_title" varchar;
  ALTER TABLE "pages" ADD COLUMN "features_item2_text" varchar;
  ALTER TABLE "pages" ADD COLUMN "features_item3_title" varchar;
  ALTER TABLE "pages" ADD COLUMN "features_item3_text" varchar;
  ALTER TABLE "pages" ADD COLUMN "cta_enabled" boolean DEFAULT false;
  ALTER TABLE "pages" ADD COLUMN "cta_heading" varchar;
  ALTER TABLE "pages" ADD COLUMN "cta_button_label" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_features_enabled" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_features_heading" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_features_item1_title" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_features_item1_text" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_features_item2_title" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_features_item2_text" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_features_item3_title" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_features_item3_text" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_cta_enabled" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_cta_heading" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_cta_button_label" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" DROP COLUMN "features_enabled";
  ALTER TABLE "pages" DROP COLUMN "features_heading";
  ALTER TABLE "pages" DROP COLUMN "features_item1_title";
  ALTER TABLE "pages" DROP COLUMN "features_item1_text";
  ALTER TABLE "pages" DROP COLUMN "features_item2_title";
  ALTER TABLE "pages" DROP COLUMN "features_item2_text";
  ALTER TABLE "pages" DROP COLUMN "features_item3_title";
  ALTER TABLE "pages" DROP COLUMN "features_item3_text";
  ALTER TABLE "pages" DROP COLUMN "cta_enabled";
  ALTER TABLE "pages" DROP COLUMN "cta_heading";
  ALTER TABLE "pages" DROP COLUMN "cta_button_label";
  ALTER TABLE "_pages_v" DROP COLUMN "version_features_enabled";
  ALTER TABLE "_pages_v" DROP COLUMN "version_features_heading";
  ALTER TABLE "_pages_v" DROP COLUMN "version_features_item1_title";
  ALTER TABLE "_pages_v" DROP COLUMN "version_features_item1_text";
  ALTER TABLE "_pages_v" DROP COLUMN "version_features_item2_title";
  ALTER TABLE "_pages_v" DROP COLUMN "version_features_item2_text";
  ALTER TABLE "_pages_v" DROP COLUMN "version_features_item3_title";
  ALTER TABLE "_pages_v" DROP COLUMN "version_features_item3_text";
  ALTER TABLE "_pages_v" DROP COLUMN "version_cta_enabled";
  ALTER TABLE "_pages_v" DROP COLUMN "version_cta_heading";
  ALTER TABLE "_pages_v" DROP COLUMN "version_cta_button_label";`)
}
