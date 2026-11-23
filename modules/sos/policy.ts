import { assertCircleMemberPolicy } from '@/modules/circles/policy';
import { getCountryConfigService } from '@/modules/countries/service';

export function assertSosAllowedPolicy(userId: string, circleId: string, countryCode: string) {
  assertCircleMemberPolicy(userId, circleId);
  const country = getCountryConfigService(countryCode);
  if (!country.sos_enabled) {
    throw new Error('SOS_DISABLED_IN_COUNTRY');
  }
  return country;
}
