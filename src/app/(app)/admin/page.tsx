import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const SECTIONS = [
  { href: "/admin/users", title: "Users", description: "Invite users and manage roles" },
  { href: "/admin/import", title: "Data Import", description: "Bulk create or update records from a spreadsheet" },
  { href: "/admin/custom-fields", title: "Custom Fields", description: "Add fields per object" },
  { href: "/admin/picklists", title: "Picklists", description: "Manage picklist values and defaults" },
  { href: "/admin/field-permissions", title: "Field Permissions", description: "Control what sales users can edit" },
  { href: "/admin/page-layouts", title: "Page Layouts", description: "Control field order per object" },
  { href: "/admin/workflows", title: "Workflows", description: "Field updates, notifications, webhooks" },
];

export default function AdminHomePage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Admin</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition-colors hover:bg-muted">
              <CardHeader>
                <CardTitle>{s.title}</CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
