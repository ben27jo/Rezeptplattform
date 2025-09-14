// lib/share.ts
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";

/** Link bauen: https://deinedomain/?pantry=<komprimierteDaten> */
export function buildShareURL(selection: string[], origin?: string) {
  const data = compressToEncodedURIComponent(JSON.stringify([...new Set(selection)].sort()));
  const base =
    origin || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/?pantry=${data}`;
}

/** Daten aus ?pantry=… wiederherstellen */
export function parseShareParam(param?: string): string[] {
  if (!param) return [];
  try {
    const json = decompressFromEncodedURIComponent(param);
    if (!json) return [];
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

/** Falls jemand nur den Token (ohne URL) sendet, kannst du ihn auch direkt decodieren. */
export function decodeTokenOrURL(input: string): string[] {
  try {
    const u = new URL(input);
    return parseShareParam(u.searchParams.get("pantry") || undefined);
  } catch {
    return parseShareParam(input);
  }
}
