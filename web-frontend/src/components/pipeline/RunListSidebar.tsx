import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
	Search,
	ChevronLeft,
	ChevronRight,
	DollarSign,
	Clock,
	Loader2,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/hooks";
import { usePipelineStore } from "@/stores/pipeline-store";
import { RunStatusBadge } from "./StatusBadges";

const STATUS_OPTIONS = [
	{ value: "all", label: "All statuses" },
	{ value: "running", label: "Running" },
	{ value: "pending", label: "Pending" },
	{ value: "paused", label: "Paused" },
	{ value: "waiting_approval", label: "Waiting approval" },
	{ value: "completed", label: "Completed" },
	{ value: "failed", label: "Failed" },
	{ value: "cancelled", label: "Cancelled" },
];

function formatRelativeTime(iso: string): string {
	const now = Date.now();
	const then = new Date(iso).getTime();
	const diffMs = now - then;
	const diffMin = Math.floor(diffMs / 60000);
	if (diffMin < 1) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	const diffDay = Math.floor(diffHr / 24);
	if (diffDay < 7) return `${diffDay}d ago`;
	return new Date(iso).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

export function RunListSidebar() {
	const [searchParams, setSearchParams] = useSearchParams();
	const selectedRunId = searchParams.get("run");

	const [inputValue, setInputValue] = useState("");
	const debouncedSearch = useDebouncedValue(inputValue, 400);

	const channels = usePipelineStore((s) => s.channels);
	const runs = usePipelineStore((s) => s.runs);
	const runsTotal = usePipelineStore((s) => s.runsTotal);
	const runsLoading = usePipelineStore((s) => s.runsLoading);
	const channelFilter = usePipelineStore((s) => s.channelFilter);
	const setChannelFilter = usePipelineStore((s) => s.setChannelFilter);
	const searchQuery = usePipelineStore((s) => s.searchQuery);
	const setSearchQuery = usePipelineStore((s) => s.setSearchQuery);
	const statusFilter = usePipelineStore((s) => s.statusFilter);
	const setStatusFilter = usePipelineStore((s) => s.setStatusFilter);
	const page = usePipelineStore((s) => s.page);
	const pageSize = usePipelineStore((s) => s.pageSize);
	const setPage = usePipelineStore((s) => s.setPage);

	useEffect(() => {
		setSearchQuery(debouncedSearch);
	}, [debouncedSearch, setSearchQuery]);

	const selectRun = (runId: string) => {
		const next = new URLSearchParams(searchParams);
		next.set("run", runId);
		setSearchParams(next, { replace: true });
	};

	const totalPages = Math.max(1, Math.ceil(runsTotal / pageSize));
	const currentPage = page + 1;

	return (
		<div className="flex h-full flex-col">
			{/* Search + filters */}
			<div className="space-y-2.5 p-3">
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
					<Input
						type="text"
						placeholder="Search runs..."
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						className="h-8 pl-8 text-xs bg-card/50 border-border/40"
					/>
				</div>
				<div className="grid grid-cols-2 gap-1.5">
					<select
						value={channelFilter}
						onChange={(e) => setChannelFilter(e.target.value)}
						className="w-full rounded-md border border-border/40 bg-card/50 px-2 py-1.5 text-xs outline-none transition-colors hover:border-border/60 focus:border-ring/50"
					>
						<option value="">All channels</option>
						{channels.map((ch) => (
							<option key={ch.id} value={ch.id}>
								{ch.name}
							</option>
						))}
					</select>
					<select
						value={statusFilter}
						onChange={(e) => setStatusFilter(e.target.value)}
						className="w-full rounded-md border border-border/40 bg-card/50 px-2 py-1.5 text-xs outline-none transition-colors hover:border-border/60 focus:border-ring/50"
					>
						{STATUS_OPTIONS.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</div>
			</div>

			<Separator className="opacity-40" />

			{/* Runs list */}
			<div className="flex-1 overflow-y-auto px-2 py-2 themed-scroll">
				<div className="mb-2 flex items-center justify-between px-1.5">
					<Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
						Runs
					</Label>
					<span className="text-[10px] text-muted-foreground tabular-nums">
						{runsTotal > 0 ? `${runsTotal} total` : ""}
					</span>
				</div>

				{runsLoading && runs.length === 0 ? (
					<div className="flex flex-col items-center gap-2 py-8">
						<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
						<span className="text-xs text-muted-foreground">Loading...</span>
					</div>
				) : runs.length === 0 ? (
					<div className="py-8 text-center">
						<p className="text-xs text-muted-foreground">
							{searchQuery || statusFilter !== "all" || channelFilter
								? "No runs match your filters."
								: "No runs yet."}
						</p>
					</div>
				) : (
					<div className="space-y-1">
						{runs.map((run) => {
							const completed = run.steps.filter(
								(s) => s.status === "completed",
							).length;
							const total = run.steps.length;
							const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
							const cost = run.totalCostUsd ?? 0;
							const isActive =
								run.status === "running" ||
								run.status === "pending" ||
								run.status === "paused";
							const channel = channels.find((c) => c.id === run.channelId);

							return (
								<button
									key={run.id}
									onClick={() => selectRun(run.id)}
									className={cn(
										"w-full rounded-xl px-3 py-2.5 text-left text-xs transition-all duration-200",
										selectedRunId === run.id
											? "bg-primary/10 shadow-md shadow-primary/5"
											: "hover:bg-accent/40 hover:shadow-sm",
									)}
								>
									{/* Row 1: topic + status */}
									<div className="flex items-center gap-1.5">
										<span className="flex-1 truncate font-medium">
											{run.topic}
										</span>
										<RunStatusBadge status={run.status} />
									</div>

									{/* Row 2: meta */}
									<div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
										{channel && (
											<span className="max-w-[80px] truncate">
												{channel.name}
											</span>
										)}
										<span className="flex shrink-0 items-center gap-0.5">
											<Clock className="h-2.5 w-2.5" />
											{formatRelativeTime(run.createdAt)}
										</span>
										{cost > 0 && (
											<span className="flex shrink-0 items-center gap-0.5 tabular-nums text-amber-400">
												<DollarSign className="h-2.5 w-2.5" />
												{cost.toFixed(4)}
											</span>
										)}
									</div>

									{/* Row 3: progress bar for active runs */}
									{isActive && total > 0 && (
										<div className="mt-2 flex items-center gap-2">
											<div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
												<div
													className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500"
													style={{ width: `${pct}%` }}
												/>
											</div>
											<span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
												{completed}/{total}
											</span>
										</div>
									)}
								</button>
							);
						})}
					</div>
				)}
			</div>

			{/* Pagination footer */}
			{runsTotal > pageSize && (
				<>
					<Separator className="opacity-40" />
					<div className="flex items-center justify-between px-3 py-2 text-xs">
						<span className="tabular-nums text-muted-foreground">
							{page * pageSize + 1}–{Math.min((page + 1) * pageSize, runsTotal)}{" "}
							of {runsTotal}
						</span>
						<div className="flex items-center gap-1">
							<button
								onClick={() => setPage(page - 1)}
								disabled={page === 0}
								className="rounded-md p-1 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
							>
								<ChevronLeft className="h-3.5 w-3.5" />
							</button>
							<span className="text-[10px] tabular-nums text-muted-foreground">
								{currentPage}/{totalPages}
							</span>
							<button
								onClick={() => setPage(page + 1)}
								disabled={(page + 1) * pageSize >= runsTotal}
								className="rounded-md p-1 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
							>
								<ChevronRight className="h-3.5 w-3.5" />
							</button>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
