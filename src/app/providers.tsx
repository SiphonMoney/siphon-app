"use client";

import type { ReactNode } from "react";
import { EthPriceProvider } from "@/lib/EthPriceProvider";
import AppToastHost from "@/components/theme/AppToastHost";
import WalletSessionBootstrap from "@/components/WalletSessionBootstrap";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <EthPriceProvider>
      <WalletSessionBootstrap />
      {children}
      <AppToastHost />
    </EthPriceProvider>
  );
}
