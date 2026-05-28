'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/listener-directory/');
  }, [router]);

  // Instant redirect — show nothing while navigating
  return null;
}
