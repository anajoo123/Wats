import React from 'react';
import { getCurrentSession } from '@/lib/security/session';
import { getActiveSessionUserService, listSwitchableUsersService } from '@/modules/auth/service';
import { listCountriesService } from '@/modules/countries/service';
import { AwnPlatform } from '@/components/AwnPlatform';

export const dynamic = 'force-dynamic';

const DEFAULT_DEMO_USER_ID = '11111111-1111-1111-1111-111111111111';

export default async function HomePage() {
  const session = await getCurrentSession();
  const activeId = session?.uid || DEFAULT_DEMO_USER_ID;

  let currentUser = null;
  try {
    currentUser = getActiveSessionUserService(activeId);
  } catch {
    currentUser = null;
  }

  const switchableUsers = listSwitchableUsersService();
  const countries = listCountriesService();

  return (
    <AwnPlatform
      initial={{
        user: currentUser,
        switchable_users: switchableUsers,
        countries,
      }}
    />
  );
}
