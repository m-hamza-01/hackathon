import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isJiraConnected } from "@/lib/jira-connection";

// force-dynamic is essential: without it Next.js prerenders this layout at
// build time. On Railway, data/ doesn't exist at build time, so the
// "not connected" redirect would be baked into the static output forever.
export const dynamic = "force-dynamic";

export default async function GatedLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get("foreman_demo")?.value === "1";

  if (!isJiraConnected() && !isDemo) {
    redirect("/connect");
  }

  return <>{children}</>;
}
