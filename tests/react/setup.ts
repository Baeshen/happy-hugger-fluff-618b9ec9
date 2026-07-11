/**
 * Happy-DOM setup — registers window/document globally so React can render.
 * Imported first by every React test file in this folder.
 * See: https://bun.com/guides/test/happy-dom
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
if (!(globalThis as unknown as { window?: unknown }).window) {
  GlobalRegistrator.register();
}
