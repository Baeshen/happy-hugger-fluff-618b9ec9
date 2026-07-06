/**
 * Unit test: تحقق تلقائي من أن كل مفتاح `FRIENDLY_INSERT_MESSAGES.<key>`
 * مذكور داخل `docs/book-friendly-insert-error.md`:
 *   1) موجود فعلًا داخل الجدول `FRIENDLY_INSERT_MESSAGES` في
 *      `src/lib/insert-errors.ts`.
 *   2) مربوط داخل الكود، أي أن `friendlyInsertError` يعيده في مسار واحد
 *      على الأقل (`return FRIENDLY_INSERT_MESSAGES.<key>`).
 *
 * القالب داخل الوثيقة يستخدم placeholders مثل `{{KEY}}` — هذه تُتجاهل.
 *
 * Run:  bun tests/unit/book-docs-keys.test.ts
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FRIENDLY_INSERT_MESSAGES } from "../../src/lib/insert-errors";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const DOCS_PATH = resolve(ROOT, "docs/book-friendly-insert-error.md");
const SRC_PATH = resolve(ROOT, "src/lib/insert-errors.ts");

const docs = readFileSync(DOCS_PATH, "utf8");
const src = readFileSync(SRC_PATH, "utf8");

// Extract every `FRIENDLY_INSERT_MESSAGES.<identifier>` occurrence from the docs.
// Skip template placeholders such as `{{KEY}}` and any non-identifier follow-up.
const KEY_RE = /FRIENDLY_INSERT_MESSAGES\.([A-Za-z_][A-Za-z0-9_]*)/g;
const mentionedKeys = new Set<string>();
for (const m of docs.matchAll(KEY_RE)) {
  mentionedKeys.add(m[1]);
}

// Allow the docs to mark keys that appear ONLY inside hypothetical
// "how to add a new key" examples. Declare them with a comment such as:
//   <!-- docs-example-keys: busy, retry -->
// Those keys are excluded from the existence/wiring checks below.
const EXAMPLE_RE = /<!--\s*docs-example-keys:\s*([^>]+?)\s*-->/g;
const exampleKeys = new Set<string>();
for (const m of docs.matchAll(EXAMPLE_RE)) {
  for (const k of m[1].split(/[\s,]+/)) {
    if (k) exampleKeys.add(k);
  }
}
for (const k of exampleKeys) mentionedKeys.delete(k);

// Sanity: ensure the docs actually mention at least one concrete key.
// (Prevents the test from silently passing if the docs are wiped.)
let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}\n    ${(err as Error).message}`);
    failed++;
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

console.log("── docs mentions at least one concrete key ──");
test("mentionedKeys is not empty", () => {
  assert(
    mentionedKeys.size > 0,
    `no FRIENDLY_INSERT_MESSAGES.<key> occurrences found in ${DOCS_PATH}`,
  );
});

console.log("\n── every mentioned key exists in FRIENDLY_INSERT_MESSAGES table ──");
const tableKeys = new Set(Object.keys(FRIENDLY_INSERT_MESSAGES));
for (const key of [...mentionedKeys].sort()) {
  test(`table has key: ${key}`, () => {
    assert(
      tableKeys.has(key),
      `docs mention FRIENDLY_INSERT_MESSAGES.${key} but it is missing from ` +
        `FRIENDLY_INSERT_MESSAGES in src/lib/insert-errors.ts. ` +
        `Known keys: ${[...tableKeys].join(", ")}`,
    );
  });
}

console.log("\n── every mentioned key is wired inside friendlyInsertError ──");
// Isolate the body of friendlyInsertError so we don't accidentally match
// unrelated occurrences elsewhere in the file (e.g. type aliases).
const fnMatch = src.match(/export\s+function\s+friendlyInsertError\s*\([\s\S]*?\n\}\s*$/m);
assert(fnMatch, "could not locate friendlyInsertError() in src/lib/insert-errors.ts");
const fnBody = fnMatch![0];

for (const key of [...mentionedKeys].sort()) {
  test(`friendlyInsertError returns FRIENDLY_INSERT_MESSAGES.${key}`, () => {
    const returnRe = new RegExp(
      String.raw`return\s+FRIENDLY_INSERT_MESSAGES\.` + key + String.raw`\b`,
    );
    assert(
      returnRe.test(fnBody),
      `docs mention FRIENDLY_INSERT_MESSAGES.${key} but no ` +
        `\`return FRIENDLY_INSERT_MESSAGES.${key}\` branch was found inside ` +
        `friendlyInsertError(). Either wire it in src/lib/insert-errors.ts, ` +
        `or remove the stale mention from docs/book-friendly-insert-error.md.`,
    );
  });
}

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
