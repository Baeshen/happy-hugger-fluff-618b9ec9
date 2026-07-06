/**
 * Unit tests: normalizeReason / isEmptyReason / reasonSchema.
 *
 * Verifies the shared reason normalization contract (src/lib/reason.ts):
 *   - Edges only: strip leading/trailing whitespace per String#trim()
 *     (ASCII space, \t, \n, \r, NBSP U+00A0).
 *   - ZWSP U+200B is NOT whitespace — must survive at edges and internally.
 *   - Internal whitespace is preserved verbatim (spaces, tabs, newlines,
 *     NBSP runs, mixed).
 *   - Whitespace-only input → "" (and isEmptyReason returns true).
 *   - null / undefined → undefined (and isEmptyReason returns true).
 *   - 500-char cap applied AFTER trim.
 *   - Zod reasonSchema matches normalizeReason exactly.
 *
 * Run:  bun tests/unit/reason.test.ts
 */
import {
  normalizeReason,
  isEmptyReason,
  reasonSchema,
  reasonRequiredFor,
  REASON_MAX,
} from "../../src/lib/reason";

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
function eq<T>(got: T, want: T, label = "value") {
  assert(
    got === want,
    `${label} mismatch:\n    got=${JSON.stringify(got)}\n    want=${JSON.stringify(want)}`,
  );
}

const ZWSP = "\u200B";
const NBSP = "\u00A0";
const SP = " ";

console.log("── normalizeReason: null / undefined ──");
test("undefined → undefined", () => eq(normalizeReason(undefined), undefined));
test("null → undefined",      () => eq(normalizeReason(null),      undefined));
test("isEmptyReason(undefined) is true", () => assert(isEmptyReason(undefined), "should be empty"));

console.log("\n── normalizeReason: whitespace-only → '' ──");
for (const [name, raw] of [
  ["empty",           ""],
  ["single space",    " "],
  ["many spaces",     "     "],
  ["tab",             "\t"],
  ["newline",         "\n"],
  ["CRLF",            "\r\n"],
  ["NBSP",            NBSP],
  ["NBSP run",        `${NBSP}${NBSP}${NBSP}`],
  ["mixed all",       ` \t\n\r${NBSP} `],
] as const) {
  test(`ws-only (${name}) → ''`, () => {
    const got = normalizeReason(raw);
    eq(got, "", `normalize(${JSON.stringify(raw)})`);
    assert(isEmptyReason(got), "isEmptyReason should be true for ''");
  });
}

console.log("\n── normalizeReason: edge trimming (edges only) ──");
const edgeCases: Array<[string, string, string]> = [
  ["leading ASCII spaces",  `   طلب`,                     `طلب`],
  ["trailing ASCII spaces", `طلب   `,                     `طلب`],
  ["both ASCII spaces",     `   طلب   `,                  `طلب`],
  ["leading tabs",          `\t\tطلب`,                    `طلب`],
  ["trailing tabs",         `طلب\t\t`,                    `طلب`],
  ["leading newlines",      `\n\nطلب`,                    `طلب`],
  ["trailing newlines",     `طلب\n\n`,                    `طلب`],
  ["CRLF both sides",       `\r\nطلب\r\n`,                `طلب`],
  ["leading NBSP",          `${NBSP}${NBSP}طلب`,          `طلب`],
  ["trailing NBSP",         `طلب${NBSP}${NBSP}`,          `طلب`],
  ["mixed edges",           `  \n\t${NBSP}طلب${NBSP}\t\n\r `, `طلب`],
];
for (const [name, raw, want] of edgeCases) {
  test(`trim edges: ${name}`, () => {
    eq(normalizeReason(raw), want);
    assert(!isEmptyReason(normalizeReason(raw)), "non-empty expected");
  });
}

console.log("\n── normalizeReason: internal whitespace preserved verbatim ──");
const internalCases: Array<[string, string, string]> = [
  ["double space",       `اتصل${SP}${SP}المريض`,                    `اتصل${SP}${SP}المريض`],
  ["triple space",       `اتصل${SP}${SP}${SP}المريض`,               `اتصل${SP}${SP}${SP}المريض`],
  ["internal tab",       `اتصل\tالمريض`,                            `اتصل\tالمريض`],
  ["internal newline",   `اتصل\nالمريض`,                            `اتصل\nالمريض`],
  ["internal CRLF",      `اتصل\r\nالمريض`,                          `اتصل\r\nالمريض`],
  ["internal NBSP",      `اتصل${NBSP}المريض`,                       `اتصل${NBSP}المريض`],
  ["NBSP run internal",  `اتصل${NBSP}${NBSP}${NBSP}المريض`,         `اتصل${NBSP}${NBSP}${NBSP}المريض`],
  ["mixed NBSP+space",   `اتصل${NBSP}${SP}${NBSP}المريض`,           `اتصل${NBSP}${SP}${NBSP}المريض`],
  ["mixed with tab/nl",  `اتصل\tالمريض\nلإلغاء\tالحجز`,             `اتصل\tالمريض\nلإلغاء\tالحجز`],
  ["edges trimmed, internal ws kept",
    `  اتصل${NBSP}${NBSP}المريض\n`,                                 `اتصل${NBSP}${NBSP}المريض`],
];
for (const [name, raw, want] of internalCases) {
  test(`internal ws preserved: ${name}`, () => eq(normalizeReason(raw), want));
}

