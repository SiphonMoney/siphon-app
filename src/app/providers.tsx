"use client";

import type { ReactNode } from "react";
import { EthPriceProvider } from "@/lib/EthPriceProvider";
import AppToastHost from "@/components/theme/AppToastHost";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <EthPriceProvider>
      {children}
      <AppToastHost />
    </EthPriceProvider>
  );
}
