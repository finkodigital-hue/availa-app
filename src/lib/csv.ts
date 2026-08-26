import Papa from "papaparse";

// Generates a CSV file client-side and triggers a browser download —
// reuses papaparse (already a dependency for CSV import) for the actual
// stringification so quoting/escaping stays consistent with the rest of
// the app's CSV handling.
export function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  const csv = Papa.unparse(rows);
  // Excel on Windows guesses the system codepage for a BOM-less UTF-8 CSV
  // and mangles anything non-ASCII (accented names, curly quotes) — the
  // BOM forces it to read the file as UTF-8. Google Sheets and other tools
  // ignore the BOM harmlessly either way.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Same pattern as downloadCsv — generated client-side from data the owner
// already fetched over their own authenticated session, so there's never a
// public URL or a Storage upload for it to leak from.
export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
