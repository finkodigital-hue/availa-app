import { useCallback, useMemo, useState } from "react";
import Papa from "papaparse";
import { sha256Hex } from "@/lib/import/parse";
import type { ImportEntity } from "@/lib/import/fresha";
import { ENTITY_FIELDS } from "@/lib/import/schema";
import {
  applyMapping,
  autoMapHeaders,
  hasUsableNameMapping,
  missingRequiredFields,
  type FieldMapping,
} from "@/lib/import/mapping";
import { findExistingBatchByHash, type ExistingBatch } from "@/lib/import/commit";

// Shared upload/parse/map pipeline for one CSV, from any booking system.
// Handles the mechanics every step needs: read the file, hash it, guess a
// column mapping from the file's actual headers, and warn on a likely
// repeat import. Entity-specific row shaping and preview rendering stay in
// each step component; the mapping itself can be adjusted by the owner via
// the ColumnMapper UI (see column-mapper.tsx) when auto-detection misses.
export function useEntityUpload<T>(
  entity: ImportEntity,
  businessId: string | undefined,
  mapRow: (raw: Record<string, string>) => T | null,
) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [totalRows, setTotalRows] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [existingBatch, setExistingBatch] = useState<ExistingBatch | null>(null);
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);

  const load = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setParseError("Please select a .csv file.");
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
          setHeaders(fields);
          setMapping(autoMapHeaders(fields, entity));
          setFileHash(hash);
          const raw = result.data.filter((r) =>
            Object.values(r).some((v) => (v ?? "").toString().trim() !== ""),
          );
          setRawRows(raw);
          setTotalRows(raw.length);
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
          setParseError("We couldn't read that file. Make sure it's an unmodified CSV export.");
        });
    },
    [entity, businessId],
  );

  const reset = useCallback(() => {
    setFileName(null);
    setFileHash(null);
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setTotalRows(0);
    setParseError(null);
    setExistingBatch(null);
    setOverrideDuplicate(false);
  }, []);

  const { rows, skipped } = useMemo(() => {
    const mapped: T[] = [];
    let skippedCount = 0;
    for (const raw of rawRows) {
      const normalized = applyMapping(raw, mapping);
      const m = mapRow(normalized);
      if (m) mapped.push(m);
      else skippedCount++;
    }
    return { rows: mapped, skipped: skippedCount };
  }, [rawRows, mapping, mapRow]);

  const missingRequired = useMemo(() => missingRequiredFields(entity, mapping), [entity, mapping]);
  const missingName = useMemo(
    () =>
      (entity === "staff" || entity === "customers") &&
      rawRows.length > 0 &&
      !hasUsableNameMapping(mapping),
    [entity, mapping, rawRows.length],
  );

  return {
    fileName,
    fileHash,
    headers,
    fields: ENTITY_FIELDS[entity],
    mapping,
    setMapping,
    missingRequired,
    missingName,
    totalRows,
    rows,
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
