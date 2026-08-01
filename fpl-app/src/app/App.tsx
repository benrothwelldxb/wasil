import { RouterProvider } from "react-router-dom";
import { AppProviders } from "@/app/providers";
import { router } from "@/routes";

/**
 * Application root. Wires global providers around the router. Deliberately
 * thin — composition happens in `AppProviders` and routing in `router`.
 */
export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
