import { useCallback, useState } from "react";
import Papa from "papaparse";
import { sha256Hex } from "@/lib/import/parse";
import { detectEntityMismatch, type ImportEntity } from "@/lib/import/fresha";
import { findExistingBatchByHash, type ExistingBatch } from "@/lib/import/commit";

// Shared upload/parse/hash pipeline for one Fresha CSV. Entity-specific row
// mapping and preview rendering stay in each step component; this only
// handles the mechanics every step needs: read the file, hash it, detect an
// obviously-wrong file, and warn on a likely repeat import.
export function useEntityUpload<T>(
  entity: ImportEntity,
  businessId: string | undefined,
  mapRow: (raw: Record<string, string>) => T | null,
) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [headerMismatch, setHeaderMismatch] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  const [rows, setRows] = useState<T[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [existingBatch, setExistingBatch] = useState<ExistingBatch | null>(null);
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);

  const load = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setParseError("Please select a .csv file exported from Fresha.");
        return;
      }
      setParsing(true);
      setParseError(null);
      setExistingBatch(null);
      setOverrideDuplicate(false);
      setFileName(file.name);

      Promise.all([
        new Promise<Papa.ParseResult<Record<string, string>>>((resolve, reject) => {
          Papa.parse<Record<string, string>>(file, {
            header: true,
            skipEmptyLines: true,
            complete: resolve,
            error: reject,
          });
        }),
        sha256Hex(file),
      ])
        .then(async ([result, hash]) => {
          const fields = result.meta.fields ?? [];
          setHeaderMismatch(detectEntityMismatch(entity, fields));
          setFileHash(hash);
          const raw = result.data.filter((r) =>
            Object.values(r).some((v) => (v ?? "").toString().trim() !== ""),
          );
          setTotalRows(raw.length);
          const mapped: T[] = [];
          let skippedCount = 0;
          for (const r of raw) {
            const m = mapRow(r);
            if (m) mapped.push(m);
            else skippedCount++;
          }
          setRows(mapped);
          setSkipped(skippedCount);
          setParsing(false);
          if (businessId) {
            try {
              const existing = await findExistingBatchByHash(businessId, hash);
              setExistingBatch(existing);
            } catch {
              // Non-fatal — duplicate-file detection is a courtesy, not a hard gate.
            }
          }
        })
        .catch(() => {
          setParsing(false);
          setParseError(
            "We couldn't read that file. Make sure it's an unmodified CSV export from Fresha.",
          );
        });
    },
    [entity, businessId, mapRow],
  );

  const reset = useCallback(() => {
    setFileName(null);
    setFileHash(null);
    setHeaderMismatch(false);
    setTotalRows(0);
    setRows([]);
    setSkipped(0);
    setParseError(null);
    setExistingBatch(null);
    setOverrideDuplicate(false);
  }, []);

  return {
    fileName,
    fileHash,
    headerMismatch,
    totalRows,
    rows,
    setRows,
    skipped,
    parsing,
    parseError,
    existingBatch,
    overrideDuplicate,
    setOverrideDuplicate,
    load,
    reset,
  };
}
