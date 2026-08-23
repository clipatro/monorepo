import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const config: Record<string, { label: string; className: string }> = {
	pending: { label: "pending", className: "text-muted-foreground border-muted/40 bg-muted/10" },
	running: { label: "running", className: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
	paused: { label: "paused", className: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
	completed: { label: "completed", className: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
	failed: { label: "failed", className: "text-red-400 border-red-500/30 bg-red-500/10" },
	cancelled: { label: "cancelled", className: "text-muted-foreground border-muted/40 bg-muted/10" },
};

export function RunStatusBadge({ status }: { status: string }) {
	const c = config[status] ?? { label: status, className: "text-muted-foreground border-muted/40 bg-muted/10" };
	return (
		<Badge variant="outline" className={cn("text-xs font-medium", c.className)}>
			{c.label}
		</Badge>
	);
}

const stepConfig: Record<string, { label: string; className: string }> = {
	pending: { label: "pending", className: "text-muted-foreground border-muted/40 bg-muted/10" },
	running: { label: "running", className: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
	waiting_approval: { label: "waiting", className: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
	completed: { label: "completed", className: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
	failed: { label: "failed", className: "text-red-400 border-red-500/30 bg-red-500/10" },
	skipped: { label: "skipped", className: "text-muted-foreground border-muted/40 bg-muted/10" },
};

export function StepStatusBadge({ status }: { status: string }) {
	const c = stepConfig[status] ?? { label: status, className: "text-muted-foreground border-muted/40 bg-muted/10" };
	return (
		<Badge variant="outline" className={cn("text-xs font-medium", c.className)}>
			{c.label}
		</Badge>
	);
}
