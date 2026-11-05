import { logoutAction } from "@/app/actions";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/session";
import { aiEnv, isLocalMode } from "@/lib/config";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <AppShell userLabel={user.email ?? user.id} localMode={isLocalMode()} aiProvider={aiEnv().provider} logout={logoutAction}>
      {children}
    </AppShell>
  );
}
