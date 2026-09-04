"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mergeableFields } from "@/lib/email-merge";
import { uploadEmailPoster } from "./actions";
import type { EmailAttachment } from "@/lib/types";

const LEAD_MERGE_FIELDS = mergeableFields("leads");

/** Subject + body inputs with click-to-insert lead field tags and link/poster attachments, shared by the create form and edit dialog. */
export function TemplateFields({
  name,
  onNameChange,
  subject,
  onSubjectChange,
  body,
  onBodyChange,
  attachments,
  onAttachmentsChange,
}: {
  name: string;
  onNameChange: (v: string) => void;
  subject: string;
  onSubjectChange: (v: string) => void;
  body: string;
  onBodyChange: (v: string) => void;
  attachments: EmailAttachment[];
  onAttachmentsChange: (v: EmailAttachment[]) => void;
}) {
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);

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

  function addLink() {
    if (!linkName.trim() || !linkUrl.trim()) {
      toast.error("Enter both a label and a URL");
      return;
    }
    onAttachmentsChange([
      ...attachments,
      { id: crypto.randomUUID(), type: "link", name: linkName.trim(), url: linkUrl.trim() },
    ]);
    setLinkName("");
    setLinkUrl("");
  }

  function removeAttachment(id: string) {
    onAttachmentsChange(attachments.filter((a) => a.id !== id));
  }

  async function onPosterSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadEmailPoster(formData);
      if (!result.success || !result.url) {
        toast.error(result.error || "Failed to upload poster");
        return;
      }
      onAttachmentsChange([
        ...attachments,
        { id: crypto.randomUUID(), type: "poster", name: result.name || file.name, url: result.url },
      ]);
      toast.success("Poster added");
    } finally {
      setUploading(false);
    }
  }

  const links = attachments.filter((a) => a.type === "link");
  const posters = attachments.filter((a) => a.type === "poster");

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

      <div className="space-y-2 rounded-md border p-3">
        <Label>Attachments</Label>
        <p className="text-xs text-muted-foreground">
          Links are added as buttons and posters as images at the end of the email.
        </p>

        {attachments.length > 0 && (
          <ul className="space-y-1.5">
            {links.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  🔗 {a.name} <span className="text-muted-foreground">({a.url})</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAttachment(a.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
            {posters.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 truncate">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={a.name} className="h-8 w-8 rounded object-cover" />
                  {a.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAttachment(a.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Link label</Label>
            <Input
              className="h-8 w-36"
              value={linkName}
              onChange={(e) => setLinkName(e.target.value)}
              placeholder="View website"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Link URL</Label>
            <Input
              className="h-8 w-56"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addLink}>
            Add link
          </Button>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPosterSelected}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? "Uploading..." : "Add poster image"}
          </Button>
        </div>
      </div>
    </div>
  );
}
