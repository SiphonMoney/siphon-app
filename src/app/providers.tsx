"use client";

import type { ReactNode } from "react";
import BotDeterrent from "@/components/BotDeterrent";
import AppToastHost from "@/components/theme/AppToastHost";
import WalletSessionBootstrap from "@/components/WalletSessionBootstrap";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <>
      <BotDeterrent />
      <WalletSessionBootstrap />
      {children}
      <AppToastHost />
    </>
  );
}
