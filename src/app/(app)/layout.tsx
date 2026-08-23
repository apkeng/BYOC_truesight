import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { OBJECTS, OBJECT_KEYS, type ObjectKey } from "@/lib/objects";
import type { Profile } from "@/lib/types";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const countEntries = await Promise.all(
    OBJECT_KEYS.map(async (key) => {
      const { count } = await supabase
        .from(OBJECTS[key].table)
        .select("id", { count: "exact", head: true });
      return [key, count ?? 0] as const;
    })
  );
  const counts = Object.fromEntries(countEntries) as Record<ObjectKey, number>;

  return (
    <AppShell profile={profile as Profile} counts={counts}>
      {children}
    </AppShell>
  );
}
