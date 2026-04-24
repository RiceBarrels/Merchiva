"use client";

import { useState } from "react";
import * as LucideIcons from "lucide-react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

// Curated list of 200+ Lucide icons organized by category
const ICON_CATEGORIES: Record<string, string[]> = {
  Navigation: [
    "Home", "Menu", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
    "ChevronLeft", "ChevronRight", "ChevronUp", "ChevronDown",
    "ChevronsUp", "ChevronsDown", "ExternalLink", "Link", "Link2",
    "Navigation", "Compass", "Map", "MapPin", "CornerDownRight",
    "MoveHorizontal", "Undo", "Redo",
  ],
  UI: [
    "Search", "Bell", "BellRing", "Settings", "Filter", "SortAsc", "SortDesc",
    "Grid", "List", "Layers", "Box", "LayoutDashboard", "Sidebar",
    "Maximize", "Minimize", "Eye", "EyeOff", "Check", "X", "Plus", "Minus",
    "Edit", "Edit2", "Trash", "Trash2", "Copy", "Clipboard",
    "Download", "Upload", "Share", "Share2", "Bookmark", "BookmarkCheck",
    "Star", "Heart", "ThumbsUp", "ThumbsDown", "Flag", "Tag", "Hash",
    "Loader2", "RefreshCw", "RotateCcw", "ZoomIn", "ZoomOut",
    "MoreHorizontal", "MoreVertical", "Circle", "Square", "Triangle",
  ],
  Commerce: [
    "ShoppingBag", "ShoppingCart", "CreditCard", "DollarSign", "Coins",
    "Wallet", "PiggyBank", "Receipt", "Tag", "Percent", "Gift",
    "Package", "Truck", "Store", "Warehouse", "Factory",
    "BarChart", "BarChart2", "PieChart", "LineChart",
    "TrendingUp", "TrendingDown", "QrCode", "Barcode",
  ],
  Business: [
    "Briefcase", "Building", "Building2", "Target", "Crosshair",
    "Award", "Trophy", "Clipboard", "FileText", "File", "FolderOpen",
    "CalendarDays", "Calendar", "Clock", "Timer", "Timer",
    "Handshake", "HeartHandshake",
  ],
  People: [
    "User", "Users", "UserPlus", "UserCheck", "UserX",
    "Baby", "PersonStanding", "Accessibility",
    "MessageCircle", "MessageSquare", "AtSign",
    "Mail", "MailOpen", "Send", "Phone", "PhoneCall",
    "Megaphone",
  ],
  Transport: [
    "Car", "CarFront", "Truck", "Bus", "Bike",
    "Ship", "Plane", "Train", "Ambulance",
  ],
  Nature: [
    "Sun", "Moon", "Cloud", "CloudRain", "Snowflake", "Wind",
    "Thermometer", "Droplets", "Flower", "Leaf", "TreePine",
    "Mountain", "Waves", "Flame", "Zap", "Sparkles",
  ],
  "Food & Drink": [
    "Coffee", "UtensilsCrossed", "Sandwich", "Pizza", "IceCream",
    "Cake", "Wine", "Beer", "CookingPot", "Salad", "Soup",
    "Cherry", "Apple", "Banana", "Grape", "Egg", "Fish", "Beef",
    "Utensils",
  ],
  Tech: [
    "Monitor", "Laptop", "Smartphone", "Tablet",
    "Wifi", "Bluetooth", "Cpu", "HardDrive", "Server", "Database",
    "Globe", "QrCode", "Battery", "Camera", "Video",
  ],
  Health: [
    "Heart", "HeartPulse", "Stethoscope", "Pill", "Syringe",
    "Activity", "Cross", "Shield", "ShieldCheck",
  ],
  Home: [
    "Home", "Bed", "Bath", "Lamp", "Sofa",
    "DoorOpen", "Key", "Lock", "Unlock",
  ],
  Tools: [
    "Wrench", "Hammer", "Screwdriver", "Scissors", "Paintbrush",
    "Ruler", "Pen", "Pencil", "Eraser",
  ],
  Media: [
    "Camera", "Video", "Film", "Music", "Mic",
    "Volume2", "VolumeX", "Play", "Pause", "SkipForward",
    "PlayCircle", "PauseCircle", "Image", "FileImage",
  ],
  Social: [
    "Globe", "Instagram", "Twitter", "Facebook", "Linkedin",
    "Youtube", "Github", "Slack", "Twitch",
  ],
  Content: [
    "Type", "Heading1", "Heading2", "AlignLeft", "AlignCenter", "AlignRight",
    "Bold", "Italic", "Underline", "FileText", "BookOpen",
  ],
};

// All icons flat list for search (deduplicated)
const ALL_ICONS = Array.from(new Set(Object.values(ICON_CATEGORIES).flat()));

export interface IconPickerProps {
  value: string;           // icon name e.g. "Star"
  onValueChange: (name: string) => void;
  onClose: () => void;
}

export function IconPicker({ value, onValueChange, onClose }: IconPickerProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const pool = query
    ? ALL_ICONS.filter((n) => n.toLowerCase().includes(query.toLowerCase()))
    : activeCategory
    ? ICON_CATEGORIES[activeCategory]
    : ALL_ICONS;

  return (
    <div className="absolute z-50 top-full left-0 mt-1 w-72 rounded border border-border bg-background shadow-lg flex flex-col" style={{ maxHeight: "320px" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-semibold">{t("components.iconPicker.title")}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border shrink-0">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveCategory(null); }}
          placeholder={t("components.iconPicker.search")}
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
        {query && <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>}
      </div>

      {/* Category tabs */}
      {!query && (
        <div className="flex gap-1 overflow-x-auto px-2 py-1.5 border-b border-border shrink-0">
          <button
            onClick={() => setActiveCategory(null)}
            className={cn("shrink-0 rounded px-2 py-0.5 text-[10px] font-medium transition-colors", !activeCategory ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
          >
            {t("components.iconPicker.all")}
          </button>
          {Object.keys(ICON_CATEGORIES).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn("shrink-0 rounded px-2 py-0.5 text-[10px] font-medium transition-colors", activeCategory === cat ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {pool.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-4">{t("components.iconPicker.notFound")}</p>
        ) : (
          <div className="grid grid-cols-6 gap-1">
            {pool.map((name) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const IconComp = (LucideIcons as any)[name];
              if (!IconComp) return null;
              return (
                <button
                  key={name}
                  title={name}
                  onClick={() => { onValueChange(name); onClose(); }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 rounded p-1.5 transition-colors hover:bg-muted",
                    value === name && "bg-foreground text-background hover:bg-foreground/90"
                  )}
                >
                  <IconComp className="h-4 w-4 shrink-0" />
                  <span className="text-[8px] leading-none truncate w-full text-center">{name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Render a Lucide icon by name (used in site-renderer)
export function DynamicIcon({ name, size = 24, color, className }: { name: string; size?: number; color?: string; className?: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComp = (LucideIcons as any)[name];
  if (!IconComp) return null;
  return <IconComp width={size} height={size} color={color} className={className} />;
}
