import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { api, type RunDetails, type RunApproval, type Scene } from "@/lib/api";
import { usePipelineStore } from "@/stores/pipeline-store";
import { ApprovalDialog } from "./ApprovalDialog";

interface ScriptApprovalDialogProps {
	approval: RunApproval;
	run: RunDetails;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ScriptApprovalDialog({
	approval,
	run,
	open,
	onOpenChange,
}: ScriptApprovalDialogProps) {
	const submitApproval = usePipelineStore((s) => s.submitApproval);
	const [scenes, setScenes] = useState<Scene[]>([]);
	const [approving, setApproving] = useState(false);

	// Extract storyId from the scene_plan step result
	const storyId = useMemo(() => {
		const scenePlanStep = run.steps.find((s) => s.stepType === "scene_plan");
		return (scenePlanStep?.resultData?.storyId as string) ?? null;
	}, [run]);

	// Fetch scenes when we have a storyId
	useEffect(() => {
		if (storyId) {
			api
				.listScenes(storyId)
				.then(setScenes)
				.catch(() => {});
		}
	}, [storyId]);

	const handleApprove = async () => {
		setApproving(true);
		try {
			await submitApproval(approval.id, "approved");
			onOpenChange(false);
		} finally {
			setApproving(false);
		}
	};
	const handleReject = async () => {
		setApproving(true);
		try {
			await submitApproval(approval.id, "rejected");
			onOpenChange(false);
		} finally {
			setApproving(false);
		}
	};

	return (
		<ApprovalDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Review Script — Scene Plan"
			description={
				scenes.length > 0
					? `${scenes.length} scenes planned. Review narration and visual direction before approving.`
					: "Loading scenes..."
			}
			approveLabel="Approve Script"
			onApprove={handleApprove}
			onReject={handleReject}
			approving={approving}
			maxWidth="max-w-4xl"
		>
			<div className="space-y-3">
				{scenes.length === 0 ? (
					<div className="text-sm text-muted-foreground py-4">
						Loading scenes...
					</div>
				) : (
					scenes.map((scene) => (
						<div
							key={scene.id}
							className="rounded-md border border-border bg-card/50 p-3 space-y-1.5"
						>
							<div className="flex items-center gap-2">
								<Badge variant="outline" className="text-xs">
									Scene {scene.order}
								</Badge>
								<span className="text-xs text-muted-foreground">
									{scene.expected_duration_seconds}s
								</span>
								{scene.image_requirement === "character_scene" && (
									<Badge
										variant="outline"
										className="text-[10px] text-blue-400 border-blue-800"
									>
										character
									</Badge>
								)}
							</div>
							<p className="text-sm font-medium">{scene.story_purpose}</p>
							<div>
								<span className="text-xs text-muted-foreground">Narration</span>
								<p className="text-sm italic">"{scene.narration_text}"</p>
							</div>
							<div>
								<span className="text-xs text-muted-foreground">Visual</span>
								<p className="text-sm">{scene.visual_event}</p>
							</div>
							<div className="grid grid-cols-2 gap-1.5 text-xs">
								<div>
									<span className="text-muted-foreground">Camera</span>
									<p className="text-foreground">{scene.camera_framing}</p>
								</div>
								<div>
									<span className="text-muted-foreground">Lighting</span>
									<p className="text-foreground">{scene.lighting_and_mood}</p>
								</div>
							</div>
						</div>
					))
				)}
			</div>
		</ApprovalDialog>
	);
}
