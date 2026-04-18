import { createRoot } from "react-dom/client";
import "../../styles/globals.css";
import { ErrorBoundary } from "@renderer/components/ErrorBoundary";
import { Widget } from "./Widget";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <Widget />
  </ErrorBoundary>,
);
