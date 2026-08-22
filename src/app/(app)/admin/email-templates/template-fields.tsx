"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { mergeableFields } from "@/lib/email-merge";

const LEAD_MERGE_FIELDS = mergeableFields("leads");

/** Subject + body inputs with click-to-insert lead field tags, shared by the create form and edit dialog. */
export function TemplateFields({
  name,
  onNameChange,
  subject,
  onSubjectChange,
  body,
  onBodyChange,
}: {
  name: string;
  onNameChange: (v: string) => void;
  subject: string;
  onSubjectChange: (v: string) => void;
  body: string;
  onBodyChange: (v: string) => void;
}) {
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  function insertTag(fieldName: string) {
    const tag = `{{${fieldName}}}`;
    const el = activeField === "subject" ? subjectRef.current : bodyRef.current;
    const current = activeField === "subject" ? subject : body;
    const set = activeField === "subject" ? onSubjectChange : onBodyChange;

    if (!el) {
      set(current + tag);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + tag + current.slice(end);
    set(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + tag.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Template name</Label>
        <Input required value={name} onChange={(e) => onNameChange(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Lead fields</Label>
        <div className="flex flex-wrap gap-1.5">
          {LEAD_MERGE_FIELDS.map((f) => (
            <Badge
              key={f.name}
              variant="secondary"
              className="cursor-pointer"
              onClick={() => insertTag(f.name)}
            >
              + {f.label}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Click a field to insert it into the subject or body at the cursor.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Subject</Label>
        <Input
          ref={subjectRef}
          required
          value={subject}
          onFocus={() => setActiveField("subject")}
          onChange={(e) => onSubjectChange(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Body</Label>
        <Textarea
          ref={bodyRef}
          required
          rows={8}
          value={body}
          onFocus={() => setActiveField("body")}
          onChange={(e) => onBodyChange(e.target.value)}
        />
      </div>
    </div>
  );
}
