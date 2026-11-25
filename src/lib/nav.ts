import {
  Award,
  BarChart3,
  History,
  LayoutDashboard,
  ScrollText,
  Settings,
  Timer,
  Trophy,
  User,
  BookOpen,
  Shield,
  Users,
  Flame,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Hunter",
    items: [
      { href: "/dashboard", label: "Status", icon: LayoutDashboard, description: "Your live status window" },
      { href: "/study", label: "Focus", icon: Timer, description: "Start a focused session" },
      { href: "/subjects", label: "Subjects", icon: BookOpen, description: "Subjects and topics" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/quests", label: "Quests", icon: ScrollText, description: "Daily, weekly and special quests" },
      { href: "/achievements", label: "Achievements", icon: Award, description: "Badges you have unlocked" },
      { href: "/analytics", label: "Analytics", icon: BarChart3, description: "Study patterns and momentum" },
      { href: "/history", label: "History", icon: History, description: "Every recorded session" },
    ],
  },
  {
    label: "World",
    items: [
      { href: "/leaderboard", label: "Leaderboard", icon: Trophy, description: "Global hunter rankings" },
      { href: "/friends", label: "Roster", icon: Users, description: "Allies and the friends board" },
      { href: "/guilds", label: "Guilds", icon: Shield, description: "Guild registry and hall" },
      { href: "/seasons", label: "Season", icon: Flame, description: "The current monthly competition" },
      { href: "/profile", label: "Profile", icon: User, description: "Your public hunter record" },
      { href: "/settings", label: "Settings", icon: Settings, description: "Account and privacy" },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

export function navItemForPath(pathname: string): NavItem | null {
  const match = ALL_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return match ?? null;
}
