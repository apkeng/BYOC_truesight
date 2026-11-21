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
 * is worse than one that is plainly labelled. The editors show and take IST
 * and convert (utcToIst / istToUtc below); what is stored is always UTC.
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

/**
 * The admin UI shows and takes daily times in India Standard Time, while the
 * stored at_time (and the engine above) stays UTC. IST is a fixed UTC+05:30
 * with no daylight saving, so the conversion is a plain shift that never moves.
 */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

function shiftTime(hhmm: string, deltaMinutes: number): string {
  const [h, m] = hhmm.split(":").map((v) => Number(v) || 0);
  const total = (((h * 60 + m + deltaMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Stored UTC "HH:MM" -> the IST "HH:MM" shown in the editors. */
export function utcToIst(hhmm: string): string {
  return shiftTime(hhmm, IST_OFFSET_MINUTES);
}

/** IST "HH:MM" typed in an editor -> the UTC "HH:MM" that gets stored. */
export function istToUtc(hhmm: string): string {
  return shiftTime(hhmm, -IST_OFFSET_MINUTES);
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
  return `daily at ${utcToIst(typeof c.at_time === "string" ? c.at_time : "09:00")} IST`;
}
