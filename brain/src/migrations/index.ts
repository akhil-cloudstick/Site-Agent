import * as migration_20260409_155734_initial from './20260409_155734_initial';
import * as migration_20260619_083345_data_model from './20260619_083345_data_model';
import * as migration_20260619_090537_multi_tenant from './20260619_090537_multi_tenant';
import * as migration_20260619_102526_service_principal from './20260619_102526_service_principal';

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
    name: '20260619_102526_service_principal'
  },
];
