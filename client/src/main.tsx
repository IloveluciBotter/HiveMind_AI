import { Buffer } from "buffer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { initSentry } from "@/lib/sentry";
import App from "./App";
import "./index.css";

// Make Buffer available globally for Solana libraries
if (typeof window !== "undefined" && !window.Buffer) {
  (window as any).Buffer = Buffer;
}

initSentry();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
