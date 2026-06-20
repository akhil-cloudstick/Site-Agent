import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_features_items" ADD COLUMN "image_id" integer;
  ALTER TABLE "pages_blocks_features" ADD COLUMN "image_id" integer;
  ALTER TABLE "pages_blocks_testimonials_items" ADD COLUMN "image_id" integer;
  ALTER TABLE "pages_blocks_testimonials" ADD COLUMN "image_id" integer;
  ALTER TABLE "pages_blocks_cta" ADD COLUMN "image_id" integer;
  ALTER TABLE "pages_blocks_contact" ADD COLUMN "image_id" integer;
  ALTER TABLE "pages_blocks_rich_text" ADD COLUMN "image_id" integer;
  ALTER TABLE "_pages_v_blocks_features_items" ADD COLUMN "image_id" integer;
  ALTER TABLE "_pages_v_blocks_features" ADD COLUMN "image_id" integer;
  ALTER TABLE "_pages_v_blocks_testimonials_items" ADD COLUMN "image_id" integer;
  ALTER TABLE "_pages_v_blocks_testimonials" ADD COLUMN "image_id" integer;
  ALTER TABLE "_pages_v_blocks_cta" ADD COLUMN "image_id" integer;
  ALTER TABLE "_pages_v_blocks_contact" ADD COLUMN "image_id" integer;
  ALTER TABLE "_pages_v_blocks_rich_text" ADD COLUMN "image_id" integer;
  ALTER TABLE "pages_blocks_features_items" ADD CONSTRAINT "pages_blocks_features_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_features" ADD CONSTRAINT "pages_blocks_features_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_testimonials_items" ADD CONSTRAINT "pages_blocks_testimonials_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_testimonials" ADD CONSTRAINT "pages_blocks_testimonials_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_cta" ADD CONSTRAINT "pages_blocks_cta_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_contact" ADD CONSTRAINT "pages_blocks_contact_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_rich_text" ADD CONSTRAINT "pages_blocks_rich_text_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_features_items" ADD CONSTRAINT "_pages_v_blocks_features_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_features" ADD CONSTRAINT "_pages_v_blocks_features_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_testimonials_items" ADD CONSTRAINT "_pages_v_blocks_testimonials_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_testimonials" ADD CONSTRAINT "_pages_v_blocks_testimonials_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_cta" ADD CONSTRAINT "_pages_v_blocks_cta_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_contact" ADD CONSTRAINT "_pages_v_blocks_contact_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_rich_text" ADD CONSTRAINT "_pages_v_blocks_rich_text_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "pages_blocks_features_items_image_idx" ON "pages_blocks_features_items" USING btree ("image_id");
  CREATE INDEX "pages_blocks_features_image_idx" ON "pages_blocks_features" USING btree ("image_id");
  CREATE INDEX "pages_blocks_testimonials_items_image_idx" ON "pages_blocks_testimonials_items" USING btree ("image_id");
  CREATE INDEX "pages_blocks_testimonials_image_idx" ON "pages_blocks_testimonials" USING btree ("image_id");
  CREATE INDEX "pages_blocks_cta_image_idx" ON "pages_blocks_cta" USING btree ("image_id");
  CREATE INDEX "pages_blocks_contact_image_idx" ON "pages_blocks_contact" USING btree ("image_id");
  CREATE INDEX "pages_blocks_rich_text_image_idx" ON "pages_blocks_rich_text" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_features_items_image_idx" ON "_pages_v_blocks_features_items" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_features_image_idx" ON "_pages_v_blocks_features" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_testimonials_items_image_idx" ON "_pages_v_blocks_testimonials_items" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_testimonials_image_idx" ON "_pages_v_blocks_testimonials" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_cta_image_idx" ON "_pages_v_blocks_cta" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_contact_image_idx" ON "_pages_v_blocks_contact" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_rich_text_image_idx" ON "_pages_v_blocks_rich_text" USING btree ("image_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_features_items" DROP CONSTRAINT "pages_blocks_features_items_image_id_media_id_fk";
  
  ALTER TABLE "pages_blocks_features" DROP CONSTRAINT "pages_blocks_features_image_id_media_id_fk";
  
  ALTER TABLE "pages_blocks_testimonials_items" DROP CONSTRAINT "pages_blocks_testimonials_items_image_id_media_id_fk";
  
  ALTER TABLE "pages_blocks_testimonials" DROP CONSTRAINT "pages_blocks_testimonials_image_id_media_id_fk";
  
  ALTER TABLE "pages_blocks_cta" DROP CONSTRAINT "pages_blocks_cta_image_id_media_id_fk";
  
  ALTER TABLE "pages_blocks_contact" DROP CONSTRAINT "pages_blocks_contact_image_id_media_id_fk";
  
  ALTER TABLE "pages_blocks_rich_text" DROP CONSTRAINT "pages_blocks_rich_text_image_id_media_id_fk";
  
  ALTER TABLE "_pages_v_blocks_features_items" DROP CONSTRAINT "_pages_v_blocks_features_items_image_id_media_id_fk";
  
  ALTER TABLE "_pages_v_blocks_features" DROP CONSTRAINT "_pages_v_blocks_features_image_id_media_id_fk";
  
  ALTER TABLE "_pages_v_blocks_testimonials_items" DROP CONSTRAINT "_pages_v_blocks_testimonials_items_image_id_media_id_fk";
  
  ALTER TABLE "_pages_v_blocks_testimonials" DROP CONSTRAINT "_pages_v_blocks_testimonials_image_id_media_id_fk";
  
  ALTER TABLE "_pages_v_blocks_cta" DROP CONSTRAINT "_pages_v_blocks_cta_image_id_media_id_fk";
  
  ALTER TABLE "_pages_v_blocks_contact" DROP CONSTRAINT "_pages_v_blocks_contact_image_id_media_id_fk";
  
  ALTER TABLE "_pages_v_blocks_rich_text" DROP CONSTRAINT "_pages_v_blocks_rich_text_image_id_media_id_fk";
  
  DROP INDEX "pages_blocks_features_items_image_idx";
  DROP INDEX "pages_blocks_features_image_idx";
  DROP INDEX "pages_blocks_testimonials_items_image_idx";
  DROP INDEX "pages_blocks_testimonials_image_idx";
  DROP INDEX "pages_blocks_cta_image_idx";
  DROP INDEX "pages_blocks_contact_image_idx";
  DROP INDEX "pages_blocks_rich_text_image_idx";
  DROP INDEX "_pages_v_blocks_features_items_image_idx";
  DROP INDEX "_pages_v_blocks_features_image_idx";
  DROP INDEX "_pages_v_blocks_testimonials_items_image_idx";
  DROP INDEX "_pages_v_blocks_testimonials_image_idx";
  DROP INDEX "_pages_v_blocks_cta_image_idx";
  DROP INDEX "_pages_v_blocks_contact_image_idx";
  DROP INDEX "_pages_v_blocks_rich_text_image_idx";
  ALTER TABLE "pages_blocks_features_items" DROP COLUMN "image_id";
  ALTER TABLE "pages_blocks_features" DROP COLUMN "image_id";
  ALTER TABLE "pages_blocks_testimonials_items" DROP COLUMN "image_id";
  ALTER TABLE "pages_blocks_testimonials" DROP COLUMN "image_id";
  ALTER TABLE "pages_blocks_cta" DROP COLUMN "image_id";
  ALTER TABLE "pages_blocks_contact" DROP COLUMN "image_id";
  ALTER TABLE "pages_blocks_rich_text" DROP COLUMN "image_id";
  ALTER TABLE "_pages_v_blocks_features_items" DROP COLUMN "image_id";
  ALTER TABLE "_pages_v_blocks_features" DROP COLUMN "image_id";
  ALTER TABLE "_pages_v_blocks_testimonials_items" DROP COLUMN "image_id";
  ALTER TABLE "_pages_v_blocks_testimonials" DROP COLUMN "image_id";
  ALTER TABLE "_pages_v_blocks_cta" DROP COLUMN "image_id";
  ALTER TABLE "_pages_v_blocks_contact" DROP COLUMN "image_id";
  ALTER TABLE "_pages_v_blocks_rich_text" DROP COLUMN "image_id";`)
}
