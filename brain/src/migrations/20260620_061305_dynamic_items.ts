import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
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
  ALTER TABLE "pages" DROP COLUMN "features_item1_title";
  ALTER TABLE "pages" DROP COLUMN "features_item1_text";
  ALTER TABLE "pages" DROP COLUMN "features_item2_title";
  ALTER TABLE "pages" DROP COLUMN "features_item2_text";
  ALTER TABLE "pages" DROP COLUMN "features_item3_title";
  ALTER TABLE "pages" DROP COLUMN "features_item3_text";
  ALTER TABLE "pages" DROP COLUMN "testimonials_t1_quote";
  ALTER TABLE "pages" DROP COLUMN "testimonials_t1_author";
  ALTER TABLE "pages" DROP COLUMN "testimonials_t2_quote";
  ALTER TABLE "pages" DROP COLUMN "testimonials_t2_author";
  ALTER TABLE "pages" DROP COLUMN "testimonials_t3_quote";
  ALTER TABLE "pages" DROP COLUMN "testimonials_t3_author";
  ALTER TABLE "_pages_v" DROP COLUMN "version_features_item1_title";
  ALTER TABLE "_pages_v" DROP COLUMN "version_features_item1_text";
  ALTER TABLE "_pages_v" DROP COLUMN "version_features_item2_title";
  ALTER TABLE "_pages_v" DROP COLUMN "version_features_item2_text";
  ALTER TABLE "_pages_v" DROP COLUMN "version_features_item3_title";
  ALTER TABLE "_pages_v" DROP COLUMN "version_features_item3_text";
  ALTER TABLE "_pages_v" DROP COLUMN "version_testimonials_t1_quote";
  ALTER TABLE "_pages_v" DROP COLUMN "version_testimonials_t1_author";
  ALTER TABLE "_pages_v" DROP COLUMN "version_testimonials_t2_quote";
  ALTER TABLE "_pages_v" DROP COLUMN "version_testimonials_t2_author";
  ALTER TABLE "_pages_v" DROP COLUMN "version_testimonials_t3_quote";
  ALTER TABLE "_pages_v" DROP COLUMN "version_testimonials_t3_author";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_features_items" CASCADE;
  DROP TABLE "pages_testimonials_items" CASCADE;
  DROP TABLE "_pages_v_version_features_items" CASCADE;
  DROP TABLE "_pages_v_version_testimonials_items" CASCADE;
  ALTER TABLE "pages" ADD COLUMN "features_item1_title" varchar;
  ALTER TABLE "pages" ADD COLUMN "features_item1_text" varchar;
  ALTER TABLE "pages" ADD COLUMN "features_item2_title" varchar;
  ALTER TABLE "pages" ADD COLUMN "features_item2_text" varchar;
  ALTER TABLE "pages" ADD COLUMN "features_item3_title" varchar;
  ALTER TABLE "pages" ADD COLUMN "features_item3_text" varchar;
  ALTER TABLE "pages" ADD COLUMN "testimonials_t1_quote" varchar;
  ALTER TABLE "pages" ADD COLUMN "testimonials_t1_author" varchar;
  ALTER TABLE "pages" ADD COLUMN "testimonials_t2_quote" varchar;
  ALTER TABLE "pages" ADD COLUMN "testimonials_t2_author" varchar;
  ALTER TABLE "pages" ADD COLUMN "testimonials_t3_quote" varchar;
  ALTER TABLE "pages" ADD COLUMN "testimonials_t3_author" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_features_item1_title" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_features_item1_text" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_features_item2_title" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_features_item2_text" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_features_item3_title" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_features_item3_text" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_testimonials_t1_quote" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_testimonials_t1_author" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_testimonials_t2_quote" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_testimonials_t2_author" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_testimonials_t3_quote" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_testimonials_t3_author" varchar;`)
}
