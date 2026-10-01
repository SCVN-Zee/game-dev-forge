/**
 * test/lib/rel-path-safety.test.ts
 *
 * Pins the reject table of isSafeRelPath. This predicate is the last guard in
 * Used by init layout validation before relative directories are joined to the
 * Assets root.
 *
 * Two rows encode deliberately conservative behavior:
 *   "..hidden" → true   (only a WHOLE ".." segment is a traversal)
 *   "a/../b"   → false  (any ".." segment rejects; we never resolve)
 */

import { describe, expect, it } from "vitest";
import { isSafeRelPath } from "../../src/lib/rel-path-safety.js";

describe("isSafeRelPath", () => {
  const cases: Array<[input: string, expected: boolean, why: string]> = [
    ["vFolders",         true,  "plain segment"],
    ["Plugins/Sirenix",  true,  "nested"],
    ["Voxel Labs",       true,  "space in name"],
    ["..hidden",         true,  ".. as a name prefix is not a traversal segment"],
    ["",                 false, "empty"],
    ["/etc/passwd",      false, "absolute"],
    ["../outside",       false, "leading .."],
    ["a/../../b",        false, "interior .."],
    ["a/..//b",          false, ".. across a repeated separator"],
    ["a\\..\\b",         false, "backslash separator"],
    ["a/../b",           false, "any .. segment rejects, even if it would resolve inside"],
  ];

  for (const [input, expected, why] of cases) {
    it(`${JSON.stringify(input)} → ${expected} (${why})`, () => {
      expect(isSafeRelPath(input)).toBe(expected);
    });
  }
});
