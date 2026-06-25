"use client";

import type { ReactNode } from "react";
import { EthPriceProvider } from "@/lib/EthPriceProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return <EthPriceProvider>{children}</EthPriceProvider>;
}
