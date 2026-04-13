"use client";

import { CalendarProvider } from "@/calendar/contexts/calendar-context";
import { ClientContainer } from "@/calendar/components/client-container";
import { CALENDAR_ITEMS_MOCK, USERS_MOCK } from "@/calendar/mocks";

export default function CalendarPage() {
  return (
    <CalendarProvider users={USERS_MOCK} events={CALENDAR_ITEMS_MOCK}>
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-xl font-bold text-on-surface">ปฏิทิน</h1>
        <ClientContainer />
      </div>
    </CalendarProvider>
  );
}
