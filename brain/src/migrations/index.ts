import * as migration_20260409_155734_initial from './20260409_155734_initial';
import * as migration_20260619_083345_data_model from './20260619_083345_data_model';
import * as migration_20260619_090537_multi_tenant from './20260619_090537_multi_tenant';
import * as migration_20260619_102526_service_principal from './20260619_102526_service_principal';
import * as migration_20260619_133106_images from './20260619_133106_images';
import * as migration_20260620_044351_sections from './20260620_044351_sections';
import * as migration_20260620_054101_more_sections from './20260620_054101_more_sections';
import * as migration_20260620_061305_dynamic_items from './20260620_061305_dynamic_items';
import * as migration_20260620_062300_blocks_layout from './20260620_062300_blocks_layout';
import * as migration_20260620_070827_multipage_fields from './20260620_070827_multipage_fields';
import * as migration_20260620_084419_section_images from './20260620_084419_section_images';
import * as migration_20260620_094447_previous_layout from './20260620_094447_previous_layout';
import * as migration_20260620_095155_drop_deprecated_fields from './20260620_095155_drop_deprecated_fields';
import * as migration_20260620_111740_products_block from './20260620_111740_products_block';
import * as migration_20260620_114403_product_description from './20260620_114403_product_description';
import * as migration_20260620_120000_pages_not_null from './20260620_120000_pages_not_null';
import * as migration_20260620_130004_tenant_live_url from './20260620_130004_tenant_live_url';
import * as migration_20260622_092510_connected_sites from './20260622_092510_connected_sites';
import * as migration_20260622_094940_connected_source_html from './20260622_094940_connected_source_html';
import * as migration_20260622_114414_connected_whole_site from './20260622_114414_connected_whole_site';
import * as migration_20260622_153507_connected_undo_stack from './20260622_153507_connected_undo_stack';
import * as migration_20260623_101221_jobs from './20260623_101221_jobs';

export const migrations = [
  {
    up: migration_20260409_155734_initial.up,
    down: migration_20260409_155734_initial.down,
    name: '20260409_155734_initial',
  },
  {
    up: migration_20260619_083345_data_model.up,
    down: migration_20260619_083345_data_model.down,
    name: '20260619_083345_data_model',
  },
  {
    up: migration_20260619_090537_multi_tenant.up,
    down: migration_20260619_090537_multi_tenant.down,
    name: '20260619_090537_multi_tenant',
  },
  {
    up: migration_20260619_102526_service_principal.up,
    down: migration_20260619_102526_service_principal.down,
    name: '20260619_102526_service_principal',
  },
  {
    up: migration_20260619_133106_images.up,
    down: migration_20260619_133106_images.down,
    name: '20260619_133106_images',
  },
  {
    up: migration_20260620_044351_sections.up,
    down: migration_20260620_044351_sections.down,
    name: '20260620_044351_sections',
  },
  {
    up: migration_20260620_054101_more_sections.up,
    down: migration_20260620_054101_more_sections.down,
    name: '20260620_054101_more_sections',
  },
  {
    up: migration_20260620_061305_dynamic_items.up,
    down: migration_20260620_061305_dynamic_items.down,
    name: '20260620_061305_dynamic_items',
  },
  {
    up: migration_20260620_062300_blocks_layout.up,
    down: migration_20260620_062300_blocks_layout.down,
    name: '20260620_062300_blocks_layout',
  },
  {
    up: migration_20260620_070827_multipage_fields.up,
    down: migration_20260620_070827_multipage_fields.down,
    name: '20260620_070827_multipage_fields',
  },
  {
    up: migration_20260620_084419_section_images.up,
    down: migration_20260620_084419_section_images.down,
    name: '20260620_084419_section_images',
  },
  {
    up: migration_20260620_094447_previous_layout.up,
    down: migration_20260620_094447_previous_layout.down,
    name: '20260620_094447_previous_layout',
  },
  {
    up: migration_20260620_095155_drop_deprecated_fields.up,
    down: migration_20260620_095155_drop_deprecated_fields.down,
    name: '20260620_095155_drop_deprecated_fields',
  },
  {
    up: migration_20260620_111740_products_block.up,
    down: migration_20260620_111740_products_block.down,
    name: '20260620_111740_products_block',
  },
  {
    up: migration_20260620_114403_product_description.up,
    down: migration_20260620_114403_product_description.down,
    name: '20260620_114403_product_description',
  },
  {
    up: migration_20260620_120000_pages_not_null.up,
    down: migration_20260620_120000_pages_not_null.down,
    name: '20260620_120000_pages_not_null',
  },
  {
    up: migration_20260620_130004_tenant_live_url.up,
    down: migration_20260620_130004_tenant_live_url.down,
    name: '20260620_130004_tenant_live_url',
  },
  {
    up: migration_20260622_092510_connected_sites.up,
    down: migration_20260622_092510_connected_sites.down,
    name: '20260622_092510_connected_sites',
  },
  {
    up: migration_20260622_094940_connected_source_html.up,
    down: migration_20260622_094940_connected_source_html.down,
    name: '20260622_094940_connected_source_html',
  },
  {
    up: migration_20260622_114414_connected_whole_site.up,
    down: migration_20260622_114414_connected_whole_site.down,
    name: '20260622_114414_connected_whole_site',
  },
  {
    up: migration_20260622_153507_connected_undo_stack.up,
    down: migration_20260622_153507_connected_undo_stack.down,
    name: '20260622_153507_connected_undo_stack',
  },
  {
    up: migration_20260623_101221_jobs.up,
    down: migration_20260623_101221_jobs.down,
    name: '20260623_101221_jobs'
  },
];
