import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_theme_font" AS ENUM('sans', 'serif');
  CREATE TYPE "public"."enum__pages_v_version_theme_font" AS ENUM('sans', 'serif');
  ALTER TABLE "pages" ADD COLUMN "testimonials_enabled" boolean DEFAULT false;
  ALTER TABLE "pages" ADD COLUMN "testimonials_heading" varchar;
  ALTER TABLE "pages" ADD COLUMN "testimonials_t1_quote" varchar;
  ALTER TABLE "pages" ADD COLUMN "testimonials_t1_author" varchar;
  ALTER TABLE "pages" ADD COLUMN "testimonials_t2_quote" varchar;
  ALTER TABLE "pages" ADD COLUMN "testimonials_t2_author" varchar;
  ALTER TABLE "pages" ADD COLUMN "testimonials_t3_quote" varchar;
  ALTER TABLE "pages" ADD COLUMN "testimonials_t3_author" varchar;
  ALTER TABLE "pages" ADD COLUMN "contact_enabled" boolean DEFAULT false;
  ALTER TABLE "pages" ADD COLUMN "contact_heading" varchar;
  ALTER TABLE "pages" ADD COLUMN "contact_text" varchar;
  ALTER TABLE "pages" ADD COLUMN "contact_button_label" varchar;
  ALTER TABLE "pages" ADD COLUMN "theme_primary_color" varchar;
  ALTER TABLE "pages" ADD COLUMN "theme_font" "enum_pages_theme_font" DEFAULT 'sans';
  ALTER TABLE "_pages_v" ADD COLUMN "version_testimonials_enabled" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_testimonials_heading" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_testimonials_t1_quote" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_testimonials_t1_author" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_testimonials_t2_quote" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_testimonials_t2_author" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_testimonials_t3_quote" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_testimonials_t3_author" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_contact_enabled" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_contact_heading" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_contact_text" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_contact_button_label" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_theme_primary_color" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_theme_font" "enum__pages_v_version_theme_font" DEFAULT 'sans';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" DROP COLUMN "testimonials_enabled";
  ALTER TABLE "pages" DROP COLUMN "testimonials_heading";
  ALTER TABLE "pages" DROP COLUMN "testimonials_t1_quote";
  ALTER TABLE "pages" DROP COLUMN "testimonials_t1_author";
  ALTER TABLE "pages" DROP COLUMN "testimonials_t2_quote";
  ALTER TABLE "pages" DROP COLUMN "testimonials_t2_author";
  ALTER TABLE "pages" DROP COLUMN "testimonials_t3_quote";
  ALTER TABLE "pages" DROP COLUMN "testimonials_t3_author";
  ALTER TABLE "pages" DROP COLUMN "contact_enabled";
  ALTER TABLE "pages" DROP COLUMN "contact_heading";
  ALTER TABLE "pages" DROP COLUMN "contact_text";
  ALTER TABLE "pages" DROP COLUMN "contact_button_label";
  ALTER TABLE "pages" DROP COLUMN "theme_primary_color";
  ALTER TABLE "pages" DROP COLUMN "theme_font";
  ALTER TABLE "_pages_v" DROP COLUMN "version_testimonials_enabled";
  ALTER TABLE "_pages_v" DROP COLUMN "version_testimonials_heading";
  ALTER TABLE "_pages_v" DROP COLUMN "version_testimonials_t1_quote";
  ALTER TABLE "_pages_v" DROP COLUMN "version_testimonials_t1_author";
  ALTER TABLE "_pages_v" DROP COLUMN "version_testimonials_t2_quote";
  ALTER TABLE "_pages_v" DROP COLUMN "version_testimonials_t2_author";
  ALTER TABLE "_pages_v" DROP COLUMN "version_testimonials_t3_quote";
  ALTER TABLE "_pages_v" DROP COLUMN "version_testimonials_t3_author";
  ALTER TABLE "_pages_v" DROP COLUMN "version_contact_enabled";
  ALTER TABLE "_pages_v" DROP COLUMN "version_contact_heading";
  ALTER TABLE "_pages_v" DROP COLUMN "version_contact_text";
  ALTER TABLE "_pages_v" DROP COLUMN "version_contact_button_label";
  ALTER TABLE "_pages_v" DROP COLUMN "version_theme_primary_color";
  ALTER TABLE "_pages_v" DROP COLUMN "version_theme_font";
  DROP TYPE "public"."enum_pages_theme_font";
  DROP TYPE "public"."enum__pages_v_version_theme_font";`)
}
