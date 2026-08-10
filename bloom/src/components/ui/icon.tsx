import {
  Activity,
  ArrowRight,
  BatteryMedium,
  Bell,
  BookOpen,
  BrainCircuit,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  Cloud,
  CloudRain,
  CloudSun,
  Compass,
  Download,
  Droplets,
  FileText,
  Footprints,
  HeartPulse,
  Info,
  Leaf,
  LineChart,
  Lock,
  Mic,
  Moon,
  MoonStar,
  Pill,
  Plane,
  Plus,
  Salad,
  Settings2,
  Share2,
  Shield,
  Sparkles,
  Stethoscope,
  Sun,
  Tablets,
  Thermometer,
  Trash2,
  TriangleAlert,
  User,
  Wind,
  Wine,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Registry of the line icons used across the app. Data models store an icon
 * *name* (string); this maps that name to a concrete component so the data
 * layer stays free of React imports.
 */
const REGISTRY: Record<string, LucideIcon> = {
  Activity,
  ArrowRight,
  BatteryMedium,
  Bell,
  BookOpen,
  BrainCircuit,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  Cloud,
  CloudRain,
  CloudSun,
  Compass,
  Download,
  Droplets,
  FileText,
  Footprints,
  HeartPulse,
  Info,
  Leaf,
  LineChart,
  Lock,
  Mic,
  Moon,
  MoonStar,
  Pill,
  Plane,
  Plus,
  Salad,
  Settings2,
  Share2,
  Shield,
  Sparkles,
  Stethoscope,
  Sun,
  Tablets,
  Thermometer,
  Trash2,
  TriangleAlert,
  User,
  Wind,
  Wine,
};

export interface IconProps {
  name: string;
  className?: string;
  /** Decorative icons are hidden from assistive tech; set a label otherwise. */
  label?: string;
}

export function Icon({ name, className, label }: IconProps) {
  const Cmp = REGISTRY[name] ?? Circle;
  return (
    <Cmp
      className={cn('size-5', className)}
      strokeWidth={1.75}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}
