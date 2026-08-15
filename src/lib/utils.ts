import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function truncateTitle(title: string, max = 15): string {
  return title.length > max ? title.slice(0, max) + "…" : title;
}
