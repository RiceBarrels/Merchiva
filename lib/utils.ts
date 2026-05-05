import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function localizedName(
  name: string,
  nameI18n: Record<string, string> | undefined,
  locale: string,
): string {
  return nameI18n?.[locale] || name;
}
