"use client";

import type { ReactNode } from "react";
import AppToastHost from "@/components/theme/AppToastHost";
import WalletSessionBootstrap from "@/components/WalletSessionBootstrap";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <>
      <WalletSessionBootstrap />
      {children}
      <AppToastHost />
    </>
  );
}
