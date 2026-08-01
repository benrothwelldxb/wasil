import {
  BarChart3,
  Bug,
  LayoutDashboard,
  Settings,
  Shirt,
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
    id: "squad",
    label: "Squad",
    path: ROUTES.squad,
    icon: Shirt,
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
