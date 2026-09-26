import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BookingBalanceCheckout } from "../../src/components/booking-balance-checkout";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../../src/styles.css";
function Fixture() {
  const [booking, setBooking] = useState<Record<string, unknown>>({
    payment_status: "unpaid",
  });
  return (
    <main className="mx-auto max-w-lg space-y-5 p-5">
      <h1 className="text-xl font-semibold">Appointment stays open</h1>
      <BookingBalanceCheckout
        bookingId="fixture-booking"
        businessId="fixture-business"
        amountDueCents={3500}
        currency="GBP"
        onUpdated={setBooking}
      />
      <output>{String(booking.payment_status)}</output>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <Fixture />
  </QueryClientProvider>,
);
