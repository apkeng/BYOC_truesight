import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { OBJECTS, OBJECT_KEYS } from "@/lib/objects";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function DashboardPage() {
  const supabase = await createClient();

  const counts = await Promise.all(
    OBJECT_KEYS.map(async (key) => {
      const { count } = await supabase
        .from(OBJECTS[key].table)
        .select("id", { count: "exact", head: true });
      return [key, count ?? 0] as const;
    })
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {counts.map(([key, count]) => (
          <Link key={key} href={`/${key}`}>
            <Card className="transition-colors hover:bg-muted">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  {OBJECTS[key].labelPlural}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{count}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
