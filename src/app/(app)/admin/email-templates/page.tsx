import { createClient } from "@/lib/supabase/server";
import { EmailTemplateForm } from "./email-template-form";
import { EmailTemplateList } from "./email-template-list";
import { EmailAlertForm } from "./email-alert-form";
import { EmailAlertList } from "./email-alert-list";
import type { AlertUserOption } from "./alert-fields";
import type { EmailAlert, EmailTemplate } from "@/lib/types";

export default async function EmailTemplatesAdminPage() {
  const supabase = await createClient();
  const [{ data: templates }, { data: alerts }, { data: users }] = await Promise.all([
    supabase.from("email_templates").select("*").eq("object_name", "leads").order("name"),
    supabase.from("email_alerts").select("*").eq("object_name", "leads").order("name"),
    supabase.from("profiles").select("id, email, full_name").order("full_name"),
  ]);

  const templateList = (templates as EmailTemplate[]) || [];
  const userList = (users as AlertUserOption[]) || [];

  return (
    <div className="space-y-10">
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Email Templates</h1>
        <p className="text-sm text-muted-foreground">
          Templates sales users can use to email leads. Insert lead fields with the buttons above the
          subject/body, e.g. <code>{"{{name}}"}</code>. Add link buttons and poster images in the
          Attachments section &mdash; they&apos;re appended to the email when it&apos;s sent.
        </p>
        <div className="grid gap-6 lg:grid-cols-2">
          <EmailTemplateForm />
          <div className="rounded-md border bg-background">
            <EmailTemplateList templates={templateList} />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Email Alerts</h2>
        <p className="text-sm text-muted-foreground">
          A single email, sent from one of the templates above, to either hand-picked internal users
          or the lead itself. An alert does nothing on its own &mdash; attach it to a workflow on
          Leads (trigger type <code>Email alert</code>) and it fires whenever a lead matches that
          workflow&apos;s condition. Every send is recorded in the email log.
        </p>
        <div className="grid gap-6 lg:grid-cols-2">
          <EmailAlertForm templates={templateList} users={userList} />
          <div className="rounded-md border bg-background">
            <EmailAlertList
              alerts={(alerts as EmailAlert[]) || []}
              templates={templateList}
              users={userList}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
