"use client";

import { WidgetArea } from "@/components/widgets/WidgetArea";

export function BuildWidgetSection() {
  return (
    <section className="build-dashboard-theme w-full max-sm:px-0 sm:px-4 md:px-6">
      <WidgetArea hideDashboardCollapse />
    </section>
  );
}