console.log("\n── normalizeReason: ZWSP (U+200B) is NOT whitespace ──");
const zwspCases: Array<[string, string, string]> = [
  ["leading ZWSP survives",   `${ZWSP}طلب`,                        `${ZWSP}طلب`],
  ["trailing ZWSP survives",  `طلب${ZWSP}`,                        `طلب${ZWSP}`],
  ["ZWSP both sides survive", `${ZWSP}طلب${ZWSP}`,                 `${ZWSP}طلب${ZWSP}`],
  ["internal ZWSP survives",  `طلب${ZWSP}المريض`,                  `طلب${ZWSP}المريض`],
  ["ZWSP + edge spaces",      `  ${ZWSP}طلب${ZWSP}  `,             `${ZWSP}طلب${ZWSP}`],
  ["ZWSP + edge NBSP",        `${NBSP}${ZWSP}طلب${ZWSP}${NBSP}`,   `${ZWSP}طلب${ZWSP}`],
  ["ZWSP + edge tabs/nl",     `\n\t${ZWSP}طلب${ZWSP}\t\n`,         `${ZWSP}طلب${ZWSP}`],
  ["ZWSP-only NOT trimmed",   `${ZWSP}${ZWSP}${ZWSP}`,             `${ZWSP}${ZWSP}${ZWSP}`],
];
for (const [name, raw, want] of zwspCases) {
  test(`ZWSP: ${name}`, () => {
    const got = normalizeReason(raw);
    eq(got, want);
    // A ZWSP-only reason is not "empty" per our contract (String#trim leaves it).
    assert(!isEmptyReason(got), "ZWSP-containing reason must not be considered empty");
  });
}

console.log("\n── normalizeReason: 500-char cap AFTER trim ──");
test("under cap unchanged", () => {
  const s = "ا".repeat(REASON_MAX);
  eq(normalizeReason(s), s);
  eq(normalizeReason(s)!.length, REASON_MAX);
});
test("over cap sliced to REASON_MAX", () => {
  const s = "ا".repeat(REASON_MAX + 25);
  const got = normalizeReason(s)!;
  eq(got.length, REASON_MAX, "length");
  eq(got, "ا".repeat(REASON_MAX));
});
test("edges trimmed BEFORE cap counts characters", () => {
  const core = "ب".repeat(REASON_MAX + 10);
  const raw = `   \n${core}\t   `;
  const got = normalizeReason(raw)!;
  eq(got.length, REASON_MAX, "length");
  eq(got, "ب".repeat(REASON_MAX));
});

console.log("\n── isEmptyReason ──");
test("'' is empty",              () => assert(isEmptyReason(""), "empty"));
test("undefined is empty",       () => assert(isEmptyReason(undefined), "empty"));
test("'x' is NOT empty",         () => assert(!isEmptyReason("x"), "not empty"));
test("single space is NOT empty (already normalized value)", () =>
  assert(!isEmptyReason(" "), "already-normalized values are taken as-is"));
test("ZWSP alone is NOT empty", () => assert(!isEmptyReason(ZWSP), "ZWSP is not whitespace"));

console.log("\n── reasonSchema parity with normalizeReason ──");
const parityInputs: Array<string | null | undefined> = [
  undefined, null, "", " ", `${NBSP}`, `${ZWSP}`,
  "طلب", `  طلب  `, `\t\nطلب\n\t`, `${NBSP}طلب${NBSP}`,
  `${ZWSP}طلب${ZWSP}`, `اتصل${NBSP}${NBSP}المريض`,
  `اتصل${SP}${SP}المريض\n`, "ا".repeat(REASON_MAX + 20),
];
for (const raw of parityInputs) {
  test(`schema === normalizeReason for ${JSON.stringify(raw)}`, () => {
    const viaSchema = reasonSchema.parse(raw);
    const viaFn = normalizeReason(raw ?? undefined);
    eq(viaSchema, viaFn, "schema vs fn");
  });
}

console.log("\n── reasonRequiredFor ──");
test("required for cancelled", () => assert(reasonRequiredFor("cancelled"), "should require"));
test("required for no_show",   () => assert(reasonRequiredFor("no_show"),   "should require"));
for (const s of ["new", "confirmed", "completed", "unknown"]) {
  test(`not required for ${s}`, () => assert(!reasonRequiredFor(s), "should not require"));
}

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
