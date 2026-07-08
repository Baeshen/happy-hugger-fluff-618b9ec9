import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  VAPID_PUBLIC_KEY,
  urlBase64ToUint8Array,
  arrayBufferToBase64,
} from "@/lib/push-config";
import {
  savePushSubscription,
  deletePushSubscription,
} from "@/lib/push-subscriptions.functions";

type PushState = "unsupported" | "denied" | "granted" | "default" | "unknown";

export function usePushNotifications(enabled: boolean) {
  const [state, setState] = useState<PushState>("unknown");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = useServerFn(savePushSubscription);
  const remove = useServerFn(deletePushSubscription);

  // Detect support + initial state
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    setState(Notification.permission as PushState);

    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
        if (!reg) {
          setSubscribed(false);
          return;
        }
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch {
        setSubscribed(false);
      }
    })();
  }, [enabled]);

  const subscribe = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (state === "unsupported") {
      toast.error("متصفحك لا يدعم إشعارات الدفع");
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setState(permission as PushState);
      if (permission !== "granted") {
        toast.error("لم يتم منح إذن الإشعارات");
        return;
      }

      const reg =
        (await navigator.serviceWorker.getRegistration("/sw-push.js")) ??
        (await navigator.serviceWorker.register("/sw-push.js", { scope: "/" }));

      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const json = sub.toJSON();
      const p256dh = json.keys?.p256dh ?? arrayBufferToBase64(sub.getKey("p256dh"));
      const auth = json.keys?.auth ?? arrayBufferToBase64(sub.getKey("auth"));
      if (!sub.endpoint || !p256dh || !auth) {
        throw new Error("Missing subscription details");
      }

      await save({
        data: {
          endpoint: sub.endpoint,
          p256dh,
          auth,
          userAgent: navigator.userAgent.slice(0, 500),
        },
      });
      setSubscribed(true);
      toast.success("تم تفعيل إشعارات المتصفح");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تفعيل الإشعارات");
    } finally {
      setBusy(false);
    }
  }, [save, state]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        try {
          await remove({ data: { endpoint: sub.endpoint } });
        } catch {
          /* ignore server errors, still unsubscribe locally */
        }
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success("تم إيقاف إشعارات المتصفح");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إيقاف الإشعارات");
    } finally {
      setBusy(false);
    }
  }, [remove]);

  const toggle = useCallback(() => {
    if (subscribed) return unsubscribe();
    return subscribe();
  }, [subscribe, unsubscribe, subscribed]);

  return { state, subscribed, busy, subscribe, unsubscribe, toggle };
}
