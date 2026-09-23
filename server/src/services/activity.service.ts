import { Event } from '../models/event.model';

export async function getStudentActivity(
  studentId: string,
  tenantId: string
) {
  return Event.find({
    studentId,
    tenantId,
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
}