"use client";

import { DashboardWidgetGrid } from "@/components/landing/DashboardWidgetGrid";

type WidgetAreaProps = {
  onEnterChatFocus?: () => void;
};

export function WidgetArea({ onEnterChatFocus }: WidgetAreaProps) {
  return <DashboardWidgetGrid onEnterChatFocus={onEnterChatFocus} />;
}
