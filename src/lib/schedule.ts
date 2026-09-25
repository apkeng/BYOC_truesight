/**
 * The "is this schedule due yet?" rule, shared by cadence scheduled triggers
 * and scheduled workflows so both read a schedule the same way.
 *
 * Two shapes, both stored as plain JSON on the owning row:
 *   { schedule_type: "interval", interval_minutes: 60 }  - every N minutes
 *   { schedule_type: "daily",    at_time: "09:00" }      - once a day, UTC
 *
 * "daily" is UTC on purpose: the engine is driven by a cron that has no user
 * and therefore no timezone, and a schedule that silently shifts twice a year
 * is worse than one that is plainly labelled UTC in the UI.
 */

export interface ScheduleConfig {
  schedule_type?: "daily" | "interval";
  at_time?: string;
  interval_minutes?: number;
}

/** Nothing has ever run it, or it last ran long enough ago to be due again. */
export function isScheduleDue(
  config: Record<string, unknown> | null | undefined,
  lastRunAt: string | null,
  now: Date
): boolean {
  const c = (config || {}) as Record<string, unknown>;
  const lastRun = lastRunAt ? new Date(lastRunAt) : null;

  if (c.schedule_type === "interval") {
    const intervalMinutes = Number(c.interval_minutes) || 60;
    if (!lastRun) return true;
    return now.getTime() - lastRun.getTime() >= intervalMinutes * 60000;
  }

  // daily
  const atTime = typeof c.at_time === "string" ? c.at_time : "09:00";
  const [h, m] = atTime.split(":").map((v) => Number(v) || 0);
  const dueToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m));
  if (now.getTime() < dueToday.getTime()) return false;
  if (!lastRun) return true;
  return lastRun.getTime() < dueToday.getTime();
}

/** One-line plain-English schedule, for list rows and form hints. */
export function describeSchedule(config: Record<string, unknown> | null | undefined): string {
  const c = (config || {}) as Record<string, unknown>;
  if (c.schedule_type === "interval") {
    const minutes = Number(c.interval_minutes) || 60;
    if (minutes % 1440 === 0) return `every ${minutes / 1440} day(s)`;
    if (minutes % 60 === 0) return `every ${minutes / 60} hour(s)`;
    return `every ${minutes} min`;
  }
  return `daily at ${typeof c.at_time === "string" ? c.at_time : "09:00"} UTC`;
}
