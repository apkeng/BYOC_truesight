"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AlertFields, type AlertFieldsValue, type AlertUserOption } from "./alert-fields";
import { createEmailAlert } from "./actions";
import type { EmailTemplate } from "@/lib/types";

const EMPTY: AlertFieldsValue = {
  name: "",
  template_id: null,
  recipient_type: "internal",
  recipient_user_ids: [],
  active: true,
};

export function EmailAlertForm({
  templates,
  users,
}: {
  templates: EmailTemplate[];
  users: AlertUserOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState<AlertFieldsValue>(EMPTY);

  function patch(p: Partial<AlertFieldsValue>) {
    setValue((prev) => ({ ...prev, ...p }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createEmailAlert(value);
      if (!result.success) {
        toast.error(result.error || "Failed to create alert");
        return;
      }
      toast.success("Email alert created");
      setValue(EMPTY);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New email alert</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <AlertFields value={value} onChange={patch} templates={templates} users={users} />
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create alert"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
