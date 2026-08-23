"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { OBJECTS, type ObjectKey } from "@/lib/objects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldValueDisplay } from "@/components/field-value-display";

export function FieldViewPanel({
  objectKey,
  record,
}: {
  objectKey: ObjectKey;
  record: Record<string, unknown>;
}) {
  const def = OBJECTS[objectKey];
  const [selected, setSelected] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let ignore = false;

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("user_field_views")
        .select("fields")
        .eq("user_id", user.id)
        .eq("object_name", def.table)
        .maybeSingle();
      if (ignore) return;
      const stored = (data?.fields as string[] | undefined) || [];
      const known = def.fields.map((f) => f.name);
      const valid = stored.filter((f) => known.includes(f));
      setSelected(valid);
    });

    return () => {
      ignore = true;
    };
  }, [def.table, def.fields]);

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    const { error } = await supabase.from("user_field_views").upsert(
      {
        user_id: user.id,
        object_name: def.table,
        fields: draft,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,object_name" }
    );
    setSaving(false);
    if (error) {
      toast.error("Could not save view");
      return;
    }
    setSelected(draft);
    setOpen(false);
    toast.success("View saved");
  }

  function toggle(name: string) {
    setDraft((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  if (selected === null) return null;

  const shownFields = def.fields.filter((f) => selected.includes(f.name));

  return (
    <Card className="h-fit w-full lg:w-80">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>My View</CardTitle>
        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (o) setDraft(selected);
          }}
        >
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm">
                <SlidersHorizontal className="size-3.5" />
                Choose fields
              </Button>
            }
          />
          <PopoverContent align="end" className="w-64">
            <div className="max-h-72 space-y-2 overflow-y-auto p-1">
              {def.fields.map((f) => (
                <label key={f.name} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={draft.includes(f.name)} onCheckedChange={() => toggle(f.name)} />
                  {f.label}
                </label>
              ))}
            </div>
            <Button size="sm" className="mt-2 w-full" disabled={saving} onClick={save}>
              {saving ? "Saving..." : "Save view"}
            </Button>
          </PopoverContent>
        </Popover>
      </CardHeader>
      <CardContent className="space-y-3">
        {shownFields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No fields selected yet. Use &quot;Choose fields&quot; to build your view.
          </p>
        ) : (
          shownFields.map((f) => (
            <div key={f.name}>
              <p className="text-xs font-medium text-muted-foreground">{f.label}</p>
              <FieldValueDisplay field={f} value={record[f.name]} />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
