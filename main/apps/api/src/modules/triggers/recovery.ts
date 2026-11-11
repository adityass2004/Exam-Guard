import { Prisma } from '@prisma/client';

export interface RecoveredIncidentInfo {
  id: string;
  triggerType: string;
  incidentCode: string;
}

/**
 * Marks all ongoing/active incidents for a session as recovered.
 * Sets recoveredAt = now and activeDedupeKey = NULL.
 * Returns the list of recovered incident IDs and codes.
 */
export async function recoverActiveIncidents(
  tx: Prisma.TransactionClient,
  sessionId: string,
  now: Date = new Date()
): Promise<RecoveredIncidentInfo[]> {
  const activeIncidents = await tx.securityTrigger.findMany({
    where: {
      sessionId,
      activeDedupeKey: { not: null },
    },
    select: {
      id: true,
      triggerType: true,
      incidentCode: true,
    },
  });

  if (activeIncidents.length === 0) {
    return [];
  }

  await tx.securityTrigger.updateMany({
    where: {
      sessionId,
      activeDedupeKey: { not: null },
    },
    data: {
      recoveredAt: now,
      activeDedupeKey: null,
    },
  });

  return activeIncidents.map((i) => ({
    id: i.id,
    triggerType: i.triggerType,
    incidentCode: i.incidentCode,
  }));
}
