import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Users, Activity, Tag as TagIcon, Filter } from "lucide-react";
import {
  getPatientAnalytics,
  listBranchesForAnalytics,
} from "@/lib/patients-analytics.functions";

export const Route = createFileRoute("/_authenticated/patients-analytics")({
  head: () => ({
    meta: [
      { title: "تحليلات المرضى | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PatientsAnalyticsPage,
});

const STATUS_LABEL: Record<string, string> = {
  active: "نشط",
  inactive: "غير نشط",
  archived: "مؤرشف",
  deceased: "متوفى",
};
const GENDER_LABEL: Record<string, string> = {
  male: "ذكر",
  female: "أنثى",
  other: "آخر",
  "غير محدد": "غير محدد",
};
const COLORS = [
  "hsl(var(--primary))",
  "hsl(142 71% 45%)",
  "hsl(217 91% 60%)",
  "hsl(38 92% 50%)",
  "hsl(0 84% 60%)",
  "hsl(280 65% 60%)",
  "hsl(180 60% 45%)",
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function PatientsAnalyticsPage() {
  const [branchId, setBranchId] = useState<string | null>(null);
  const [gender, setGender] = useState<"male" | "female" | "other" | null>(null);
  const [minAge, setMinAge] = useState<string>("");
  const [maxAge, setMaxAge] = useState<string>("");
  const [from, setFrom] = useState<string>(daysAgoISO(30));
  const [to, setTo] = useState<string>(todayISO());

  const branchesFn = useServerFn(listBranchesForAnalytics);
  const analyticsFn = useServerFn(getPatientAnalytics);

  const branchesQ = useQuery({
    queryKey: ["pa-branches"],
    queryFn: () => branchesFn(),
    staleTime: 60_000,
  });

  const filters = {
    branchId,
    gender,
    minAge: minAge ? Number(minAge) : null,
    maxAge: maxAge ? Number(maxAge) : null,
    from,
    to,
  };

  const q = useQuery({
    queryKey: ["patients-analytics", filters],
    queryFn: () => analyticsFn({ data: filters }),
  });

  const data = q.data;
  const branches = branchesQ.data ?? [];

  const statusChart = useMemo(
    () =>
      (data?.byStatus ?? []).map((s) => ({
        name: STATUS_LABEL[s.status] ?? s.status,
        value: s.count,
        key: s.status,
      })),
    [data],
  );
  const genderChart = useMemo(
    () =>
      (data?.byGender ?? []).map((g) => ({
        name: GENDER_LABEL[g.gender] ?? g.gender,
        value: g.count,
        key: g.gender,
      })),
    [data],
  );
  const branchChart = useMemo(
    () => (data?.byBranch ?? []).map((b) => ({ name: b.branch_name, عدد: b.count })),
    [data],
  );
  const ageChart = useMemo(
    () => (data?.byAgeGroup ?? []).map((a) => ({ name: a.group, عدد: a.count })),
    [data],
  );
  const tagChart = useMemo(
    () => (data?.byTag ?? []).map((t) => ({ name: t.tag, عدد: t.count })),
    [data],
  );
  const regChart = useMemo(
    () =>
      (data?.registrationsDaily ?? []).map((d) => ({
        day: d.day.slice(5),
        تسجيلات: d.count,
      })),
    [data],
  );
  const changeChart = useMemo(
    () =>
      (data?.statusChangesDaily ?? []).map((d) => ({
        day: d.day.slice(5),
        تغييرات: d.count,
      })),
    [data],
  );
  const changeBreakdown = useMemo(
    () =>
      (data?.statusChangeBreakdown ?? []).map((c) => ({
        name: STATUS_LABEL[c.to] ?? c.to,
        عدد: c.count,
      })),
    [data],
  );

  return (
    <div className="container-app py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Users className="h-6 w-6 text-primary" />
            تحليلات المرضى
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            توزيع الحالات والوسوم وتغيّرات الحالة خلال الفترة المحددة.
          </p>
        </div>
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          لوحة التحكم
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Filter className="h-4 w-4" /> الفلاتر
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">الفرع</label>
            <select
              value={branchId ?? ""}
              onChange={(e) => setBranchId(e.target.value || null)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">الجنس</label>
            <select
              value={gender ?? ""}
              onChange={(e) =>
                setGender((e.target.value || null) as "male" | "female" | "other" | null)
              }
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">الكل</option>
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
              <option value="other">آخر</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">أقل عمر</label>
            <input
              type="number"
              min={0}
              max={150}
              value={minAge}
              onChange={(e) => setMinAge(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">أعلى عمر</label>
            <input
              type="number"
              min={0}
              max={150}
              value={maxAge}
              onChange={(e) => setMaxAge(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">من تاريخ</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">إلى تاريخ</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      {q.isLoading && (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          جارٍ حساب التحليلات…
        </div>
      )}
      {q.error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center text-destructive">
          {(q.error as Error).message}
        </div>
      )}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="إجمالي المرضى" value={data.total} tone="primary" />
            <Kpi
              label="نشط"
              value={data.byStatus.find((s) => s.status === "active")?.count ?? 0}
              tone="success"
            />
            <Kpi
              label="مؤرشف"
              value={data.byStatus.find((s) => s.status === "archived")?.count ?? 0}
              tone="info"
            />
            <Kpi
              label="تغيّرات الحالة (الفترة)"
              value={data.statusChangesDaily.reduce((s, d) => s + d.count, 0)}
              tone="warning"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card title="توزيع الحالات">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={statusChart}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {statusChart.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <Legend items={statusChart.map((s, i) => ({ name: s.name, value: s.value, color: COLORS[i % COLORS.length] }))} />
            </Card>

            <Card title="توزيع الجنس">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={genderChart}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {genderChart.map((_, i) => (
                      <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <Legend items={genderChart.map((s, i) => ({ name: s.name, value: s.value, color: COLORS[(i + 2) % COLORS.length] }))} />
            </Card>

            <Card title="الفئات العمرية">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={ageChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="عدد" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="حسب الفرع">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={branchChart} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    type="number"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    width={110}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="عدد" fill="hsl(217 91% 60%)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="أعلى الوسوم" icon={TagIcon}>
              {tagChart.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">لا توجد وسوم بعد.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={tagChart} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      type="number"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      width={110}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="عدد" fill="hsl(142 71% 45%)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="تسجيلات المرضى اليومية">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={regChart}>
                  <defs>
                    <linearGradient id="fillReg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="تسجيلات"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#fillReg)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card title="تغيّرات حالة المرضى اليومية" icon={Activity}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={changeChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="تغييرات"
                    stroke="hsl(38 92% 50%)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {changeBreakdown.length > 0 && (
            <div className="mt-4">
              <Card title="التغييرات حسب الحالة المستهدفة">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={changeBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="عدد" fill="hsl(280 65% 60%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "primary" | "success" | "info" | "warning";
}) {
  const toneClass: Record<string, string> = {
    primary: "text-primary",
    success: "text-emerald-600 dark:text-emerald-400",
    info: "text-sky-600 dark:text-sky-400",
    warning: "text-amber-600 dark:text-amber-400",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${toneClass[tone]}`}>
        {value.toLocaleString("ar-SA")}
      </p>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {Icon ? <Icon className="h-4 w-4 text-primary" /> : null}
        {title}
      </h2>
      {children}
    </div>
  );
}

function Legend({
  items,
}: {
  items: { name: string; value: number; color: string }[];
}) {
  return (
    <div className="mt-1 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
      {items.map((s) => (
        <span key={s.name} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: s.color }}
          />
          {s.name} ({s.value})
        </span>
      ))}
    </div>
  );
}
