import { createClient } from "@/lib/supabase/server";
import { formatShortDate } from "@/lib/format";
import { DeleteLeadListButton } from "@/components/delete-lead-list-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function LeadListsPage() {
  const supabase = await createClient();

  const { data: lists } = await supabase
    .from("lead_lists")
    .select("id, name, created_date, lead_list_members(count)")
    .order("created_date", { ascending: false });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Lead Lists</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lists you&apos;ve created from the Leads view.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 pl-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Name
              </TableHead>
              <TableHead className="h-11 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Leads
              </TableHead>
              <TableHead className="h-11 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Created
              </TableHead>
              <TableHead className="h-11 pr-4 text-right text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!lists || lists.length === 0) && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No lists yet. Select leads from the Leads view and choose &quot;Move to List&quot;
                  to create one.
                </TableCell>
              </TableRow>
            )}
            {lists?.map((list) => (
              <TableRow key={list.id}>
                <TableCell className="py-3 pl-4 font-medium text-foreground">{list.name}</TableCell>
                <TableCell className="py-3 tabular-nums">
                  {(list.lead_list_members as { count: number }[] | null)?.[0]?.count ?? 0}
                </TableCell>
                <TableCell className="py-3 text-muted-foreground">
                  {formatShortDate(list.created_date)}
                </TableCell>
                <TableCell className="py-3 pr-4 text-right">
                  <DeleteLeadListButton listId={list.id} name={list.name} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
