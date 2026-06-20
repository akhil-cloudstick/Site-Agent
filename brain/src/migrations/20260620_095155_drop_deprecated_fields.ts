import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_features_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_testimonials_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_version_features_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_version_testimonials_items" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "pages_features_items" CASCADE;
  DROP TABLE "pages_testimonials_items" CASCADE;
  DROP TABLE "_pages_v_version_features_items" CASCADE;
  DROP TABLE "_pages_v_version_testimonials_items" CASCADE;
  ALTER TABLE "pages" DROP CONSTRAINT "pages_hero_image_id_media_id_fk";
  
  ALTER TABLE "_pages_v" DROP CONSTRAINT "_pages_v_version_hero_image_id_media_id_fk";
  
  DROP INDEX "pages_hero_hero_image_idx";
  DROP INDEX "_pages_v_version_hero_version_hero_image_idx";
  ALTER TABLE "pages" DROP COLUMN "hero_heading";
  ALTER TABLE "pages" DROP COLUMN "hero_subheading";
  ALTER TABLE "pages" DROP COLUMN "hero_image_id";
  ALTER TABLE "pages" DROP COLUMN "features_enabled";
  ALTER TABLE "pages" DROP COLUMN "features_heading";
  ALTER TABLE "pages" DROP COLUMN "cta_enabled";
  ALTER TABLE "pages" DROP COLUMN "cta_heading";
  ALTER TABLE "pages" DROP COLUMN "cta_button_label";
  ALTER TABLE "pages" DROP COLUMN "testimonials_enabled";
  ALTER TABLE "pages" DROP COLUMN "testimonials_heading";
  ALTER TABLE "pages" DROP COLUMN "contact_enabled";
  ALTER TABLE "pages" DROP COLUMN "contact_heading";
  ALTER TABLE "pages" DROP COLUMN "contact_text";
  ALTER TABLE "pages" DROP COLUMN "contact_button_label";
  ALTER TABLE "_pages_v" DROP COLUMN "version_hero_heading";
  ALTER TABLE "_pages_v" DROP COLUMN "version_hero_subheading";
  ALTER TABLE "_pages_v" DROP COLUMN "version_hero_image_id";
  ALTER TABLE "_pages_v" DROP COLUMN "version_features_enabled";
  ALTER TABLE "_pages_v" DROP COLUMN "version_features_heading";
  ALTER TABLE "_pages_v" DROP COLUMN "version_cta_enabled";
  ALTER TABLE "_pages_v" DROP COLUMN "version_cta_heading";
  ALTER TABLE "_pages_v" DROP COLUMN "version_cta_button_label";
  ALTER TABLE "_pages_v" DROP COLUMN "version_testimonials_enabled";
  ALTER TABLE "_pages_v" DROP COLUMN "version_testimonials_heading";
  ALTER TABLE "_pages_v" DROP COLUMN "version_contact_enabled";
  ALTER TABLE "_pages_v" DROP COLUMN "version_contact_heading";
  ALTER TABLE "_pages_v" DROP COLUMN "version_contact_text";
  ALTER TABLE "_pages_v" DROP COLUMN "version_contact_button_label";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "pages_features_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar
  );
  
  CREATE TABLE "pages_testimonials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"quote" varchar,
  	"author" varchar
  );
  
  CREATE TABLE "_pages_v_version_features_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_version_testimonials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"quote" varchar,
  	"author" varchar,
  	"_uuid" varchar
  );
  
  ALTER TABLE "pages" ADD COLUMN "hero_heading" varchar;
  ALTER TABLE "pages" ADD COLUMN "hero_subheading" varchar;
  ALTER TABLE "pages" ADD COLUMN "hero_image_id" integer;
  ALTER TABLE "pages" ADD COLUMN "features_enabled" boolean DEFAULT false;
  ALTER TABLE "pages" ADD COLUMN "features_heading" varchar;
  ALTER TABLE "pages" ADD COLUMN "cta_enabled" boolean DEFAULT false;
  ALTER TABLE "pages" ADD COLUMN "cta_heading" varchar;
  ALTER TABLE "pages" ADD COLUMN "cta_button_label" varchar;
  ALTER TABLE "pages" ADD COLUMN "testimonials_enabled" boolean DEFAULT false;
  ALTER TABLE "pages" ADD COLUMN "testimonials_heading" varchar;
  ALTER TABLE "pages" ADD COLUMN "contact_enabled" boolean DEFAULT false;
  ALTER TABLE "pages" ADD COLUMN "contact_heading" varchar;
  ALTER TABLE "pages" ADD COLUMN "contact_text" varchar;
  ALTER TABLE "pages" ADD COLUMN "contact_button_label" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_hero_heading" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_hero_subheading" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_hero_image_id" integer;
  ALTER TABLE "_pages_v" ADD COLUMN "version_features_enabled" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_features_heading" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_cta_enabled" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_cta_heading" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_cta_button_label" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_testimonials_enabled" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_testimonials_heading" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_contact_enabled" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_contact_heading" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_contact_text" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_contact_button_label" varchar;
  ALTER TABLE "pages_features_items" ADD CONSTRAINT "pages_features_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_testimonials_items" ADD CONSTRAINT "pages_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_version_features_items" ADD CONSTRAINT "_pages_v_version_features_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_version_testimonials_items" ADD CONSTRAINT "_pages_v_version_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_features_items_order_idx" ON "pages_features_items" USING btree ("_order");
  CREATE INDEX "pages_features_items_parent_id_idx" ON "pages_features_items" USING btree ("_parent_id");
  CREATE INDEX "pages_testimonials_items_order_idx" ON "pages_testimonials_items" USING btree ("_order");
  CREATE INDEX "pages_testimonials_items_parent_id_idx" ON "pages_testimonials_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_version_features_items_order_idx" ON "_pages_v_version_features_items" USING btree ("_order");
  CREATE INDEX "_pages_v_version_features_items_parent_id_idx" ON "_pages_v_version_features_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_version_testimonials_items_order_idx" ON "_pages_v_version_testimonials_items" USING btree ("_order");
  CREATE INDEX "_pages_v_version_testimonials_items_parent_id_idx" ON "_pages_v_version_testimonials_items" USING btree ("_parent_id");
  ALTER TABLE "pages" ADD CONSTRAINT "pages_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_hero_image_id_media_id_fk" FOREIGN KEY ("version_hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "pages_hero_hero_image_idx" ON "pages" USING btree ("hero_image_id");
  CREATE INDEX "_pages_v_version_hero_version_hero_image_idx" ON "_pages_v" USING btree ("version_hero_image_id");`)
}
