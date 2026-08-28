"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { createCadence } from "./actions";

export function NewCadenceForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createCadence({ name, description });
      if (!result.success || !result.id) {
        toast.error(result.error || "Failed to create cadence");
        return;
      }
      toast.success("Cadence created — add triggers and steps next");
      router.push(`/admin/cadences/${result.id}`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New cadence</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create cadence"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
