import { createClient } from "@/lib/supabase/server";
import { EmailTemplateForm } from "./email-template-form";
import { EmailTemplateList } from "./email-template-list";
import type { EmailTemplate } from "@/lib/types";

export default async function EmailTemplatesAdminPage() {
  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("email_templates")
    .select("*")
    .eq("object_name", "leads")
    .order("name");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Email Templates</h1>
      <p className="text-sm text-muted-foreground">
        Templates sales users can use to email leads. Insert lead fields with the buttons above the
        subject/body, e.g. <code>{"{{name}}"}</code>.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <EmailTemplateForm />
        <div className="rounded-md border bg-background">
          <EmailTemplateList templates={(templates as EmailTemplate[]) || []} />
        </div>
      </div>
    </div>
  );
}
