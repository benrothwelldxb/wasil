import {
  Baby,
  Gauge,
  Landmark,
  Leaf,
  Martini,
  ShoppingBag,
  Sofa,
  Sparkles,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import type { TravelPreference } from '@/domain/types';

export const PREFERENCE_META: Record<TravelPreference, { label: string; icon: LucideIcon }> = {
  culture: { label: 'Culture', icon: Landmark },
  food: { label: 'Food', icon: Utensils },
  nightlife: { label: 'Nightlife', icon: Martini },
  nature: { label: 'Nature', icon: Leaf },
  shopping: { label: 'Shopping', icon: ShoppingBag },
  relaxation: { label: 'Relaxation', icon: Sofa },
  family: { label: 'Family', icon: Baby },
  speed: { label: 'Speed', icon: Gauge },
  comfort: { label: 'Comfort', icon: Sparkles },
};

export const PREFERENCE_ORDER: TravelPreference[] = [
  'culture',
  'food',
  'nightlife',
  'nature',
  'shopping',
  'relaxation',
  'family',
  'speed',
  'comfort',
];

export const MAX_PREFERENCES = 3;
