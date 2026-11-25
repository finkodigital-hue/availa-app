import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MfaChallengeGate } from "../../src/components/mfa-challenge-gate";
import { TwoFactorSettings } from "../../src/components/two-factor-settings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

function Fixture() {
  const [show, setShow] = useState(true);
  const [verified, setVerified] = useState(0);
  return (
    <>
      <button onClick={() => setShow(false)}>Unmount gate</button>
      <output>{verified}</output>
      {show &&
        (new URLSearchParams(location.search)
          .get("mode")
          ?.startsWith("settings") ? (
          <QueryClientProvider client={queryClient}>
            <TwoFactorSettings />
          </QueryClientProvider>
        ) : (
          <MfaChallengeGate
            onVerified={() => setVerified((value) => value + 1)}
          />
        ))}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
