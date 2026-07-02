import Link from "next/link";
import { cookies } from "next/headers";
import AdminApp from "@/components/admin-app";
import LoginPage from "@/components/login-page";
import { errorFields, getLogger } from "@/lib/logger";
import { withPageLogging } from "@/lib/page-logging";
import { getOptionalSessionUser } from "@/lib/server-session";
import { isThemeId } from "@/lib/ui-options";

const adminPageLogger = getLogger("admin-page");

export default async function AdminPage() {
  return withPageLogging("/admin", async (pageLogContext) => {
  try {
    const user = await getOptionalSessionUser();
    const themeCookie = (await cookies()).get("kanban_theme")?.value;
    const initialThemeId = isThemeId(themeCookie) ? themeCookie : "notion";
    if (!user) {
      return <LoginPage />;
    }
    pageLogContext.setContext({ userId: user.id });

    if (user.role !== "super_admin" && user.role !== "project_manager" && user.role !== "development_manager") {
      return (
        <main className="grid min-h-screen place-items-center bg-slate-50 px-6 text-slate-900">
          <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#0f766e]">403</p>
            <h1 className="mt-3 text-2xl font-semibold">无权访问后台管理</h1>
            <p className="mt-3 text-slate-500">当前账号无访问权限。</p>
            <Link href="/" prefetch={false} className="mt-6 inline-flex rounded-full bg-[#0f766e] px-5 py-2 text-sm font-semibold text-white">进入看板</Link>
          </section>
        </main>
      );
    }

    return <AdminApp currentUser={user} initialThemeId={initialThemeId} />;
  } catch (error) {
    adminPageLogger.error("admin page render failed", {
      requestId: pageLogContext.requestId,
      path: "/admin",
      ...errorFields(error),
    });
    throw error;
  }
  });
}
