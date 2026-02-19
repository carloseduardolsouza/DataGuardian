import { DatasourceType } from '@prisma/client';
import { BackupEngine, EngineRunCallbacks } from './engines/base-engine';
import { PostgresBackupEngine } from './engines/postgres-engine';
import { MysqlBackupEngine } from './engines/mysql-engine';
import { MongodbBackupEngine } from './engines/mongodb-engine';
import { SqlserverBackupEngine } from './engines/sqlserver-engine';
import { SqliteBackupEngine } from './engines/sqlite-engine';
import { FilesBackupEngine } from './engines/files-engine';

const engines: Record<DatasourceType, BackupEngine> = {
  postgres: new PostgresBackupEngine(),
  mysql: new MysqlBackupEngine(),
  mongodb: new MongodbBackupEngine(),
  sqlserver: new SqlserverBackupEngine(),
  sqlite: new SqliteBackupEngine(),
  files: new FilesBackupEngine(),
};

export async function executeBackupDump(params: {
  datasourceType: DatasourceType;
  connectionConfig: unknown;
  outputFile: string;
  callbacks?: EngineRunCallbacks;
}) {
  const engine = engines[params.datasourceType];
  if (!engine) {
    throw new Error(`Datasource '${params.datasourceType}' nao suportado`);
  }

  return engine.dumpToFile(params.connectionConfig, params.outputFile, params.callbacks);
}
