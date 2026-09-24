import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NewBookingDialog } from "../../src/components/new-booking-dialog";
import { StartSigningDialog } from "../../src/components/start-signing-dialog";
import { BookingCustomerNotes } from "../../src/components/booking-customer-notes";
import "../../src/styles.css";

const prefill = { customerId: "customer-qa" };
const templates = [{ id: "template-qa", name: "Consultation", active: true }];
function Fixture() {
  const [open, setOpen] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitted, setSubmitted] = useState("");
  return <><button onClick={() => setOpen(true)}>Open test booking</button><button onClick={() => setFormOpen(true)}>Open test consultation</button><NewBookingDialog open={open} onOpenChange={setOpen} businessId="business-qa" prefill={prefill} /><BookingCustomerNotes businessId="business-qa" customerId="customer-qa" /><StartSigningDialog open={formOpen} templates={templates} saving={false} onClose={() => setFormOpen(false)} onStart={async (data) => { setSubmitted(JSON.stringify(data)); setFormOpen(false); }} /><output data-testid="form-payload">{submitted}</output></>;
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
// The picker uses this cache while auth is disabled; no real login is needed.
client.setQueryData(["my-business", undefined], { id: "business-qa" });
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={client}><Fixture /></QueryClientProvider>);
