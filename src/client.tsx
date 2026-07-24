import { StrictMode, startTransition } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { getRouter } from "./router";

// The Worker can recover from an interrupted server render by serving the
// client shell. Use a normal React root here (rather than TanStack's
// hydration-only default entry) so that shell is a complete, usable app.
const router = getRouter();

startTransition(() => {
  createRoot(document).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
});
