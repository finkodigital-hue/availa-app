import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BookingBalanceCheckout } from "../../src/components/booking-balance-checkout";
function Fixture() {
  const [booking, setBooking] = useState<Record<string, unknown>>({payment_status: "unpaid"});
  return <><h1>Appointment stays open</h1><BookingBalanceCheckout bookingId="fixture-booking" businessId="fixture-business" onUpdated={setBooking} /><output>{String(booking.payment_status)}</output></>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
