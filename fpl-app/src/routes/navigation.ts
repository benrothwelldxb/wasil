import {
  ArrowLeftRight,
  BarChart3,
  Bug,
  CalendarDays,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  LineChart,
  Settings,
  Shirt,
  Wand2,
  SlidersHorizontal,
  Table2,
  Users,
} from "lucide-react";
import type { NavItem } from "@/types";
import { ROUTES } from "./paths";

/**
 * The primary navigation shown in the header, desktop nav, and mobile nav.
 * A single definition keeps every navigation surface in sync.
 */
export const PRIMARY_NAV: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    path: ROUTES.dashboard,
    icon: LayoutDashboard,
    end: true,
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
    label: "xPts",
    path: ROUTES.predictions,
    icon: LineChart,
  },
  {
    id: "optimiser",
    label: "Optimiser",
    path: ROUTES.optimiser,
    icon: Wand2,
  },
  {
    id: "squad",
    label: "Squad",
    path: ROUTES.squad,
    icon: Shirt,
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
    id: "fixtures",
    label: "Fixtures",
    path: ROUTES.fixtures,
    icon: CalendarDays,
  },
  {
    id: "team",
    label: "Team",
    path: ROUTES.team,
    icon: Users,
  },
  {
    id: "analyse",
    label: "Analyse",
    path: ROUTES.analyse,
    icon: BarChart3,
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
  {
    id: "debug",
    label: "Debug",
    path: ROUTES.debug,
    icon: Bug,
  },
];
