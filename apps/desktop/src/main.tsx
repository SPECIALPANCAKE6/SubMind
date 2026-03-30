import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { DesktopApp } from "./App.js";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false
    }
  }
});

const container = document.querySelector<HTMLDivElement>("#app");

if (!container) {
  throw new Error("Desktop app root element was not found.");
}

createRoot(container).render(
  <QueryClientProvider client={queryClient}>
    <DesktopApp />
  </QueryClientProvider>
);
