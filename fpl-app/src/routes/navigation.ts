import {
  ArrowLeftRight,
  Bug,
  CalendarDays,
  ClipboardList,
  Gauge,
  Home,
  LineChart,
  Settings,
  Shirt,
  Wand2,
  SlidersHorizontal,
  Table2,
} from "lucide-react";
import type { NavItem } from "@/types";
import { ROUTES } from "./paths";

/**
 * The primary navigation shown in the header, desktop nav, and mobile nav.
 * A single definition keeps every navigation surface in sync.
 *
 * Labels favour plain language over jargon ("Pick Team", "Forecast"). The
 * placeholder Team/Analyse routes are intentionally left out of the nav until
 * they do something, and Debug is only shown in development.
 */
export const PRIMARY_NAV: NavItem[] = [
  {
    id: "dashboard",
    label: "Home",
    path: ROUTES.dashboard,
    icon: Home,
    end: true,
  },
  {
    id: "optimiser",
    label: "Pick Team",
    path: ROUTES.optimiser,
    icon: Wand2,
  },
  {
    id: "lineup",
    label: "Lineup",
    path: ROUTES.lineup,
    icon: ClipboardList,
  },
  {
    id: "transfers",
    label: "Transfers",
    path: ROUTES.transfers,
    icon: ArrowLeftRight,
  },
  {
    id: "players",
    label: "Players",
    path: ROUTES.players,
    icon: Table2,
  },
  {
    id: "ratings",
    label: "Ratings",
    path: ROUTES.ratings,
    icon: Gauge,
  },
  {
    id: "predictions",
    label: "Forecast",
    path: ROUTES.predictions,
    icon: LineChart,
  },
  {
    id: "fixtures",
    label: "Fixtures",
    path: ROUTES.fixtures,
    icon: CalendarDays,
  },
  {
    id: "squad",
    label: "Squad",
    path: ROUTES.squad,
    icon: Shirt,
  },
  {
    id: "preferences",
    label: "Preferences",
    path: ROUTES.preferences,
    icon: SlidersHorizontal,
  },
  {
    id: "settings",
    label: "Settings",
    path: ROUTES.settings,
    icon: Settings,
  },
  // Development-only tools.
  ...(import.meta.env.DEV
    ? [
        {
          id: "debug",
          label: "Debug",
          path: ROUTES.debug,
          icon: Bug,
        },
      ]
    : []),
];
