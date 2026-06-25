"use client";

import { WidgetArea } from "@/components/widgets/WidgetArea";

export function BuildWidgetSection() {
  return (
    <section className="build-dashboard-theme w-full px-3 sm:px-4 md:px-6">
      <WidgetArea hideDashboardCollapse />
    </section>
  );
}
