import { Columns, Grid3x3, List, Plus, Grid2x2, CalendarRange } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useCalendar } from "@/calendar/contexts/calendar-context";
import { UserSelect } from "@/calendar/components/header/user-select";
import { TodayButton } from "@/calendar/components/header/today-button";
import { DateNavigator } from "@/calendar/components/header/date-navigator";
import { AddEventDialog } from "@/calendar/components/dialogs/add-event-dialog";

import type { IEvent } from "@/calendar/interfaces";
import type { TCalendarView } from "@/calendar/types";

interface IProps {
  view: TCalendarView;
  events: IEvent[];
}

const VIEW_BUTTONS: { key: TCalendarView; icon: typeof List; label: string; className: string }[] = [
  { key: "day", icon: List, label: "วัน", className: "rounded-r-none" },
  { key: "week", icon: Columns, label: "สัปดาห์", className: "-ml-px rounded-none" },
  { key: "month", icon: Grid2x2, label: "เดือน", className: "-ml-px rounded-none" },
  { key: "year", icon: Grid3x3, label: "ปี", className: "-ml-px rounded-none" },
  { key: "agenda", icon: CalendarRange, label: "วาระ", className: "-ml-px rounded-l-none" },
];

export function CalendarHeader({ view, events }: IProps) {
  const { setView } = useCalendar();

  return (
    <div className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <TodayButton />
        <DateNavigator view={view} events={events} />
      </div>

      <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:justify-between">
        <div className="flex w-full items-center gap-1.5">
          <div className="inline-flex">
            {VIEW_BUTTONS.map(({ key, icon: Icon, label, className }) => (
              <Button
                key={key}
                aria-label={label}
                size="icon"
                variant={view === key ? "default" : "outline"}
                className={`${className} [&_svg]:size-5`}
                onClick={() => setView(key)}
              >
                <Icon strokeWidth={1.8} />
              </Button>
            ))}
          </div>

          <UserSelect />
        </div>

        <AddEventDialog>
          <Button className="w-full sm:w-auto">
            <Plus />
            เพิ่มกิจกรรม
          </Button>
        </AddEventDialog>
      </div>
    </div>
  );
}
