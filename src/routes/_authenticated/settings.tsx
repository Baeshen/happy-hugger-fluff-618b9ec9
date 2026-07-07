import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bell, BellOff, Check, Clock, Calendar, User, RefreshCw, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type Row = {
  id: string;
  patient_name: string;
  patient_phone: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  specialty_name_ar: string | null;
  doctor_name_ar: string | null;
  reminder_24h: boolean;
  reminder_2h: boolean;
};

function shortRef(id: string) {
  return id.replace(/-/g, "").slice(0, 8);
}

function SettingsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [verifiedKey, setVerifiedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: prof } = await supabase.auth.getUser();
    if (!prof.user) {
      setLoading(false);
      return;
    }
    const { data: p } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", prof.user.id)
      .maybeSingle();
    setPhone(p?.phone ?? null);

    const { data, error } = await supabase.rpc("my_appointments_with_reminders");
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: reflect any change to the user's appointments instantly
  useEffect(() => {
    if (!phone) return;
    const channel = supabase
      .channel("settings-reminders")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "appointments" },
        (payload) => {
          const n = payload.new as {
            id: string;
            reminder_24h: boolean;
            reminder_2h: boolean;
            patient_phone: string;
          };
          const normalize = (s: string) => (s || "").replace(/\D/g, "");
          if (normalize(n.patient_phone) !== normalize(phone)) return;
          setRows((prev) =>
            prev
              ? prev.map((r) =>
                  r.id === n.id
                    ? { ...r, reminder_24h: n.reminder_24h, reminder_2h: n.reminder_2h }
                    : r,
                )
              : prev,
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [phone]);

  const toggle = async (row: Row, which: "24h" | "2h", value: boolean) => {
    if (!phone) {
      toast.error("لا يوجد رقم هاتف مربوط بحسابك. أضِفه من صفحة «مواعيدي».");
      return;
    }
    const key = `${row.id}:${which}`;
    setSavingKey(key);
    setVerifiedKey(null);

    // Optimistic UI
    setRows((prev) =>
      prev
        ? prev.map((r) =>
            r.id === row.id
              ? { ...r, [which === "24h" ? "reminder_24h" : "reminder_2h"]: value }
              : r,
          )
        : prev,
    );

    const payload = {
      _ref: shortRef(row.id),
      _phone: phone,
      _reminder_24h: which === "24h" ? value : row.reminder_24h,
      _reminder_2h: which === "2h" ? value : row.reminder_2h,
      _reason: `تعديل من صفحة الإعدادات (${which === "24h" ? "24 ساعة" : "ساعتين"} → ${value ? "تشغيل" : "إيقاف"})`,
    };

    const { error } = await supabase.rpc("update_reminders_by_ref", payload);
    if (error) {
      toast.error(error.message);
      setSavingKey(null);
      await load(); // rollback via reload
      return;
    }

    // Instant verification: read fresh state from DB
    const { data: v } = await supabase.rpc("lookup_appointment", {
      _ref: shortRef(row.id),
      _phone: phone,
    });
    const verified = Array.isArray(v) ? v[0] : v;
    const dbValue =
      which === "24h"
        ? Boolean(verified?.reminder_24h)
        : Boolean(verified?.reminder_2h);

    if (dbValue === value) {
      setVerifiedKey(key);
      toast.success(
        `تم الحفظ والتحقق: ${which === "24h" ? "تذكير 24 ساعة" : "تذكير ساعتين"} ${value ? "مُفعّل" : "متوقف"}`,
      );
      setTimeout(() => setVerifiedKey((k) => (k === key ? null : k)), 2500);
    } else {
      toast.error("عدم تطابق الحالة بعد الحفظ — سيتم إعادة التحميل");
      await load();
    }
    setSavingKey(null);
  };

  const active = (rows ?? []).filter((r) => r.status === "new" || r.status === "confirmed");
  const others = (rows ?? []).filter((r) => r.status !== "new" && r.status !== "confirmed");

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <div className="container-app py-10 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="h-6 w-6 text-primary" /> إعدادات التذكير
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              فعّل أو أوقف تذكيرات مواعيدك القادمة. يتم التحقق فورًا من الحفظ.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </button>
        </div>

        {!phone && (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <p className="font-medium text-amber-800">لا يوجد رقم هاتف مربوط بحسابك.</p>
            <p className="text-amber-800/80 mt-1">
              أضِف رقم هاتفك من{" "}
              <Link to="/my" className="underline font-medium">
                صفحة مواعيدي
              </Link>{" "}
              لعرض مواعيدك وتعديل تفضيلات التذكير.
            </p>
          </div>
        )}

        {phone && rows && active.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Calendar className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">لا توجد مواعيد نشطة حاليًا.</p>
            <Link
              to="/book"
              className="inline-flex items-center gap-1 mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              حجز موعد جديد <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </Link>
          </div>
        )}

        {active.length > 0 && (
          <div className="space-y-4">
            {active.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <User className="h-4 w-4 text-muted-foreground" />
                      {row.patient_name}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-3">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {row.appointment_date}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {row.appointment_time.slice(0, 5)}
                      </span>
                      {row.doctor_name_ar && <span>د. {row.doctor_name_ar}</span>}
                      {row.specialty_name_ar && <span>· {row.specialty_name_ar}</span>}
                    </div>
                  </div>
                  <span className="rounded-full bg-primary/10 text-primary text-[11px] px-2 py-0.5 font-mono">
                    #{shortRef(row.id)}
                  </span>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  {(
                    [
                      { key: "24h" as const, label: "تذكير قبل 24 ساعة", value: row.reminder_24h },
                      { key: "2h" as const, label: "تذكير قبل ساعتين", value: row.reminder_2h },
                    ]
                  ).map((r) => {
                    const k = `${row.id}:${r.key}`;
                    const saving = savingKey === k;
                    const verified = verifiedKey === k;
                    return (
                      <button
                        key={r.key}
                        disabled={saving}
                        onClick={() => toggle(row, r.key, !r.value)}
                        className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-right transition ${
                          r.value
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-muted/30"
                        } ${saving ? "opacity-60" : "hover:border-primary/60"}`}
                      >
                        <div className="flex items-center gap-2">
                          {r.value ? (
                            <Bell className="h-4 w-4 text-primary" />
                          ) : (
                            <BellOff className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-sm font-medium">{r.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {verified && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-green-700 font-medium">
                              <Check className="h-3 w-3" /> تحقق
                            </span>
                          )}
                          <span
                            className={`inline-flex h-6 w-11 items-center rounded-full transition ${
                              r.value ? "bg-primary" : "bg-muted-foreground/30"
                            }`}
                          >
                            <span
                              className={`h-5 w-5 rounded-full bg-background shadow transform transition ${
                                r.value ? "translate-x-[-20px] rtl:translate-x-[-20px]" : "translate-x-[2px] rtl:translate-x-[-2px]"
                              }`}
                            />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {others.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-muted-foreground mb-2">
              مواعيد سابقة/ملغاة ({others.length})
            </h2>
            <div className="text-xs text-muted-foreground">
              تفضيلات التذكير غير قابلة للتعديل للمواعيد غير النشطة.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
