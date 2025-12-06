"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DappPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to pro page with discover mode
    localStorage.setItem('pro-view-mode', 'discover');
    router.push('/dapp/pro');
  }, [router]);

  return null;
}

