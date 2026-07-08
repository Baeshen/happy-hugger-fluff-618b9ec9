/**
 * Public VAPID key for Web Push subscriptions.
 * VAPID public keys are not secret; the matching private key lives in the
 * VAPID_PRIVATE_KEY server-side secret and is used to sign push requests.
 */
export const VAPID_PUBLIC_KEY =
  "BCromwhN2ufy-fNPqo2JCGXUTdpDNaKPZY-xb-ZBCCLchcUpvCOXmGecRPC5adKbZvR2Rnpd0qVV6eq3U2Gmv4Q";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

export function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
