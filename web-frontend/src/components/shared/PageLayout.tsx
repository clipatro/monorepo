/**
 * Shared page layout primitives for consistent design across all pages.
 */

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Page header with icon, title, subtitle, and action slot */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight truncate">{title}</h1>
          <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/** Empty state with icon, message, and optional action */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-muted/50 text-muted-foreground mb-4">
        <Icon className="h-7 w-7" />
      </div>
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && (
        <div className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Loading state with spinner and message */
export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {message}
    </div>
  );
}

/** Stat card — small metric display with label and value */
export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  accent?: "default" | "green" | "amber" | "blue" | "purple";
}) {
  const accentClass = {
    default: "text-foreground",
    green: "text-green-500",
    amber: "text-amber-500",
    blue: "text-blue-500",
    purple: "text-purple-500",
  }[accent ?? "default"];

  return (
    <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className={cn("text-lg font-semibold mt-1", accentClass)}>{value}</div>
    </div>
  );
}
