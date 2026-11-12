import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../../src/lib/auth";

const fixture = window as any;
const outerClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
fixture.clients = [];
function Probe() {
  const auth = useAuth();
  const client = useQueryClient();
  const [privateDraft, setPrivateDraft] = useState("empty");
  fixture.currentClient = client;
  if (!fixture.clients.includes(client)) fixture.clients.push(client);
  fixture.changeDraft = setPrivateDraft;
  return (
    <output>
      {auth.loading ? "loading" : (auth.user?.id ?? "signed-out")}|
      {privateDraft}
    </output>
  );
}
function App() {
  const [mounted, setMounted] = useState(true);
  fixture.setMounted = setMounted;
  return (
    <QueryClientProvider client={outerClient}>
      {mounted && (
        <AuthProvider>
          <Probe />
        </AuthProvider>
      )}
    </QueryClientProvider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
