import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
	Play,
	Plus,
	Activity,
	Package,
	CheckCircle2,
	XCircle,
	DollarSign,
	TrendingUp,
	Loader2,
	PanelLeft,
	X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePipelineStore } from "@/stores/pipeline-store";
import { RunListSidebar } from "@/components/pipeline/RunListSidebar";
import { PipelineGraph } from "@/components/pipeline/PipelineGraph";
import { CreateRunDialog } from "@/components/pipeline/CreateRunDialog";
import { StepDetailDialog } from "@/components/pipeline/StepDetailDialog";
import {
	ApprovalDialogManager,
	isReviewableApproval,
	approvalLabel,
} from "@/components/pipeline/ApprovalDialogManager";
import { RunSummaryDialog } from "@/components/pipeline/RunSummaryDialog";
import { RunStatusBadge } from "@/components/pipeline/StatusBadges";
import type { RunApproval } from "@/lib/api";
import { cn } from "@/lib/utils";

export function PipelinePage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const runId = searchParams.get("run");
	const [sidebarOpen, setSidebarOpen] = useState(false);

	const init = usePipelineStore((s) => s.init);
	const dispose = usePipelineStore((s) => s.dispose);
	const selectRun = usePipelineStore((s) => s.selectRun);
	const channels = usePipelineStore((s) => s.channels);
	const runs = usePipelineStore((s) => s.runs);
	const runsTotal = usePipelineStore((s) => s.runsTotal);
	const selectedRun = usePipelineStore((s) => s.selectedRun);
	const runLoading = usePipelineStore((s) => s.runLoading);
	const pipeline = usePipelineStore((s) => s.pipeline);
	const showCreateDialog = usePipelineStore((s) => s.showCreateDialog);
	const setShowCreateDialog = usePipelineStore((s) => s.setShowCreateDialog);
	const selectedStep = usePipelineStore((s) => s.selectedStep);
	const showStepDialog = usePipelineStore((s) => s.showStepDialog);
	const setShowStepDialog = usePipelineStore((s) => s.setShowStepDialog);
	const setSelectedStep = usePipelineStore((s) => s.setSelectedStep);
	const cancelRun = usePipelineStore((s) => s.cancelRun);
	const setActiveApprovalId = usePipelineStore((s) => s.setActiveApprovalId);
	const submitApproval = usePipelineStore((s) => s.submitApproval);
	const showSummaryDialog = usePipelineStore((s) => s.showSummaryDialog);
	const setShowSummaryDialog = usePipelineStore((s) => s.setShowSummaryDialog);
	const runCostSummary = usePipelineStore((s) => s.runCostSummary);
	const runCostLoading = usePipelineStore((s) => s.runCostLoading);

	useEffect(() => {
		init();
		return () => dispose();
	}, [init, dispose]);

	useEffect(() => {
		selectRun(runId);
	}, [runId, selectRun]);

	// Close mobile sidebar when a run is selected via URL
	useEffect(() => {
		if (runId) setSidebarOpen(false);
	}, [runId]);

	const handleStepClick = (stepId: string) => {
		if (!selectedRun) return;
		const step = selectedRun.steps.find((s) => s.id === stepId);
		if (step) {
			setSelectedStep(step);
			setShowStepDialog(true);
		}
	};

	const completedSteps =
		selectedRun?.steps.filter((s) => s.status === "completed").length ?? 0;
	const totalSteps =
		selectedRun?.steps.filter((s) => s.status !== "skipped").length ?? 0;

	const progressPct =
		totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

	const pendingApprovals = (selectedRun?.approvals ?? [])
		.filter((a) => a.status === "pending")
		.filter(
			(a, i, arr) =>
				arr.findIndex((b) => b.approvalType === a.approvalType) === i,
		);
	const isCompleted = selectedRun?.status === "completed";

	const stats = useMemo(() => {
		const activeRuns = runs.filter(
			(r) =>
				r.status === "running" ||
				r.status === "pending" ||
				r.status === "paused",
		).length;
		const completedRuns = runs.filter((r) => r.status === "completed").length;
		const failedRuns = runs.filter(
			(r) => r.status === "failed" || r.status === "cancelled",
		).length;
		const totalCost = runs.reduce((sum, r) => sum + (r.totalCostUsd ?? 0), 0);
		return { activeRuns, completedRuns, failedRuns, totalCost };
	}, [runs]);

	const runCost = runCostSummary;
	const stepCosts = useMemo(() => {
		if (!runCost) return [];
		return runCost.byStep.slice(0, 5);
	}, [runCost]);

	const handleSimpleApproval = async (
		approval: RunApproval,
		decision: "approved" | "rejected",
	) => {
		await submitApproval(approval.id, decision);
	};

	return (
		<div className="-mx-4 -my-6 sm:-mx-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-background">
			{/* Top bar */}
			<div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-2.5 backdrop-blur-sm sm:px-6 sm:py-3">
				<div className="flex items-center gap-2 sm:gap-3 min-w-0">
					{/* Mobile sidebar toggle */}
					<button
						onClick={() => setSidebarOpen(true)}
						className="inline-flex items-center justify-center rounded-lg border border-border/40 p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:hidden"
						aria-label="Open run list"
					>
						<PanelLeft className="h-4 w-4" />
					</button>
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-sm sm:h-9 sm:w-9">
						<Activity className="h-4 w-4 sm:h-5 sm:w-5" />
					</div>
					<div className="min-w-0">
						<h1 className="text-base font-semibold tracking-tight sm:text-lg">
							Pipeline
						</h1>
						<p className="hidden text-xs text-muted-foreground sm:block">
							Durable workflow runner with live updates
						</p>
					</div>
				</div>

				<div className="flex items-center gap-1.5 sm:gap-2">
					{/* Stats — hide on small screens, show condensed on md */}
					<div className="hidden items-center gap-2 lg:flex">
						<StatPill
							icon={<TrendingUp className="h-3.5 w-3.5" />}
							label="Active"
							value={String(stats.activeRuns)}
							variant="active"
						/>
						<StatPill
							icon={<CheckCircle2 className="h-3.5 w-3.5" />}
							label="Done"
							value={String(stats.completedRuns)}
							variant="done"
						/>
						<StatPill
							icon={<DollarSign className="h-3.5 w-3.5" />}
							label="Cost"
							value={`$${stats.totalCost.toFixed(4)}`}
							variant="cost"
						/>
						<StatPill label="Total" value={String(runsTotal)} variant="muted" />
					</div>
					{/* Condensed stats on md only */}
					<div className="hidden items-center gap-1.5 md:flex lg:hidden">
						<StatPill value={String(stats.activeRuns)} variant="active" />
						<StatPill value={String(stats.completedRuns)} variant="done" />
						<StatPill value={`$${stats.totalCost.toFixed(2)}`} variant="cost" />
					</div>

					<Button
						size="sm"
						onClick={() => setShowCreateDialog(true)}
						disabled={channels.length === 0}
						className="shadow-sm shrink-0"
					>
						<Plus className="mr-1.5 h-4 w-4" />
						<span className="hidden sm:inline">New Run</span>
						<span className="sm:hidden">Run</span>
					</Button>
				</div>
			</div>

			{/* Main content */}
			<div className="flex flex-1 overflow-hidden">
				{/* Mobile sidebar overlay */}
				{sidebarOpen && (
					<div
						className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden"
						onClick={() => setSidebarOpen(false)}
					/>
				)}

				{/* Left: run list — fixed sidebar on desktop, slide-in drawer on mobile */}
				<div
					className={cn(
						"fixed inset-y-0 left-0 z-50 w-[85vw] max-w-sm shrink-0 border-r border-border/40 overflow-hidden bg-card/95 backdrop-blur-md transition-transform duration-300 md:relative md:translate-x-0 md:bg-card/20 md:backdrop-blur-none",
						"top-0 md:top-0",
						"md:w-80",
						sidebarOpen
							? "translate-x-0"
							: "-translate-x-full md:translate-x-0",
					)}
				>
					{/* Mobile close button */}
					<div className="flex items-center justify-between border-b border-border/40 px-3 py-2 md:hidden">
						<span className="text-sm font-medium">Runs</span>
						<button
							onClick={() => setSidebarOpen(false)}
							className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
							aria-label="Close run list"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
					<RunListSidebar />
				</div>

				{/* Right: graph area */}
				<div className="flex flex-1 flex-col overflow-hidden">
					{selectedRun ? (
						<>
							{/* Run header */}
							<div className="flex flex-col gap-2 px-4 py-2.5 border-b border-border/40 sm:px-6 sm:py-3">
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2.5">
											<h2 className="text-sm font-semibold truncate">
												{selectedRun.topic}
											</h2>
											<RunStatusBadge status={selectedRun.status} />
										</div>
										<div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
											<span className="tabular-nums">
												{completedSteps}/{totalSteps} steps
											</span>
											<div className="flex items-center gap-2">
												<div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden sm:w-32">
													<div
														className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500"
														style={{ width: `${progressPct}%` }}
													/>
												</div>
												<span className="tabular-nums">{progressPct}%</span>
											</div>
											{runCostLoading ? (
												<Loader2 className="h-3 w-3 animate-spin" />
											) : runCost && runCost.totalCost > 0 ? (
												<span className="flex items-center gap-0.5 text-amber-400 tabular-nums">
													<DollarSign className="h-3 w-3" />
													{runCost.totalCost.toFixed(4)}
													<span className="text-muted-foreground ml-1 hidden sm:inline">
														({runCost.totalPaidCalls} paid,{" "}
														{runCost.totalFreeCalls} free)
													</span>
												</span>
											) : (
												<span className="flex items-center gap-0.5 tabular-nums">
													<DollarSign className="h-3 w-3" />
													$0.00
												</span>
											)}
										</div>
									</div>
								</div>

								{/* Action buttons — wrap on mobile */}
								<div className="flex flex-wrap items-center gap-2 shrink-0">
									{pendingApprovals.map((approval) => {
										const step = selectedRun.steps.find(
											(s) => s.id === approval.stepId,
										);
										const reviewable = isReviewableApproval(
											approval.approvalType,
											step?.stepType,
										);
										if (reviewable) {
											return (
												<Button
													key={approval.id}
													size="sm"
													variant="outline"
													className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 shadow-sm"
													onClick={() => setActiveApprovalId(approval.id)}
												>
													{approvalLabel(approval.approvalType, step?.stepType)}
												</Button>
											);
										}
										return (
											<div
												key={approval.id}
												className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2 py-1 shadow-sm"
											>
												<span className="text-xs text-amber-400 font-medium px-1">
													{approvalLabel(approval.approvalType, step?.stepType)}
												</span>
												<Button
													size="sm"
													variant="ghost"
													className="h-6 px-2 text-emerald-400 hover:bg-emerald-500/10"
													onClick={() =>
														handleSimpleApproval(approval, "approved")
													}
												>
													<CheckCircle2 className="h-3.5 w-3.5" />
												</Button>
												<Button
													size="sm"
													variant="ghost"
													className="h-6 px-2 text-red-400 hover:bg-red-500/10"
													onClick={() =>
														handleSimpleApproval(approval, "rejected")
													}
												>
													<XCircle className="h-3.5 w-3.5" />
												</Button>
											</div>
										);
									})}

									{isCompleted && (
										<Button
											size="sm"
											variant="outline"
											className="shadow-sm"
											onClick={() => setShowSummaryDialog(true)}
										>
											<Package className="mr-1.5 h-3.5 w-3.5" />
											View Results
										</Button>
									)}
									{selectedRun.status === "running" && (
										<Button
											size="sm"
											variant="outline"
											onClick={cancelRun}
											className="shadow-sm"
										>
											Cancel
										</Button>
									)}
								</div>
							</div>

							{/* Cost breakdown strip — horizontally scrollable on mobile */}
							{runCost && runCost.totalCost > 0 && (
								<div className="flex items-center gap-3 px-4 py-2 border-b border-border/30 bg-card/10 text-[10px] text-muted-foreground overflow-x-auto themed-scroll sm:px-6">
									<span className="font-medium uppercase tracking-wider shrink-0">
										Cost by provider:
									</span>
									{Object.entries(runCost.byProvider)
										.sort(([, a], [, b]) => b.cost - a.cost)
										.map(([provider, info]) => (
											<span
												key={provider}
												className="flex items-center gap-1.5 shrink-0"
											>
												<Badge
													variant="outline"
													className="text-[9px] px-1.5 py-0"
												>
													{provider}
												</Badge>
												<span className="text-amber-400 tabular-nums">
													${info.cost.toFixed(4)}
												</span>
												<span className="text-muted-foreground/60">
													({info.calls})
												</span>
											</span>
										))}
									{stepCosts.length > 0 && (
										<>
											<span className="text-border">|</span>
											<span className="font-medium uppercase tracking-wider shrink-0">
												Top steps:
											</span>
											{stepCosts.map((s, i) => (
												<span
													key={`${s.stepId}-${s.capability}-${i}`}
													className="flex items-center gap-1.5 shrink-0"
												>
													<span className="text-foreground/80">
														{s.capability.replace(/\./g, " ")}
													</span>
													<span className="text-amber-400 tabular-nums">
														${s.cost.toFixed(4)}
													</span>
												</span>
											))}
										</>
									)}
								</div>
							)}

							{/* Graph — fills all remaining space */}
							<div className="relative flex-1 overflow-hidden">
								<PipelineGraph
									pipeline={pipeline}
									run={selectedRun}
									onStepClick={handleStepClick}
								/>
							</div>
						</>
					) : runLoading ? (
						<div className="flex flex-1 items-center justify-center">
							<div className="flex flex-col items-center gap-3">
								<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
								<span className="text-sm text-muted-foreground">
									Loading run...
								</span>
							</div>
						</div>
					) : (
						<div className="flex flex-1 items-center justify-center p-4">
							<div className="text-center space-y-3">
								<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 shadow-sm">
									<Activity className="h-8 w-8 text-muted-foreground/50" />
								</div>
								<div className="space-y-1">
									<p className="text-sm font-medium text-muted-foreground">
										No run selected
									</p>
									<p className="text-xs text-muted-foreground">
										Select a run from the sidebar or create a new one
									</p>
								</div>
								<div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
									{channels.length > 0 && (
										<Button
											size="sm"
											variant="outline"
											className="shadow-sm"
											onClick={() => setShowCreateDialog(true)}
										>
											<Play className="mr-1.5 h-3.5 w-3.5" />
											Start a new run
										</Button>
									)}
									<Button
										size="sm"
										variant="ghost"
										className="shadow-sm md:hidden"
										onClick={() => setSidebarOpen(true)}
									>
										<PanelLeft className="mr-1.5 h-3.5 w-3.5" />
										Browse runs
									</Button>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Dialogs */}
			<CreateRunDialog
				open={showCreateDialog}
				onOpenChange={setShowCreateDialog}
			/>
			<StepDetailDialog
				step={selectedStep}
				open={showStepDialog}
				onOpenChange={setShowStepDialog}
			/>
			<ApprovalDialogManager />
			<RunSummaryDialog
				run={selectedRun}
				open={showSummaryDialog}
				onOpenChange={setShowSummaryDialog}
			/>
		</div>
	);
}

// === Stat pill ===

function StatPill({
	icon,
	label,
	value,
	variant = "muted",
}: {
	icon?: React.ReactNode;
	label?: string;
	value: string;
	variant?: "active" | "done" | "cost" | "muted";
}) {
	const variants: Record<string, string> = {
		active: "text-blue-400 bg-blue-500/10 border-blue-500/20",
		done: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
		cost: "text-amber-400 bg-amber-500/10 border-amber-500/20",
		muted: "text-muted-foreground bg-card/30 border-border/40",
	};
	return (
		<div
			className={cn(
				"flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs shadow-sm",
				variants[variant],
			)}
		>
			{icon}
			{label && <span className="text-[10px] opacity-70">{label}</span>}
			<span className="font-semibold tabular-nums">{value}</span>
		</div>
	);
}
