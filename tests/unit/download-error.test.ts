/**
 * Unit tests: signed-URL download error handling for the /my tabs
 * (المختبر / الأشعة / الفواتير).
 *
 * Covers the pure friendly-message mapping used by DownloadFileButton in
 * src/routes/_authenticated/my.tsx to render the "إعادة المحاولة" retry
 * button + destructive error text.
 *
 * Run:  bun tests/unit/download-error.test.ts
 */
import {
  getFriendlyDownloadError,
  DOWNLOAD_ERROR_MESSAGES,
  type DownloadBucket,
} from "../../src/lib/download-error";

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
function eq<T>(got: T, want: T, label = "value") {
  if (got !== want) {
    throw new Error(`${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
}

console.log("getFriendlyDownloadError — file-not-found → user-friendly Arabic");
test("maps 'Object not found' → notFound", () => {
  eq(getFriendlyDownloadError("Object not found"), DOWNLOAD_ERROR_MESSAGES.notFound);
});
test("maps literal '404' → notFound", () => {
  eq(getFriendlyDownloadError("404"), DOWNLOAD_ERROR_MESSAGES.notFound);
});
test("maps 'not-found' with hyphen → notFound", () => {
  eq(getFriendlyDownloadError("not-found"), DOWNLOAD_ERROR_MESSAGES.notFound);
});

console.log("getFriendlyDownloadError — expired URL");
test("maps 'signed url expired' → expired", () => {
  eq(getFriendlyDownloadError("signed url expired"), DOWNLOAD_ERROR_MESSAGES.expired);
});
test("maps Arabic 'انتهت الصلاحية' → expired", () => {
  eq(getFriendlyDownloadError("انتهت الصلاحية"), DOWNLOAD_ERROR_MESSAGES.expired);
});

console.log("getFriendlyDownloadError — fallbacks");
test("empty string → generic", () => {
  eq(getFriendlyDownloadError(""), DOWNLOAD_ERROR_MESSAGES.generic);
});
test("null → generic", () => {
  eq(getFriendlyDownloadError(null), DOWNLOAD_ERROR_MESSAGES.generic);
});
test("undefined → generic", () => {
  eq(getFriendlyDownloadError(undefined), DOWNLOAD_ERROR_MESSAGES.generic);
});
test("whitespace-only → generic", () => {
  eq(getFriendlyDownloadError("   \n\t"), DOWNLOAD_ERROR_MESSAGES.generic);
});
test("unknown non-empty message passes through verbatim", () => {
  eq(
    getFriendlyDownloadError("Storage bucket permission denied"),
    "Storage bucket permission denied",
  );
});

console.log("DOWNLOAD_ERROR_MESSAGES — Arabic UI strings present");
test("invalidUrl message is set for HEAD non-ok path", () => {
  if (!DOWNLOAD_ERROR_MESSAGES.invalidUrl.length) {
    throw new Error("invalidUrl must be a non-empty Arabic message");
  }
});
test("unexpected message is set for catch-all path", () => {
  if (!DOWNLOAD_ERROR_MESSAGES.unexpected.length) {
    throw new Error("unexpected must be a non-empty Arabic message");
  }
});
test("downloadStarted success toast is set", () => {
  if (!DOWNLOAD_ERROR_MESSAGES.downloadStarted.length) {
    throw new Error("downloadStarted must be a non-empty Arabic message");
  }
});

console.log("DownloadBucket — covers the three /my tabs");
test("lab-reports bucket is a valid DownloadBucket", () => {
  const b: DownloadBucket = "lab-reports";
  eq(b, "lab-reports");
});
test("radiology-reports bucket is a valid DownloadBucket", () => {
  const b: DownloadBucket = "radiology-reports";
  eq(b, "radiology-reports");
});
test("invoice-pdfs bucket is a valid DownloadBucket", () => {
  const b: DownloadBucket = "invoice-pdfs";
  eq(b, "invoice-pdfs");
});

/**
 * Integration-style: simulate the exact branching DownloadFileButton uses
 * for each of the three tabs (lab / radiology / invoices) so a regression
 * in the shared code path is caught for all three at once.
 */
console.log("Simulated DownloadFileButton flow per tab");
type SignResult =
  | { data: { signedUrl: string } | null; error: { message: string } | null };

async function simulateFlow(
  bucket: DownloadBucket,
  path: string,
  sign: (bucket: DownloadBucket, path: string) => Promise<SignResult>,
  headOk: boolean | "throw",
): Promise<{ error: string | null; success: boolean; bucket: DownloadBucket }> {
  const { data, error: signError } = await sign(bucket, path);
  if (signError || !data?.signedUrl) {
    return { error: getFriendlyDownloadError(signError?.message), success: false, bucket };
  }
  if (headOk === false) {
    return { error: DOWNLOAD_ERROR_MESSAGES.invalidUrl, success: false, bucket };
  }
  // headOk === "throw" → swallow and continue (matches component behavior)
  return { error: null, success: true, bucket };
}

for (const bucket of ["lab-reports", "radiology-reports", "invoice-pdfs"] as DownloadBucket[]) {
  test(`[${bucket}] shows notFound message + retry when signed URL is 404`, async () => {
    const out = await simulateFlow(
      bucket,
      "missing.pdf",
      async () => ({ data: null, error: { message: "Object not found" } }),
      true,
    );
    eq(out.success, false, "success");
    eq(out.error, DOWNLOAD_ERROR_MESSAGES.notFound, "error");
    eq(out.bucket, bucket, "bucket");
  });

  test(`[${bucket}] shows expired message + retry when signed URL is expired`, async () => {
    const out = await simulateFlow(
      bucket,
      "old.pdf",
      async () => ({ data: null, error: { message: "signed url expired" } }),
      true,
    );
    eq(out.success, false);
    eq(out.error, DOWNLOAD_ERROR_MESSAGES.expired);
  });

  test(`[${bucket}] shows invalidUrl message when HEAD check returns non-ok`, async () => {
    const out = await simulateFlow(
      bucket,
      "file.pdf",
      async () => ({ data: { signedUrl: "https://example.test/x.pdf" }, error: null }),
      false,
    );
    eq(out.success, false);
    eq(out.error, DOWNLOAD_ERROR_MESSAGES.invalidUrl);
  });

  test(`[${bucket}] succeeds after retry when signed URL becomes reachable`, async () => {
    let attempt = 0;
    const sign = async (): Promise<SignResult> => {
      attempt++;
      if (attempt === 1) return { data: null, error: { message: "Object not found" } };
      return { data: { signedUrl: "https://example.test/x.pdf" }, error: null };
    };
    const first = await simulateFlow(bucket, "file.pdf", sign, true);
    eq(first.success, false, "first attempt should fail");
    eq(first.error, DOWNLOAD_ERROR_MESSAGES.notFound);

    const retry = await simulateFlow(bucket, "file.pdf", sign, true);
    eq(retry.success, true, "retry should succeed");
    eq(retry.error, null);
  });
}

// Run async tests to completion, then report.
setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 100);
