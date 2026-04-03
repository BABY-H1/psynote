import { eq, and, desc, gte, lte, ne, lt, gt } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { counselorAvailability, appointments } from '../../db/schema.js';
import { NotFoundError, ValidationError, ConflictError } from '../../lib/errors.js';

export async function listAvailability(orgId: string, counselorId: string) {
  return db
    .select()
    .from(counselorAvailability)
    .where(and(
      eq(counselorAvailability.orgId, orgId),
      eq(counselorAvailability.counselorId, counselorId),
    ))
    .orderBy(counselorAvailability.dayOfWeek, counselorAvailability.startTime);
}

export async function createSlot(input: {
  orgId: string;
  counselorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  sessionType?: string;
}) {
  if (input.dayOfWeek < 0 || input.dayOfWeek > 6) {
    throw new ValidationError('dayOfWeek must be 0-6');
  }
  if (input.startTime >= input.endTime) {
    throw new ValidationError('startTime must be before endTime');
  }

  // Check overlap with existing slots on the same day
  const existing = await db
    .select()
    .from(counselorAvailability)
    .where(and(
      eq(counselorAvailability.orgId, input.orgId),
      eq(counselorAvailability.counselorId, input.counselorId),
      eq(counselorAvailability.dayOfWeek, input.dayOfWeek),
    ));

  for (const slot of existing) {
    if (input.startTime < slot.endTime && input.endTime > slot.startTime) {
      throw new ConflictError(`时段与已有排班冲突: ${slot.startTime}-${slot.endTime}`);
    }
  }

  const [slot] = await db.insert(counselorAvailability).values({
    orgId: input.orgId,
    counselorId: input.counselorId,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    sessionType: input.sessionType || null,
  }).returning();

  return slot;
}

export async function updateSlot(slotId: string, input: {
  startTime?: string;
  endTime?: string;
  sessionType?: string | null;
  isActive?: boolean;
}) {
  const [existing] = await db
    .select()
    .from(counselorAvailability)
    .where(eq(counselorAvailability.id, slotId))
    .limit(1);

  if (!existing) throw new NotFoundError('AvailabilitySlot', slotId);

  const newStart = input.startTime ?? existing.startTime;
  const newEnd = input.endTime ?? existing.endTime;

  if (newStart >= newEnd) {
    throw new ValidationError('startTime must be before endTime');
  }

  // Check overlap if time changed
  if (input.startTime !== undefined || input.endTime !== undefined) {
    const others = await db
      .select()
      .from(counselorAvailability)
      .where(and(
        eq(counselorAvailability.orgId, existing.orgId),
        eq(counselorAvailability.counselorId, existing.counselorId),
        eq(counselorAvailability.dayOfWeek, existing.dayOfWeek),
        ne(counselorAvailability.id, slotId),
      ));

    for (const slot of others) {
      if (newStart < slot.endTime && newEnd > slot.startTime) {
        throw new ConflictError(`时段与已有排班冲突: ${slot.startTime}-${slot.endTime}`);
      }
    }
  }

  const updates: Record<string, unknown> = {};
  if (input.startTime !== undefined) updates.startTime = input.startTime;
  if (input.endTime !== undefined) updates.endTime = input.endTime;
  if (input.sessionType !== undefined) updates.sessionType = input.sessionType;
  if (input.isActive !== undefined) updates.isActive = input.isActive;

  const [updated] = await db
    .update(counselorAvailability)
    .set(updates)
    .where(eq(counselorAvailability.id, slotId))
    .returning();

  return updated;
}

export async function deleteSlot(slotId: string) {
  const [deleted] = await db
    .delete(counselorAvailability)
    .where(eq(counselorAvailability.id, slotId))
    .returning();

  if (!deleted) throw new NotFoundError('AvailabilitySlot', slotId);
  return deleted;
}

/**
 * Get concrete available time windows for a counselor on a specific date.
 * Returns free windows after subtracting existing pending/confirmed appointments.
 */
export async function getAvailableTimeSlots(
  orgId: string,
  counselorId: string,
  date: string, // "YYYY-MM-DD"
) {
  const targetDate = new Date(date);
  const dayOfWeek = targetDate.getUTCDay(); // 0=Sunday

  // 1. Get active availability slots for this day of week
  const slots = await db
    .select()
    .from(counselorAvailability)
    .where(and(
      eq(counselorAvailability.orgId, orgId),
      eq(counselorAvailability.counselorId, counselorId),
      eq(counselorAvailability.dayOfWeek, dayOfWeek),
      eq(counselorAvailability.isActive, true),
    ))
    .orderBy(counselorAvailability.startTime);

  if (slots.length === 0) return [];

  // 2. Get existing appointments for this counselor on this date
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59`);

  const bookedAppts = await db
    .select({
      startTime: appointments.startTime,
      endTime: appointments.endTime,
    })
    .from(appointments)
    .where(and(
      eq(appointments.orgId, orgId),
      eq(appointments.counselorId, counselorId),
      gte(appointments.startTime, dayStart),
      lte(appointments.startTime, dayEnd),
      // Only count pending and confirmed (not cancelled/completed/no_show)
      eq(appointments.status, 'pending'),
    ));

  const confirmedAppts = await db
    .select({
      startTime: appointments.startTime,
      endTime: appointments.endTime,
    })
    .from(appointments)
    .where(and(
      eq(appointments.orgId, orgId),
      eq(appointments.counselorId, counselorId),
      gte(appointments.startTime, dayStart),
      lte(appointments.startTime, dayEnd),
      eq(appointments.status, 'confirmed'),
    ));

  const allBooked = [...bookedAppts, ...confirmedAppts];

  // Convert booked appointments to HH:mm format for comparison
  const bookedRanges = allBooked.map((a) => ({
    start: toHHmm(a.startTime),
    end: toHHmm(a.endTime),
  }));

  // 3. Subtract booked times from available slots
  const freeWindows: { start: string; end: string; sessionType?: string | null }[] = [];

  for (const slot of slots) {
    let windows = [{ start: slot.startTime, end: slot.endTime }];

    for (const booked of bookedRanges) {
      windows = subtractRange(windows, booked);
    }

    for (const w of windows) {
      freeWindows.push({ start: w.start, end: w.end, sessionType: slot.sessionType });
    }
  }

  return freeWindows;
}

function toHHmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Subtract a booked range from a list of free windows.
 */
function subtractRange(
  windows: { start: string; end: string }[],
  booked: { start: string; end: string },
): { start: string; end: string }[] {
  const result: { start: string; end: string }[] = [];

  for (const w of windows) {
    if (booked.end <= w.start || booked.start >= w.end) {
      // No overlap
      result.push(w);
    } else {
      // Overlap — split
      if (booked.start > w.start) {
        result.push({ start: w.start, end: booked.start });
      }
      if (booked.end < w.end) {
        result.push({ start: booked.end, end: w.end });
      }
    }
  }

  return result;
}
