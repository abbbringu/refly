import type { LucideIcon } from "lucide-react"
import {
  Bookmark,
  BookOpen,
  Briefcase,
  FileText,
  FlaskConical,
  Folder,
  GraduationCap,
  Layers,
  Lightbulb,
  Rocket,
  Star,
  Target,
  Users,
} from "lucide-react"

export const APPEARANCE_COLORS = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#dc2626",
  "#9333ea",
  "#0891b2",
  "#4f46e5",
  "#0f766e",
  "#475569",
  "#a16207",
]

export const TEAM_ICON_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "users", label: "Users", icon: Users },
  { value: "briefcase", label: "Briefcase", icon: Briefcase },
  { value: "flask", label: "Flask", icon: FlaskConical },
  { value: "rocket", label: "Rocket", icon: Rocket },
  { value: "target", label: "Target", icon: Target },
  { value: "lightbulb", label: "Lightbulb", icon: Lightbulb },
  { value: "graduation", label: "Graduation", icon: GraduationCap },
  { value: "book", label: "Book", icon: BookOpen },
]

export const MAP_ICON_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "folder", label: "Folder", icon: Folder },
  { value: "layers", label: "Layers", icon: Layers },
  { value: "bookmark", label: "Bookmark", icon: Bookmark },
  { value: "book", label: "Book", icon: BookOpen },
  { value: "file", label: "File", icon: FileText },
  { value: "star", label: "Star", icon: Star },
  { value: "target", label: "Target", icon: Target },
  { value: "lightbulb", label: "Lightbulb", icon: Lightbulb },
]

export function getTeamIcon(iconName?: string | null): LucideIcon {
  return TEAM_ICON_OPTIONS.find((option) => option.value === iconName)?.icon ?? Users
}

export function getMapIcon(iconName?: string | null): LucideIcon {
  return MAP_ICON_OPTIONS.find((option) => option.value === iconName)?.icon ?? Folder
}
