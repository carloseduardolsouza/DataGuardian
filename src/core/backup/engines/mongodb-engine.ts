import { BackupEngine, EngineDumpResult, EngineRunCallbacks } from './base-engine';

export class MongodbBackupEngine implements BackupEngine {
  readonly type = 'mongodb';

  async dumpToFile(
    _connectionConfig: unknown,
    _outputFile: string,
    _callbacks?: EngineRunCallbacks,
  ): Promise<EngineDumpResult> {
    throw new Error('Engine mongodb ainda nao implementada no DataGuardian');
  }
}
