import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Route as Customers } from "../../src/routes/_authenticated/customers";
import { Route as Requests } from "../../src/routes/_authenticated/appointment-waitlist";
import { BookingOpeningRequest } from "../../src/components/booking-opening-request";
import "../../src/styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
(window as any).fixtureQueryClient = queryClient;
const mode = new URLSearchParams(location.search).get("mode");
const Page = (mode === "requests" ? Requests : Customers).options
  .component as React.ComponentType;
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    {mode === "opening" ? (
      <BookingOpeningRequest
        businessId="fixture-business"
        serviceId="fixture-service"
        serviceName="Cut"
        staffId="fixture-staff"
        staffName="Sam"
        selectedDate={new Date(2026, 6, 1)}
        timeZone="Europe/London"
      />
    ) : (
      <Page />
    )}
    <Toaster />
  </QueryClientProvider>,
);
