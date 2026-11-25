import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountDataPage } from "../../src/components/account-data-page";
import "../../src/styles.css";

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <AccountDataPage />
  </QueryClientProvider>,
);
