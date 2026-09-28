"use client";

import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Award, Baby, Banknote, Box, Briefcase, Camera, ChefHat, Clipboard, Clock, Coffee, Dog, HandPlatter,
  Hammer, Headphones, HeartPulse, Leaf, Mail, MoonStar, Music, Package, Palette, Phone, Receipt,
  ReceiptText, Shield, ShoppingCart, Sparkles, Star, Store, Sun, Truck, User, Utensils, Wine, Wrench, Zap,
} from "lucide-react";

// Role icon map (mirrors the staffing page).
export const ROLE_ICON_MAP: Record<string, LucideIcon> = {
  "user": User, "coffee": Coffee, "utensils": Utensils, "chef-hat": ChefHat,
  "truck": Truck, "package": Package, "clipboard": Clipboard, "wrench": Wrench,
  "headphones": Headphones, "store": Store, "banknote": Banknote,
  "sparkles": Sparkles, "box": Box, "shopping-cart": ShoppingCart,
  "receipt": Receipt, "heart-pulse": HeartPulse, "baby": Baby, "dog": Dog,
  "leaf": Leaf, "music": Music, "camera": Camera, "palette": Palette,
  "hammer": Hammer, "zap": Zap, "star": Star, "award": Award,
  "briefcase": Briefcase, "phone": Phone, "mail": Mail, "clock": Clock,
  "shield": Shield, "wine": Wine, "moon-star": MoonStar, "sun": Sun,
  "receipt-text": ReceiptText, "hand-platter": HandPlatter,
};

export function RoleIcon({ name, className, style }: { name: string; className?: string; style?: CSSProperties }) {
  const Comp = ROLE_ICON_MAP[name] ?? User;
  return <Comp className={className} style={style} />;
}
