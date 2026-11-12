type ExportFiles = {
  cacheDirectory: string | null;
  makeDirectoryAsync(uri: string, options: { intermediates: boolean }): Promise<void>;
  readDirectoryAsync(uri: string): Promise<string[]>;
  deleteAsync(uri: string, options: { idempotent: boolean }): Promise<void>;
  writeAsStringAsync(uri: string, data: string, options: { encoding: 'base64' }): Promise<void>;
};
type ExportSharing = {
  isAvailableAsync(): Promise<boolean>;
  shareAsync(uri: string, options: { mimeType: string; UTI?: string }): Promise<void>;
};
const MAX_AGE = 24 * 60 * 60 * 1000;
let sequence = 0;
function directory(files: ExportFiles) {
  if (!files.cacheDirectory) throw new Error('Temporary file storage is unavailable.');
  return `${files.cacheDirectory}bookzenvo-exports/`;
}

/** Only our generated cache files are eligible. Never touch user documents. */
export async function cleanWorkspaceExports(files: ExportFiles, now = Date.now()) {
  const root = directory(files);
  await files.makeDirectoryAsync(root, { intermediates: true });
  for (const name of await files.readDirectoryAsync(root)) {
    const match = /^(\d{13})-\d+-[a-zA-Z0-9._-]+$/.exec(name);
    if (match && now - Number(match[1]) >= MAX_AGE) {
      await files.deleteAsync(root + name, { idempotent: true });
    }
  }
}

export async function shareWorkspaceExport(files: ExportFiles, sharing: ExportSharing,
  filename: string, base64: string, mimeType: string, now = Date.now()) {
  // Check before creating a plaintext copy. No document-directory fallback.
  if (!(await sharing.isAvailableAsync())) throw new Error('File sharing is unavailable.');
  if (!base64 || base64.length > 7 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error('Invalid export content.');
  }
  await cleanWorkspaceExports(files, now);
  const name = filename.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100) || 'bookzenvo-export.csv';
  const uri = `${directory(files)}${now}-${++sequence}-${name}`;
  try {
    await files.writeAsStringAsync(uri, base64, { encoding: 'base64' });
    await sharing.shareAsync(uri, { mimeType, UTI: mimeType === 'text/csv' ? 'public.comma-separated-values-text' : undefined });
  } catch (error) {
    await files.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    throw error;
  }
  // A receiving app may still be reading after the Android chooser resolves.
  // Remove on a later launch/export after 24 hours, not immediately on return.
}
