export interface UploadProgress {
  transferredBytes: number;
  totalBytes: number;
  percent: number;
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
}

export interface UploadResult {
  backupPath: string;
  relativePath: string;
}

export interface StorageTestResult {
  latencyMs: number;
  availableSpaceGb: number | null;
}

export interface StorageAdapter {
  readonly type: string;

  upload(localFilePath: string, relativePath: string, options?: UploadOptions): Promise<UploadResult>;
  download(relativePath: string, localDestinationPath: string): Promise<void>;
  delete(relativePath: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  exists(relativePath: string): Promise<boolean>;
  checkSpace(): Promise<number | null>;
  testConnection(): Promise<StorageTestResult>;
}
