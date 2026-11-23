import { assertAccountActivePolicy } from '@/modules/auth/policy';
import { getUserByIdRepo } from '@/modules/auth/repo';
import { createNeedService } from '@/modules/needs/service';
import { assertSosAllowedPolicy } from './policy';
import { findAuthorizedSosRecipientsRepo, notifySosRecipientsRepo } from './repo';

export function triggerSosService(
  userId: string,
  input: {
    circleId: string;
    sosType: 'medical_errand' | 'elderly_care' | 'transport' | 'sos_support';
    urgency: 'high' | 'sos';
    title: string;
    description: string;
    regionCode: string;
    acknowledgedOfficialEmergencyScreen: boolean;
  }
) {
  if (!input.acknowledgedOfficialEmergencyScreen) {
    throw new Error('SOS_ACK_REQUIRED');
  }
  const user = getUserByIdRepo(userId);
  assertAccountActivePolicy(user);

  const country = assertSosAllowedPolicy(userId, input.circleId, user.country_code);
  const now = new Date();
  const ackIso = now.toISOString();
  const windowEnd = new Date(now.getTime() + 3 * 3600_000).toISOString();

  const need = createNeedService(userId, {
    title: input.title,
    description: input.description,
    category: input.sosType,
    urgency: input.urgency,
    circleIds: [input.circleId],
    regionCode: input.regionCode,
    timeWindowStart: ackIso,
    timeWindowEnd: windowEnd,
    expiresAt: windowEnd,
    isSensitive: true,
    publishImmediately: true,
    isSos: true,
    sosOfficialAckAt: ackIso,
  });

  const recipients = findAuthorizedSosRecipientsRepo(input.circleId, userId);
  notifySosRecipientsRepo(recipients, need.id, input.circleId);

  return {
    need,
    notified_authorized_count: recipients.length,
    official_emergency_numbers: country.emergency_numbers,
    community_disclaimer_applied: true,
  };
}
