"use client";

import { useState, useEffect, useCallback } from "react";
import { CalendarProvider } from "@/calendar/contexts/calendar-context";
import { ClientContainer } from "@/calendar/components/client-container";
import { apiFetch } from "@/lib/api";
import type { IEvent, IUser } from "@/calendar/interfaces";

export default function CalendarPage() {
  const [events, setEvents] = useState<IEvent[]>([]);
  const [users, setUsers] = useState<IUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async (from?: string, to?: string) => {
    try {
      const now = new Date();
      const defaultFrom = from ?? new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0];
      const defaultTo = to ?? new Date(now.getFullYear(), 11, 31).toISOString().split("T")[0];

      const data = await apiFetch<IEvent[]>(
        `/calendar/events?from=${defaultFrom}&to=${defaultTo}`
      );
      setEvents(data);
    } catch {
      setEvents([]);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await apiFetch<IUser[]>("/calendar/users");
      setUsers(data);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchEvents(), fetchUsers()]).finally(() => setLoading(false));
  }, [fetchEvents, fetchUsers]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-on-surface-variant">กำลังโหลดปฏิทิน...</p>
      </div>
    );
  }

  return (
    <CalendarProvider users={users} events={events}>
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-xl font-bold text-on-surface">ปฏิทิน</h1>
        <ClientContainer />
      </div>
    </CalendarProvider>
  );
}
