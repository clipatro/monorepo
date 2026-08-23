import { useState, useEffect } from "react";
import {
	RotateCcw,
	AlertTriangle,
	Loader2,
	ChevronDown,
	ChevronRight,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { RunStep } from "@/lib/api";
import { usePipelineStore } from "@/stores/pipeline-store";
import { StepStatusBadge } from "./StatusBadges";

// Approval-only step types — these are human checkpoints, not generation steps.
// Re-running them doesn't make sense (they have no handler).
const APPROVAL_STEP_TYPES = new Set([
	"story_approval",
	"script_approval",
	"image_review",
	"similarity_review",
]);

// Step types that have downstream dependents (cascade is meaningful)
const CASCADEABLE_STEP_TYPES = new Set([
	"concept_intake",
	"content_classification",
	"research",
	"novelty_context",
	"generate_candidates",
	"duplicate_detection",
	"scene_plan",
	"image_prompt_compilation",
	"image_generation",
	"voice_generation",
]);

// Human-readable descriptions for what re-running each step type does
const RERUN_DESCRIPTIONS: Record<string, string> = {
	concept_intake: "Re-process the topic and channel configuration.",
	content_classification:
		"Re-classify the content type (fictional, psychology, true case).",
	research: "Re-run web research and fact gathering.",
	novelty_context: "Re-fetch novelty context from existing stories.",
	generate_candidates: "Generate new story candidates from scratch.",
	duplicate_detection:
		"Re-check candidates against existing stories for duplicates.",
	scene_plan: "Re-plan scenes and narration from the approved story.",
	image_prompt_compilation: "Re-compile image prompts for all scenes.",
	image_generation:
		"Re-generate all scene images. This will create new images.",
	voice_generation: "Re-synthesize voice-over from scene narration.",
	audio_timing: "Re-cut gameplay video to match audio duration.",
	package_assembly: "Re-assemble the export package ZIP.",
};

interface StepDetailDialogProps {
	step: RunStep | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function StepDetailDialog({
	step,
	open,
	onOpenChange,
}: StepDetailDialogProps) {
	const rerunStep = usePipelineStore((s) => s.rerunStep);
	const [rerunLoading, setRerunLoading] = useState(false);
	const [rerunError, setRerunError] = useState<string | null>(null);
	const [showRerunConfirm, setShowRerunConfirm] = useState(false);
	const [cascade, setCascade] = useState(false);
	const [showAdvanced, setShowAdvanced] = useState(false);

	// Reset state when step changes
	useEffect(() => {
		setRerunError(null);
		setShowRerunConfirm(false);
		setCascade(false);
		setShowAdvanced(false);
	}, [step?.id]);

	// Determine if this step can be re-run
	const canRerun =
		step && ["completed", "failed", "skipped"].includes(step.status);
	const isApprovalStep = step ? APPROVAL_STEP_TYPES.has(step.stepType) : false;
	const canCascade = step ? CASCADEABLE_STEP_TYPES.has(step.stepType) : false;

	const handleRerun = async () => {
		if (!step) return;
		setRerunLoading(true);
		setRerunError(null);
		try {
			await rerunStep(step.id, cascade);
			onOpenChange(false);
		} catch (err) {
			setRerunError(err instanceof Error ? err.message : String(err));
		} finally {
			setRerunLoading(false);
			setShowRerunConfirm(false);
		}
	};

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>{step?.label ?? "Step Details"}</DialogTitle>
						{step && (
							<div className="flex items-center gap-2 mt-1">
								<StepStatusBadge status={step.status} />
								{step.provider && (
									<Badge variant="outline">{step.provider}</Badge>
								)}
								{step.model && <Badge variant="outline">{step.model}</Badge>}
								{step.actualCostUsd !== null && step.actualCostUsd > 0 && (
									<Badge variant="outline" className="text-green-400">
										${step.actualCostUsd.toFixed(4)}
									</Badge>
								)}
							</div>
						)}
					</DialogHeader>
					{step && (
						<div className="space-y-4">
							{/* Timing */}
							<div className="grid grid-cols-2 gap-3 text-sm">
								<div>
									<Label className="text-xs text-muted-foreground">
										Started
									</Label>
									<div>
										{step.startedAt
											? new Date(step.startedAt).toLocaleString()
											: "—"}
									</div>
								</div>
								<div>
									<Label className="text-xs text-muted-foreground">
										Completed
									</Label>
									<div>
										{step.completedAt
											? new Date(step.completedAt).toLocaleString()
											: "—"}
									</div>
								</div>
							</div>

							<Separator />

							{/* Input data */}
							<div>
								<Label className="text-xs text-muted-foreground">
									Input Data
								</Label>
								<pre className="mt-1 rounded-md border bg-muted/20 p-3 text-xs overflow-x-auto max-h-40">
									{JSON.stringify(step.stepData, null, 2)}
								</pre>
							</div>

							{/* Result data */}
							{step.resultData && (
								<div>
									<Label className="text-xs text-muted-foreground">
										Result Data
									</Label>
									<pre className="mt-1 rounded-md border bg-muted/20 p-3 text-xs overflow-x-auto max-h-40">
										{JSON.stringify(step.resultData, null, 2)}
									</pre>
								</div>
							)}

							{/* Attempts */}
							{step.attempts.length > 0 && (
								<>
									<Separator />
									<div>
										<Label className="text-xs text-muted-foreground">
											Attempts ({step.attempts.length})
										</Label>
										<div className="mt-2 space-y-2">
											{step.attempts.map((attempt) => (
												<div
													key={attempt.id}
													className="rounded-md border p-2 text-xs"
												>
													<div className="flex items-center justify-between">
														<span className="font-medium">
															Attempt {attempt.attemptNumber}
														</span>
														<Badge
															variant="outline"
															className={cn(
																attempt.status === "completed" &&
																	"text-green-400 border-green-800",
																attempt.status === "failed" &&
																	"text-red-400 border-red-800",
																attempt.status === "running" &&
																	"text-blue-400 border-blue-800",
															)}
														>
															{attempt.status}
														</Badge>
													</div>
													{attempt.errorMessage && (
														<div className="mt-1 text-red-400">
															{attempt.errorMessage}
														</div>
													)}
													{attempt.logs && (
														<pre className="mt-1 text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
															{attempt.logs}
														</pre>
													)}
													{attempt.costUsd !== null && attempt.costUsd > 0 && (
														<div className="mt-1 text-amber-400">
															Cost: ${attempt.costUsd.toFixed(4)}
														</div>
													)}
												</div>
											))}
										</div>
									</div>
								</>
							)}

							{/* Re-run section */}
							{canRerun && !isApprovalStep && (
								<>
									<Separator />
									<div className="space-y-3">
										<div className="flex items-center gap-2">
											<RotateCcw className="h-4 w-4 text-muted-foreground" />
											<Label className="text-sm font-medium">
												Re-run this step
											</Label>
										</div>
										<p className="text-xs text-muted-foreground">
											{RERUN_DESCRIPTIONS[step.stepType] ??
												"Re-execute this step from scratch."}
										</p>

										{rerunError && (
											<div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-600">
												<AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
												<span>{rerunError}</span>
											</div>
										)}

										{/* Advanced: cascade option */}
										{canCascade && (
											<div className="space-y-1">
												<button
													type="button"
													onClick={() => setShowAdvanced(!showAdvanced)}
													className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
												>
													{showAdvanced ? (
														<ChevronDown className="h-3 w-3" />
													) : (
														<ChevronRight className="h-3 w-3" />
													)}
													Advanced options
												</button>
												{showAdvanced && (
													<div className="ml-4 mt-2 space-y-2 rounded-md border bg-muted/20 p-3">
														<label className="flex items-start gap-2 cursor-pointer">
															<input
																type="checkbox"
																checked={cascade}
																onChange={(e) => setCascade(e.target.checked)}
																className="mt-0.5 h-4 w-4 rounded border-border"
															/>
															<div className="space-y-0.5">
																<span className="text-xs font-medium">
																	Cascade to downstream steps
																</span>
																<p className="text-xs text-muted-foreground">
																	Also re-run all steps that depend on this one.
																	Use this if the output of this step changed
																	and downstream steps need to use the new
																	output.
																</p>
															</div>
														</label>
													</div>
												)}
											</div>
										)}

										<Button
											size="sm"
											variant="outline"
											onClick={() => setShowRerunConfirm(true)}
											disabled={rerunLoading}
											className="w-full"
										>
											{rerunLoading ? (
												<>
													<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
													Re-running...
												</>
											) : (
												<>
													<RotateCcw className="mr-1.5 h-3.5 w-3.5" />
													Re-run{cascade ? " (with downstream)" : ""}
												</>
											)}
										</Button>
									</div>
								</>
							)}

							{/* Approval steps — explain why they can't be re-run */}
							{canRerun && isApprovalStep && (
								<>
									<Separator />
									<div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
										This is a human approval checkpoint. To change the decision,
										submit a new approval from the run header.
									</div>
								</>
							)}
						</div>
					)}
				</DialogContent>
			</Dialog>

			{/* Re-run confirmation dialog */}
			<AlertDialog open={showRerunConfirm} onOpenChange={setShowRerunConfirm}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Confirm re-run</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-2">
								<p>
									You are about to re-run <strong>{step?.label}</strong>.
									{cascade && <> All downstream steps will also be re-run.</>}
								</p>
								<div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-600">
									<AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
									<span>
										This will make new API calls and may incur costs.
										{step?.stepType === "image_generation" &&
											" New images will be generated."}
										{step?.stepType === "voice_generation" &&
											" A new voiceover will be synthesized."}
										{cascade && " All dependent steps will also re-execute."}
									</span>
								</div>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleRerun}
							className="bg-blue-600 hover:bg-blue-700 text-white"
						>
							{rerunLoading ? (
								<>
									<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
									Re-running...
								</>
							) : (
								"Re-run step"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
