"use client";

import { useState } from "react";

import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { useCaseActivityQuery } from "@/store/api";

const PREVIEW = 8;

export function CaseActivity({ caseId }: { caseId: string }) {
  const { data, error, refetch } = useCaseActivityQuery(caseId);
  const [all, setAll] = useState(false);
  const events = data ? (all ? data : data.slice(0, PREVIEW)) : [];

  return (
    <Card>
      <CardHeader title="Audit trail" description={data ? `${data.length} entries, newest first` : "Newest first"} />
      <CardBody>
        {error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : !data ? (
          <SkeletonRows rows={4} />
        ) : data.length === 0 ? (
          <EmptyState title="No activity yet" className="px-0" />
        ) : (
          <>
            <ActivityTimeline events={events} compact />
            {data.length > PREVIEW ? (
              <Button variant="link" size="sm" className="mt-4" onClick={() => setAll((a) => !a)}>
                {all ? "Show less" : `Show all ${data.length} entries`}
              </Button>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}
