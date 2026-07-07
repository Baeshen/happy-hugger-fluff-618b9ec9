import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { logAuthEvent } from "@/lib/auth-log.functions";

const search = z.object({ redirect: z.string().optional() });

function safeLog(input: Parameters<typeof logAuthEvent>[0] extends { data: infer D } ? D : never) {
  logAuthEvent({ data: input } as any).catch(() => {});
}

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | مجمع باعشن الطبي" },
      { name: "description", content: "تسجيل دخول الفريق الطبي والإداري لمجمع باعشن." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: redirect ?? "/admin" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") navigate({ to: redirect ?? "/admin" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, redirect]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data: signup, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/admin",
            data: { full_name: fullName },
          },
        });
        if (error) {
          safeLog({ action: "signup_failed", email, metadata: { error: error.message } });
          throw error;
        }
        safeLog({ action: "signup_success", email, user_id: signup.user?.id ?? null });
        toast.success("تم إنشاء الحساب. تحقق من بريدك الإلكتروني إن لزم.");
      } else {
        const { data: signin, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          safeLog({ action: "login_failed", email, metadata: { error: error.message } });
          throw error;
        }
        safeLog({ action: "login_success", email, user_id: signin.user?.id ?? null });
        toast.success("مرحبًا بعودتك");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-app min-h-[70vh] py-16">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground font-bold">
            ب
          </div>
          <h1 className="mt-4 text-2xl font-bold">
            {mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">لوحة تحكم مجمع باعشن الطبي</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {mode === "signup" && (
            <div>
              <label className="mb-1 block text-sm font-medium">الاسم الكامل</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">البريد الإلكتروني</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">كلمة المرور</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? "..." : mode === "signin" ? "دخول" : "تسجيل"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? (
            <>
              ليس لديك حساب؟{" "}
              <button className="text-primary font-medium" onClick={() => setMode("signup")}>
                أنشئ حسابًا
              </button>
            </>
          ) : (
            <>
              لديك حساب؟{" "}
              <button className="text-primary font-medium" onClick={() => setMode("signin")}>
                سجل الدخول
              </button>
            </>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:text-primary">
            ← العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
