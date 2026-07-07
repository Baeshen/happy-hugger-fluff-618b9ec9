import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { I18nProvider } from "@/lib/i18n";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Toaster } from "sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          الصفحة غير موجودة / Page not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">الصفحة التي تبحث عنها غير متاحة.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            الصفحة الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">لم يتم تحميل الصفحة</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          حدث خطأ، حاول التحديث أو العودة للرئيسية.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            حاول مجددًا
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium"
          >
            الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "مجمع باعشن الطبي — رعايتك تبدأ هنا | Baeshen Medical" },
      {
        name: "description",
        content:
          "مجمع طبي معتمد من CBAHI في صبيا بمنطقة جازان. خدمات طبية عامة وتخصصية، صيدلية داخلية، حجز إلكتروني وتوصيل أدوية.",
      },
      { name: "author", content: "Baeshen Medical Complex" },
      { property: "og:title", content: "مجمع باعشن الطبي — رعايتك تبدأ هنا | Baeshen Medical" },
      {
        property: "og:description",
        content: "خدمات طبية تخصصية في صبيا، جازان. احجز موعدك أو اطلب دواءك أونلاين.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "مجمع باعشن الطبي — رعايتك تبدأ هنا | Baeshen Medical" },
      { name: "description", content: "احجز موعدك مع أطباء استشاريين في صبيا، جازان أو اطلب دواءك من صيدليات باعشن. مجمع طبي معتمد من CBAHI." },
      { property: "og:description", content: "احجز موعدك مع أطباء استشاريين في صبيا، جازان أو اطلب دواءك من صيدليات باعشن. مجمع طبي معتمد من CBAHI." },
      { name: "twitter:description", content: "احجز موعدك مع أطباء استشاريين في صبيا، جازان أو اطلب دواءك من صيدليات باعشن. مجمع طبي معتمد من CBAHI." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/da5ecdb6-8fc6-4806-a4f3-419040820761/id-preview-7a856abf--550c7bc5-80b4-4118-853f-28cc7bd42f26.lovable.app-1783385951418.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/da5ecdb6-8fc6-4806-a4f3-419040820761/id-preview-7a856abf--550c7bc5-80b4-4118-853f-28cc7bd42f26.lovable.app-1783385951418.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1">
            <Outlet />
          </main>
          <Footer />
          <Toaster position="top-center" richColors closeButton />
        </div>
      </I18nProvider>
    </QueryClientProvider>
  );
}
