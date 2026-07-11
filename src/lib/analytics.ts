// Lightweight, provider-agnostic client event tracker.
// Forwards to GA (gtag), GTM (dataLayer), and Plausible if present,
// and always dispatches a `lovable:track` CustomEvent so custom listeners
// (or future integrations) can pick it up.

type Props = Record<string, string | number | boolean | null | undefined>;

interface TrackWindow extends Window {
  gtag?: (cmd: string, event: string, params?: Props) => void;
  dataLayer?: Array<Record<string, unknown>>;
  plausible?: (event: string, opts?: { props?: Props }) => void;
}

export function trackEvent(name: string, props: Props = {}): void {
  if (typeof window === "undefined") return;
  const w = window as TrackWindow;
  const payload = { ...props, event_ts: Date.now() };

  try {
    w.gtag?.("event", name, payload);
  } catch {
    /* ignore */
  }
  try {
    w.dataLayer?.push({ event: name, ...payload });
  } catch {
    /* ignore */
  }
  try {
    w.plausible?.(name, { props: payload as Props });
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent("lovable:track", { detail: { name, props: payload } }));
  } catch {
    /* ignore */
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug("[track]", name, payload);
  }
}
