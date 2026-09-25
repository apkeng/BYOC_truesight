import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tickScheduledWorkflows } from "@/lib/scheduled-workflows";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await tickScheduledWorkflows(createAdminClient());
  return NextResponse.json(summary);
}
