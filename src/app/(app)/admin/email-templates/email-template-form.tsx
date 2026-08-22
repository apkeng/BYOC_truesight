"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TemplateFields } from "./template-fields";
import { createEmailTemplate } from "./actions";

export function EmailTemplateForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createEmailTemplate({
        object_name: "leads",
        name,
        subject,
        body,
      });
      if (!result.success) toast.error(result.error || "Failed to create template");
      else {
        toast.success("Template created");
        setName("");
        setSubject("");
        setBody("");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New email template</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <TemplateFields
            name={name}
            onNameChange={setName}
            subject={subject}
            onSubjectChange={setSubject}
            body={body}
            onBodyChange={setBody}
          />
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create template"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
