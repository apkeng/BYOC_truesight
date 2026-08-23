"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, ChevronRight, LogOut } from "lucide-react";
import { OBJECTS, isObjectKey, type ObjectKey } from "@/lib/objects";
import { NAV_SECTIONS, sectionForObject } from "@/lib/nav";
import { NotificationsBell } from "@/components/notifications-bell";
import { SearchBar } from "@/components/search-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/app/login/actions";
import { avatarColorForId, initials } from "@/lib/badge-colors";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

export function AppShell({
  profile,
  counts,
  children,
}: {
  profile: Profile;
  counts: Record<ObjectKey, number>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const firstSegment = pathname?.split("/")[1] || "";
  const currentObject: ObjectKey | null = isObjectKey(firstSegment) ? firstSegment : null;

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-sidebar px-3 py-4">
        <div className="flex items-center gap-2 px-2 pb-6">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
            C
          </div>
          <span className="text-lg font-semibold">CRM</span>
        </div>

        <nav className="flex-1 space-y-6">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <div className="px-2 pb-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.keys.map((key) => {
                  const def = OBJECTS[key];
                  const href = `/${key}`;
                  const active = pathname?.startsWith(href);
                  return (
                    <Link
                      key={key}
                      href={href}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent",
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-sidebar-foreground"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            active ? "bg-primary" : "bg-muted-foreground/40"
                          )}
                        />
                        {def.labelPlural}
                      </span>
                      {counts[key] > 0 && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {counts[key]}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {profile.role === "admin" && (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sidebar-accent",
              pathname?.startsWith("/admin")
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground"
            )}
          >
            <Shield className="size-4" /> Admin
          </Link>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="mt-3 flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-sidebar-accent" />
            }
          >
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white",
                avatarColorForId(profile.id)
              )}
            >
              {initials(profile.full_name || profile.email)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {profile.full_name || profile.email}
              </div>
              <div className="truncate text-xs text-muted-foreground capitalize">
                {profile.role === "admin" ? "Admin" : "Account Executive"}
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem
              variant="destructive"
              render={<form action={signOut} />}
            >
              <button type="submit" className="flex w-full items-center gap-1.5">
                <LogOut /> Sign out
              </button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-border bg-background px-6 py-3">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {currentObject ? (
              <>
                <span>{sectionForObject(currentObject)}</span>
                <ChevronRight className="size-3.5" />
                <span className="font-medium text-foreground">
                  {OBJECTS[currentObject].labelPlural}
                </span>
              </>
            ) : (
              <span className="font-medium text-foreground">
                {pathname?.startsWith("/admin") ? "Admin" : "Dashboard"}
              </span>
            )}
          </div>
          <div className="flex flex-1 justify-center">
            {currentObject && (
              <SearchBar
                basePath={`/${currentObject}`}
                placeholder={`Search ${OBJECTS[currentObject].labelPlural.toLowerCase()}`}
              />
            )}
          </div>
          <NotificationsBell userId={profile.id} />
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
