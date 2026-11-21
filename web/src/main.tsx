import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { applyThemePreferences, loadCachedPreferences } from "./utils/theme";

applyThemePreferences(loadCachedPreferences());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
