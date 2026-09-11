export interface PatchResult {
  file: string;
  line: number;
  originalLine: string;
  patchedLine: string;
  originalContent: string;
  patchedContent: string;
  diff: string;
  applied: boolean;
  backupFile?: string;
}

export interface PatcherOptions {
  createBackup?: boolean; // default: true
  backupExtension?: string; // default: ".autoheal-backup"
  dryRun?: boolean; // default: false
  nearbyTolerance?: number; // default: 3 lines
}
