'use client';

import StationRequestsWorkspace from '@/components/StationRequestsWorkspace';
import { useAuthState } from '@/lib/auth';

export default function CreatorRequestsPage() {
  const { appUser } = useAuthState();

  return (
    <StationRequestsWorkspace
      ownerId={appUser?.uid}
      title="My Song Requests"
      subtitle="Requests from listeners tuned into your stations"
    />
  );
}
