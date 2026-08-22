"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { TemplateFields } from "./template-fields";
import { updateEmailTemplate, deleteEmailTemplate } from "./actions";
import type { EmailTemplate } from "@/lib/types";

export function EmailTemplateList({ templates }: { templates: EmailTemplate[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  function openEdit(t: EmailTemplate) {
    setEditing(t);
    setName(t.name);
    setSubject(t.subject);
    setBody(t.body);
  }

  function saveEdit() {
    if (!editing) return;
    startTransition(async () => {
      const result = await updateEmailTemplate(editing.id, { name, subject, body });
      if (!result.success) toast.error(result.error || "Failed to update template");
      else {
        toast.success("Template updated");
        setEditing(null);
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this email template?")) return;
    startTransition(async () => {
      const result = await deleteEmailTemplate(id);
      if (!result.success) toast.error(result.error || "Failed to delete");
      else {
        toast.success("Template deleted");
        router.refresh();
      }
    });
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No email templates yet.
              </TableCell>
            </TableRow>
          )}
          {templates.map((t) => (
            <TableRow key={t.id}>
              <TableCell>{t.name}</TableCell>
              <TableCell className="text-muted-foreground">{t.subject}</TableCell>
              <TableCell className="space-x-2 text-right">
                <Button variant="outline" size="sm" disabled={isPending} onClick={() => openEdit(t)}>
                  Edit
                </Button>
                <Button variant="destructive" size="sm" disabled={isPending} onClick={() => remove(t.id)}>
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
            <DialogTitle>Edit template</DialogTitle>
          </DialogHeader>
          <TemplateFields
            name={name}
            onNameChange={setName}
            subject={subject}
            onSubjectChange={setSubject}
            body={body}
            onBodyChange={setBody}
          />
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
