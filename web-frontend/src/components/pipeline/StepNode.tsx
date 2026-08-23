import { type NodeProps, Handle, Position } from "@xyflow/react";
import {
	Clock,
	AlertCircle,
	Loader2,
	PauseCircle,
	CheckCircle2,
	SkipForward,
	DollarSign,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface StepNodeData {
	label: string;
	status: string;
	isPaid: boolean;
	requiresApproval: boolean;
	provider: string | null;
	model: string | null;
	costUsd: number | null;
	attemptCount: number;
	onClick?: () => void;
}

const statusConfig: Record<
	string,
	{ color: string; bg: string; border: string; shadow: string; icon: typeof Clock }
> = {
	pending: {
		color: "text-muted-foreground",
		bg: "bg-card/60",
		border: "border-border/40",
		shadow: "shadow-sm",
		icon: Clock,
	},
	running: {
		color: "text-blue-400",
		bg: "bg-blue-950/30",
		border: "border-blue-500/30",
		shadow: "shadow-md shadow-blue-500/10",
		icon: Loader2,
	},
	waiting_approval: {
		color: "text-amber-400",
		bg: "bg-amber-950/30",
		border: "border-amber-500/30",
		shadow: "shadow-md shadow-amber-500/10",
		icon: PauseCircle,
	},
	completed: {
		color: "text-emerald-400",
		bg: "bg-emerald-950/20",
		border: "border-emerald-500/20",
		shadow: "shadow-sm shadow-emerald-500/5",
		icon: CheckCircle2,
	},
	failed: {
		color: "text-red-400",
		bg: "bg-red-950/30",
		border: "border-red-500/30",
		shadow: "shadow-md shadow-red-500/10",
		icon: AlertCircle,
	},
	skipped: {
		color: "text-muted-foreground",
		bg: "bg-muted/10",
		border: "border-muted/30",
		shadow: "shadow-sm",
		icon: SkipForward,
	},
};

export const stepNodeTypes = { step: StepNode };

function StepNode({ data, selected }: NodeProps) {
	const nodeData = data as unknown as StepNodeData;
	const config = statusConfig[nodeData.status] ?? statusConfig.pending;
	if (!config) return null;
	const Icon = config.icon;

	return (
		<div
			className={cn(
				"rounded-xl border px-3.5 py-2.5 min-w-[200px] cursor-pointer backdrop-blur-sm transition-all duration-200",
				config.bg,
				config.border,
				config.shadow,
				selected && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
				"hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5",
			)}
			onClick={nodeData.onClick}
		>
			<Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-muted-foreground/40" />

			<div className="flex items-center gap-2">
				<Icon
					className={cn(
						"h-4 w-4 shrink-0",
						config.color,
						nodeData.status === "running" && "animate-spin",
					)}
				/>
				<span className="text-sm font-medium truncate">{nodeData.label}</span>
			</div>

			<div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
				<span className={cn("text-xs capitalize", config.color)}>
					{nodeData.status.replace("_", " ")}
				</span>
				{nodeData.isPaid && (
					<Badge variant="outline" className="h-4 text-[10px] px-1 py-0 border-border/40">
						paid
					</Badge>
				)}
				{nodeData.requiresApproval && (
					<Badge variant="outline" className="h-4 text-[10px] px-1 py-0 border-amber-500/30 text-amber-400/80">
						approval
					</Badge>
				)}
			</div>

			{nodeData.provider && (
				<div className="mt-1 text-[10px] text-muted-foreground truncate">
					{nodeData.provider}
					{nodeData.model ? ` / ${nodeData.model}` : ""}
				</div>
			)}
			{nodeData.costUsd !== null && nodeData.costUsd > 0 && (
				<div className="flex items-center gap-0.5 text-[10px] text-amber-400 tabular-nums">
					<DollarSign className="h-2.5 w-2.5" />
					{nodeData.costUsd.toFixed(4)}
				</div>
			)}
			{nodeData.attemptCount > 1 && (
				<div className="text-[10px] text-amber-400/80">attempt {nodeData.attemptCount}</div>
			)}

			<Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-muted-foreground/40" />
		</div>
	);
}
