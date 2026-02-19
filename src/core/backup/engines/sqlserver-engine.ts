import { BackupEngine, EngineDumpResult, EngineRunCallbacks } from './base-engine';

export class SqlserverBackupEngine implements BackupEngine {
  readonly type = 'sqlserver';

  async dumpToFile(
    _connectionConfig: unknown,
    _outputFile: string,
    _callbacks?: EngineRunCallbacks,
  ): Promise<EngineDumpResult> {
    throw new Error('Engine sqlserver ainda nao implementada no DataGuardian');
  }
}
