"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { renderTemplate } from "@/lib/email-merge";
import { sendLeadEmail } from "./actions";
import type { EmailTemplate } from "@/lib/types";

const NO_TEMPLATE = "__none__";

export function SendLeadEmailButton({
  leadId,
  record,
  templates,
}: {
  leadId: string;
  record: Record<string, unknown>;
  templates: EmailTemplate[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const defaultTo = (record.work_email as string) || (record.personal_email as string) || "";
  const [templateId, setTemplateId] = useState(NO_TEMPLATE);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  function onTemplateChange(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (template) {
      setSubject(renderTemplate(template.subject, record));
      setBody(renderTemplate(template.body, record));
    }
  }

  function send() {
    if (!to) {
      toast.error("Enter a recipient email address");
      return;
    }
    startTransition(async () => {
      const result = await sendLeadEmail({
        leadId,
        templateId: templateId === NO_TEMPLATE ? null : templateId,
        to,
        subject,
        body,
      });
      if (!result.success) toast.error(result.error || "Failed to send email");
      else {
        toast.success("Email sent");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Email</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Email lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={(v) => v && onTemplateChange(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEMPLATE}>No template</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input
              type="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={isPending} onClick={send}>
            {isPending ? "Sending..." : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
