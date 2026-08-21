"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OBJECTS, OBJECT_KEYS } from "@/lib/objects";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications-bell";
import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/utils";
import { Shield } from "lucide-react";
import type { Profile } from "@/lib/types";

export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen w-full">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-background">
        <div className="border-b p-4 text-lg font-semibold">CRM</div>
        <nav className="flex-1 space-y-1 p-2">
          {OBJECT_KEYS.map((key) => {
            const def = OBJECTS[key];
            const href = `/${key}`;
            const active = pathname?.startsWith(href);
            return (
              <Link
                key={key}
                href={href}
                className={cn(
                  "block rounded px-3 py-2 text-sm hover:bg-muted",
                  active && "bg-muted font-medium"
                )}
              >
                {def.labelPlural}
              </Link>
            );
          })}
          {profile.role === "admin" && (
            <Link
              href="/admin"
              className={cn(
                "mt-4 flex items-center gap-2 rounded px-3 py-2 text-sm hover:bg-muted",
                pathname?.startsWith("/admin") && "bg-muted font-medium"
              )}
            >
              <Shield className="size-4" /> Admin
            </Link>
          )}
        </nav>
        <div className="border-t p-3">
          <div className="mb-2 text-xs text-muted-foreground truncate">
            {profile.full_name || profile.email} · {profile.role}
          </div>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end border-b bg-background px-4 py-2">
          <NotificationsBell userId={profile.id} />
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
