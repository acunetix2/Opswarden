"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";

export function NotificationsView() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Alerts"
        title="Notifications"
        description="Activity alerts and mentions. Coming soon — the notification system is being built."
      />
      <Card>
        <div className="px-5 py-12 text-center">
          <p className="text-[14px] text-ink-2">Notification feed will appear here.</p>
        </div>
      </Card>
    </div>
  );
}
