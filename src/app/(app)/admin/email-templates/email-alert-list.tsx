"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertFields, type AlertFieldsValue, type AlertUserOption } from "./alert-fields";
import { updateEmailAlert, deleteEmailAlert } from "./actions";
import type { EmailAlert, EmailTemplate } from "@/lib/types";

export function EmailAlertList({
  alerts,
  templates,
  users,
}: {
  alerts: EmailAlert[];
  templates: EmailTemplate[];
  users: AlertUserOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<EmailAlert | null>(null);
  const [value, setValue] = useState<AlertFieldsValue | null>(null);

  function openEdit(a: EmailAlert) {
    setEditing(a);
    setValue({
      name: a.name,
      template_id: a.template_id,
      recipient_type: a.recipient_type,
      recipient_user_ids: a.recipient_user_ids || [],
      active: a.active,
    });
  }

  function patch(p: Partial<AlertFieldsValue>) {
    setValue((prev) => (prev ? { ...prev, ...p } : prev));
  }

  function saveEdit() {
    if (!editing || !value) return;
    startTransition(async () => {
      const result = await updateEmailAlert(editing.id, value);
      if (!result.success) {
        toast.error(result.error || "Failed to update alert");
        return;
      }
      toast.success("Alert updated");
      setEditing(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this email alert? Workflows pointing at it will stop sending.")) return;
    startTransition(async () => {
      const result = await deleteEmailAlert(id);
      if (!result.success) toast.error(result.error || "Failed to delete");
      else {
        toast.success("Alert deleted");
        router.refresh();
      }
    });
  }

  /** What the alert sends, in one line, so the table answers "who gets this?". */
  function describeRecipients(a: EmailAlert) {
    if (a.recipient_type === "lead") return "The lead itself";
    const count = (a.recipient_user_ids || []).length;
    const names = (a.recipient_user_ids || [])
      .map((id) => users.find((u) => u.id === id))
      .filter((u): u is AlertUserOption => !!u)
      .map((u) => u.full_name || u.email);
    if (names.length === 0) return count === 0 ? "No recipients" : `${count} user(s)`;
    return names.join(", ");
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Recipients</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {alerts.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No email alerts yet.
              </TableCell>
            </TableRow>
          )}
          {alerts.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                <span className="flex items-center gap-2">
                  {a.name}
                  {!a.active && <Badge variant="secondary">Off</Badge>}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {templates.find((t) => t.id === a.template_id)?.name ?? (
                  <span className="text-destructive">Template deleted</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{describeRecipients(a)}</TableCell>
              <TableCell className="space-x-2 text-right">
                <Button variant="outline" size="sm" disabled={isPending} onClick={() => openEdit(a)}>
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isPending}
                  onClick={() => remove(a.id)}
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit email alert</DialogTitle>
          </DialogHeader>
          {value && (
            <AlertFields value={value} onChange={patch} templates={templates} users={users} />
          )}
          <DialogFooter>
            <Button disabled={isPending} onClick={saveEdit}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
