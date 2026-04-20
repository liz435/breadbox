// ── Diagram URL encoding ────────────────────────────────────────────────────
//
// Compresses a DreamerDiagram into a URL-safe string for sharing circuits via
// `<origin>/<path>?diagram=<encoded>` links. Round-trip is pure:
//
//   encodeDiagramForUrl(d) → string          (URL-safe, no need to escape)
//   decodeDiagramFromUrl(encoded) → unknown  (caller validates via
//                                             diagramToBoardState)
//
// Compression: lz-string's `compressToEncodedURIComponent` uses a dictionary
// encoder tuned for JSON, then maps to a 64-character alphabet (A-Z a-z 0-9 +-)
// that is already URL-safe. Typical single-LED diagrams shrink from ~700 to
// ~250 bytes; a 15-component board lands around 1.2–1.8 KB — well under the
// ~8 KB informal URL-length ceiling most platforms respect.
//
// Error handling: decode returns a structured result rather than throwing so
// the caller can surface a user-visible error. A garbage input typically fails
// at the `JSON.parse` step; the decompressor is lenient and will return an
// empty string for non-lz-string payloads, which we detect explicitly.

import LZString from "lz-string";
import type { DreamerDiagram } from "./design";

export type DecodeResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/**
 * Encode a DreamerDiagram (or any JSON-serializable value — the adapter
 * typically passes the DSL form) into a URL-safe string.
 *
 * The result can be pasted into a URL query value without further escaping.
 */
export function encodeDiagramForUrl(diagram: DreamerDiagram): string {
  const json = JSON.stringify(diagram);
  return LZString.compressToEncodedURIComponent(json);
}

/**
 * Decode a URL-safe string produced by `encodeDiagramForUrl` back into the raw
 * JSON value. The caller MUST validate via `diagramToBoardState` before
 * trusting the structure — we return `unknown` on purpose so the zod pass
 * remains the single source of truth for validation errors.
 *
 * Returns a structured result instead of throwing so UI code can toast the
 * specific failure mode (malformed payload vs malformed JSON).
 */
export function decodeDiagramFromUrl(encoded: string): DecodeResult {
  if (typeof encoded !== "string" || encoded.length === 0) {
    return { ok: false, error: "empty or non-string payload" };
  }

  const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
  // LZString returns "" for inputs that don't look like its encoding, and
  // null only for nullish inputs. Guard both to avoid "" → JSON.parse("")
  // producing a confusing SyntaxError.
  if (decompressed === null || decompressed === "") {
    return {
      ok: false,
      error: "payload is not a valid lz-string-encoded diagram",
    };
  }

  try {
    const data = JSON.parse(decompressed) as unknown;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "invalid JSON in payload",
    };
  }
}
