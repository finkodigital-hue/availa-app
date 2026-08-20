import { CalendarPlus, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildGoogleCalendarUrl, buildIcsCalendar, icsFilename, type CalendarEventInput } from "@/lib/ics";

// Client-side only — the .ics is built and downloaded entirely in the
// browser (Blob + synthetic <a download>), no server round trip. Used on the
// public booking confirmation screen; the confirmation EMAIL attaches the
// same buildIcsCalendar() output server-side (see send-confirmation.ts) so
// the two never drift apart.
export function AddToCalendar({ event, className }: { event: CalendarEventInput; className?: string }) {
  const downloadIcs = () => {
    const blob = new Blob([buildIcsCalendar(event)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = icsFilename(event.title);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={className}>
          <CalendarPlus className="h-4 w-4 mr-2" /> Add to calendar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        <DropdownMenuItem onClick={downloadIcs}>
          <Download className="h-4 w-4" /> Download .ics (Apple, Outlook…)
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={buildGoogleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" /> Add to Google Calendar
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
