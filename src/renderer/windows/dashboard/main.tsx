import { createRoot } from "react-dom/client";
import "../../styles/globals.css";
import { ErrorBoundary } from "@renderer/components/ErrorBoundary";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
