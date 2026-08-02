import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app";
import { initAnalytics } from "@/lib/analytics";
import "@/styles/globals.css";

initAnalytics();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Remove the first-paint splash once React has committed the app (double rAF
// guarantees the real UI is painted first, so there's no flash of empty page).
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    const splash = document.getElementById("boot-splash");
    if (splash) {
      splash.classList.add("boot-splash--hide");
      splash.addEventListener("transitionend", () => splash.remove(), {
        once: true,
      });
      // Fallback removal in case the transition doesn't fire.
      setTimeout(() => splash.remove(), 400);
    }
  }),
);
