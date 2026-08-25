import React from "react";
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  CircleHelp,
  Clock3,
  Compass,
  Eye,
  FileText,
  Fingerprint,
  Flag,
  Globe2,
  Image,
  Landmark,
  Layers,
  Link2,
  MapPin,
  Microscope,
  Newspaper,
  Quote,
  Route,
  Scale,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  Workflow,
  X,
  Zap,
  type LucideProps,
} from "lucide-react";

const storyIcons = {
  alert: AlertTriangle,
  archive: Archive,
  arrowDown: ArrowDown,
  book: BookOpen,
  calendar: CalendarDays,
  camera: Camera,
  check: Check,
  compass: Compass,
  document: FileText,
  eye: Eye,
  fingerprint: Fingerprint,
  flag: Flag,
  globe: Globe2,
  image: Image,
  landmark: Landmark,
  layers: Layers,
  link: Link2,
  location: MapPin,
  microscope: Microscope,
  newspaper: Newspaper,
  question: CircleHelp,
  quote: Quote,
  route: Route,
  scale: Scale,
  scan: ScanSearch,
  search: Search,
  shield: ShieldCheck,
  sparkles: Sparkles,
  time: Clock3,
  trend: TrendingUp,
  user: UserRound,
  workflow: Workflow,
  x: X,
  zap: Zap,
} as const;

export type StoryIconName = keyof typeof storyIcons;

interface StoryIconProps extends Omit<LucideProps, "ref"> {
  name?: StoryIconName;
}

export const StoryIcon: React.FC<StoryIconProps> = ({ name = "book", ...props }) => {
  const Icon = storyIcons[name] ?? BookOpen;
  return <Icon aria-hidden="true" strokeWidth={1.8} {...props} />;
};

export const storyIconNames = Object.freeze(Object.keys(storyIcons) as StoryIconName[]);
