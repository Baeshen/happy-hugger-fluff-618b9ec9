import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X as XIcon } from "lucide-react";

export type ReminderAuditRow = {
  id: string;
  reminder_kind: "reminder_24h" | "reminder_2h" | string;
  old_value: boolean | null;
  new_value: boolean | null;
  source: "staff" | "self_service" | "system" | string | null;
  reason?: string | null;
  changed_at: string;
  changed_by_name?: string | null;
};

const KIND_LABEL: Record<string, string> = {
  reminder_24h: "قبل 24 ساعة",
  reminder_2h: "قبل ساعتين",
};

const SOURCE_LABEL: Record<string, string> = {
  self_service: "تعديل ذاتي",
  staff: "موظف",
  system: "النظام",
};

function valueLabel(v: boolean | null | undefined) {
  if (v === true) return "مفعّل";
  if (v === false) return "معطّل";
  return "—";
}

export function ReminderPreferenceHistoryList({
  rows,
  showActor,
}: {
  rows: ReminderAuditRow[];
  showActor?: boolean;
}) {
  if (!rows.length) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        لا توجد تغييرات على تفضيلات التذكير
      </div>
    );
  }
  return (
    <ol className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.id}
          className="rounded-lg border border-border bg-card p-3 text-sm"
        >
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {showActor && r.changed_by_name
                ? r.changed_by_name
                : (SOURCE_LABEL[r.source ?? ""] ?? "—")}
            </span>
            <span dir="ltr">
              {new Date(r.changed_at).toLocaleString("ar-SA")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs">
              <span className="font-medium">
                {KIND_LABEL[r.reminder_kind] ?? r.reminder_kind}
              </span>
              <span className="text-muted-foreground">:</span>
              <span>{valueLabel(r.old_value)}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-medium">{valueLabel(r.new_value)}</span>
            </span>
            {showActor && r.source && (
              <span className="text-xs text-muted-foreground">
                ({SOURCE_LABEL[r.source] ?? r.source})
              </span>
            )}
          </div>
          {r.reason && (
            <div className="mt-1 text-xs text-muted-foreground">
              السبب: <span className="text-foreground">{r.reason}</span>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Modal for /lookup (anon) — fetches via list_reminder_preferences_by_ref */
export function ReminderHistoryByRefModal({
  refValue,
  phone,
  onClose,
}: {
  refValue: string;
  phone: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ReminderAuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc(
        "list_reminder_preferences_by_ref",
        { _ref: refValue, _phone: phone },
      );
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as ReminderAuditRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [refValue, phone]);
  return <HistoryModal rows={rows} error={error} onClose={onClose} />;
}

/** Modal for /my (authenticated) — fetches via my_reminder_preference_audit */
export function ReminderHistoryForMyAppointmentModal({
  appointmentId,
  onClose,
}: {
  appointmentId: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ReminderAuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc(
        "my_reminder_preference_audit",
        { _appointment_id: appointmentId },
      );
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as ReminderAuditRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);
  return <HistoryModal rows={rows} error={error} onClose={onClose} />;
}

function HistoryModal({
  rows,
  error,
  onClose,
}: {
  rows: ReminderAuditRow[] | null;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">سجل تفضيلات التذكير</h3>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        {error ? (
          <div className="py-6 text-center text-sm text-destructive">{error}</div>
        ) : rows === null ? (
          <div className="py-8 text-center text-muted-foreground">جارٍ التحميل…</div>
        ) : (
          <ReminderPreferenceHistoryList rows={rows} />
        )}
      </div>
    </div>
  );
}
