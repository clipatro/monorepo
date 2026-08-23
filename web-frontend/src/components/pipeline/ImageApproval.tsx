import { useState, useEffect, useMemo, useCallback } from "react";
import {
	Loader2,
	RotateCcw,
	Check,
	X,
	AlertTriangle,
	Pencil,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
	api,
	type RunDetails,
	type RunApproval,
	type Scene,
	type SceneImage,
} from "@/lib/api";
import { usePipelineStore } from "@/stores/pipeline-store";
import { ApprovalDialog } from "./ApprovalDialog";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";

interface ImageApprovalDialogProps {
	approval: RunApproval;
	run: RunDetails;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ImageApprovalDialog({
	approval,
	run,
	open,
	onOpenChange,
}: ImageApprovalDialogProps) {
	const submitApproval = usePipelineStore((s) => s.submitApproval);
	const [scenes, setScenes] = useState<Scene[]>([]);
	const [imagesByScene, setImagesByScene] = useState<Map<string, SceneImage[]>>(
		new Map(),
	);
	const [loading, setLoading] = useState(true);
	const [approving, setApproving] = useState(false);
	const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(
		null,
	);
	const [actionImageId, setActionImageId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Prompt editor state
	const [promptEditSceneId, setPromptEditSceneId] = useState<string | null>(
		null,
	);
	const [promptEditImageId, setPromptEditImageId] = useState<string | null>(
		null,
	);
	const [promptEditText, setPromptEditText] = useState("");
	const [promptEditLoading, setPromptEditLoading] = useState(false);
	const [promptEditRegenerating, setPromptEditRegenerating] = useState(false);

	// Extract storyId from the scene_plan step result
	const storyId = useMemo(() => {
		const scenePlanStep = run.steps.find((s) => s.stepType === "scene_plan");
		return (scenePlanStep?.resultData?.storyId as string) ?? null;
	}, [run]);

	// Fetch scenes, then fetch images for each scene
	const loadImages = useCallback(async () => {
		if (!storyId) return;
		setLoading(true);
		setError(null);
		try {
			const scenesData = await api.listScenes(storyId);
			setScenes(scenesData);
			const imageResults = await Promise.all(
				scenesData.map((s) =>
					api
						.listImages(s.id)
						.then((imgs) => [s.id, imgs] as [string, SceneImage[]])
						.catch(() => [s.id, [] as SceneImage[]] as [string, SceneImage[]]),
				),
			);
			setImagesByScene(new Map(imageResults));
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [storyId]);

	useEffect(() => {
		loadImages();
	}, [loadImages]);

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

	// Regenerate a single scene's image (quick — no prompt edit)
	const handleRegenerateScene = async (sceneId: string) => {
		setRegeneratingSceneId(sceneId);
		setError(null);
		try {
			await api.generateImage(sceneId, "9:16");
			// Reload images for this scene
			const newImages = await api.listImages(sceneId);
			setImagesByScene((prev) => {
				const next = new Map(prev);
				next.set(sceneId, newImages);
				return next;
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setRegeneratingSceneId(null);
		}
	};

	// Accept a single image
	const handleAcceptImage = async (assetId: string, sceneId: string) => {
		setActionImageId(assetId);
		setError(null);
		try {
			await api.acceptImage(assetId);
			const newImages = await api.listImages(sceneId);
			setImagesByScene((prev) => {
				const next = new Map(prev);
				next.set(sceneId, newImages);
				return next;
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setActionImageId(null);
		}
	};

	// Reject a single image
	const handleRejectImage = async (assetId: string, sceneId: string) => {
		setActionImageId(assetId);
		setError(null);
		try {
			await api.rejectImage(assetId);
			const newImages = await api.listImages(sceneId);
			setImagesByScene((prev) => {
				const next = new Map(prev);
				next.set(sceneId, newImages);
				return next;
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setActionImageId(null);
		}
	};

	// Open the prompt editor for a specific image — loads the current compiled prompt
	const handleOpenPromptEditor = async (sceneId: string, imageId: string) => {
		setPromptEditSceneId(sceneId);
		setPromptEditImageId(imageId);
		setPromptEditText("");
		setPromptEditLoading(true);
		setError(null);
		try {
			// Fetch the scene with its latest compiled prompt
			const { prompts } = await api.getScene(sceneId);
			if (prompts.length > 0 && prompts[0]) {
				setPromptEditText(prompts[0].compiled_prompt);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setPromptEditLoading(false);
		}
	};

	// Regenerate with the edited prompt
	const handleRegenerateWithPrompt = async () => {
		if (!promptEditSceneId || !promptEditImageId) return;
		setPromptEditRegenerating(true);
		setError(null);
		try {
			// Reject the old image first if it's not already rejected
			const imgs = imagesByScene.get(promptEditSceneId) ?? [];
			const img = imgs.find((i) => i.id === promptEditImageId);
			if (img && img.type !== "image_rejected") {
				await api.rejectImage(promptEditImageId);
			}
			// Generate a new image with the custom prompt
			const trimmed = promptEditText.trim();
			await api.generateImage(
				promptEditSceneId,
				"9:16",
				trimmed.length > 0 ? trimmed : undefined,
			);
			// Reload images for this scene
			const newImages = await api.listImages(promptEditSceneId);
			setImagesByScene((prev) => {
				const next = new Map(prev);
				next.set(promptEditSceneId, newImages);
				return next;
			});
			// Close the prompt editor
			setPromptEditSceneId(null);
			setPromptEditImageId(null);
			setPromptEditText("");
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setPromptEditRegenerating(false);
		}
	};

	const closePromptEditor = () => {
		setPromptEditSceneId(null);
		setPromptEditImageId(null);
		setPromptEditText("");
	};

	// Find scene for the prompt editor
	const promptEditScene = promptEditSceneId
		? scenes.find((s) => s.id === promptEditSceneId)
		: null;

	return (
		<>
			<ApprovalDialog
				open={open}
				onOpenChange={onOpenChange}
				title="Review Generated Images"
				description={
					loading
						? "Loading scenes and images..."
						: scenes.length === 0
							? "No scenes found."
							: `${scenes.length} scenes. Review the generated images before approving.`
				}
				approveLabel="Approve All Images"
				onApprove={handleApprove}
				onReject={handleReject}
				approving={approving || loading}
				maxWidth="max-w-3xl"
			>
				<div className="space-y-3">
					{error && (
						<div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-600">
							<AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
							<span>{error}</span>
						</div>
					)}

					{loading ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
							<Loader2 className="h-4 w-4 animate-spin" />
							Loading scenes and images...
						</div>
					) : scenes.length === 0 ? (
						<div className="text-sm text-muted-foreground py-4">
							No scenes found.
						</div>
					) : (
						scenes.map((scene) => {
							const images = imagesByScene.get(scene.id) ?? [];
							const isRegenerating = regeneratingSceneId === scene.id;
							return (
								<div
									key={scene.id}
									className="rounded-md border border-border bg-card/50 p-3 space-y-2"
								>
									<div className="flex items-center justify-between gap-2">
										<div className="flex items-center gap-2 min-w-0">
											<Badge variant="outline" className="text-xs shrink-0">
												Scene {scene.order}
											</Badge>
											<span className="text-xs text-muted-foreground shrink-0">
												{scene.expected_duration_seconds}s
											</span>
											{scene.image_requirement === "character_scene" && (
												<Badge
													variant="outline"
													className="text-[10px] text-blue-400 border-blue-800 shrink-0"
												>
													character
												</Badge>
											)}
										</div>
										<Button
											size="sm"
											variant="ghost"
											className="h-6 px-2 text-xs shrink-0"
											disabled={isRegenerating}
											onClick={() => handleRegenerateScene(scene.id)}
										>
											{isRegenerating ? (
												<>
													<Loader2 className="mr-1 h-3 w-3 animate-spin" />
													Regenerating...
												</>
											) : (
												<>
													<RotateCcw className="mr-1 h-3 w-3" />
													Regenerate All
												</>
											)}
										</Button>
									</div>
									<p className="text-sm font-medium">{scene.story_purpose}</p>
									<p className="text-xs italic text-muted-foreground">
										"{scene.narration_text}"
									</p>

									{images.length === 0 ? (
										<div className="text-xs text-muted-foreground">
											No images generated.
										</div>
									) : (
										<div className="grid grid-cols-3 gap-2">
											{images.map((img) => {
												const isActing = actionImageId === img.id;
												const isPending = img.type === "image";
												const isAccepted = img.type === "image_accepted";
												const isRejected = img.type === "image_rejected";
												return (
													<div
														key={img.id}
														className={cn(
															"rounded-md border overflow-hidden bg-muted/20",
															isAccepted && "border-green-600/50",
															isRejected && "border-red-600/30 opacity-60",
														)}
													>
														<div className="relative aspect-[9/16] bg-muted">
															<img
																src={api.assetUrl(img.id)}
																alt={`Scene ${scene.order} image`}
																className="w-full h-full object-cover"
																loading="lazy"
															/>
															<div className="absolute top-1 right-1">
																<Badge
																	variant="outline"
																	className={cn(
																		"text-[10px]",
																		isAccepted &&
																			"text-green-400 border-green-800 bg-card",
																		isRejected &&
																			"text-red-400 border-red-800 bg-card",
																		isPending &&
																			"text-amber-400 border-amber-800 bg-card",
																	)}
																>
																	{isPending
																		? "pending"
																		: img.type.replace("image_", "")}
																</Badge>
															</div>
														</div>
														<div className="p-1.5 text-[10px] text-muted-foreground space-y-1">
															<div>
																{img.width}x{img.height}
															</div>
															<div className="truncate">
																{img.provider}/{img.model}
															</div>
															{img.costUsd > 0 && (
																<div className="text-green-400">
																	${img.costUsd.toFixed(4)}
																</div>
															)}
															{/* Per-image action buttons */}
															<div className="flex items-center gap-1 pt-1 flex-wrap">
																{isPending && (
																	<>
																		<Button
																			size="sm"
																			variant="ghost"
																			className="h-5 px-1 text-[10px] text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30"
																			disabled={isActing}
																			onClick={() =>
																				handleAcceptImage(img.id, scene.id)
																			}
																			title="Accept"
																		>
																			{isActing ? (
																				<Loader2 className="h-2.5 w-2.5 animate-spin" />
																			) : (
																				<Check className="h-2.5 w-2.5" />
																			)}
																		</Button>
																		<Button
																			size="sm"
																			variant="ghost"
																			className="h-5 px-1 text-[10px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
																			disabled={isActing}
																			onClick={() =>
																				handleRejectImage(img.id, scene.id)
																			}
																			title="Reject"
																		>
																			<X className="h-2.5 w-2.5" />
																		</Button>
																	</>
																)}
																{isAccepted && (
																	<Button
																		size="sm"
																		variant="ghost"
																		className="h-5 px-1 text-[10px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
																		disabled={isActing}
																		onClick={() =>
																			handleRejectImage(img.id, scene.id)
																		}
																		title="Reject"
																	>
																		{isActing ? (
																			<Loader2 className="h-2.5 w-2.5 animate-spin" />
																		) : (
																			<X className="h-2.5 w-2.5" />
																		)}
																	</Button>
																)}
																{isRejected && (
																	<Button
																		size="sm"
																		variant="ghost"
																		className="h-5 px-1 text-[10px] text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30"
																		disabled={isActing}
																		onClick={() =>
																			handleAcceptImage(img.id, scene.id)
																		}
																		title="Accept"
																	>
																		{isActing ? (
																			<Loader2 className="h-2.5 w-2.5 animate-spin" />
																		) : (
																			<Check className="h-2.5 w-2.5" />
																		)}
																	</Button>
																)}
																{/* Regenerate this specific image with optional prompt edit */}
																<Button
																	size="sm"
																	variant="ghost"
																	className="h-5 px-1 text-[10px] text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
																	disabled={isActing}
																	onClick={() =>
																		handleOpenPromptEditor(scene.id, img.id)
																	}
																	title="Regenerate with custom prompt"
																>
																	{isActing ? (
																		<Loader2 className="h-2.5 w-2.5 animate-spin" />
																	) : (
																		<Pencil className="h-2.5 w-2.5" />
																	)}
																</Button>
															</div>
														</div>
													</div>
												);
											})}
										</div>
									)}
								</div>
							);
						})
					)}
				</div>
			</ApprovalDialog>

			{/* Prompt editor dialog */}
			<Dialog
				open={promptEditSceneId !== null}
				onOpenChange={(o) => {
					if (!o && !promptEditRegenerating) closePromptEditor();
				}}
			>
				<DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Pencil className="h-4 w-4" />
							Regenerate Image
							{promptEditScene ? ` — Scene ${promptEditScene.order}` : ""}
						</DialogTitle>
						<DialogDescription>
							Edit the prompt below to guide the regeneration. The old image
							will be rejected and a new one generated with your modified
							prompt. Leave empty to use the default compiled prompt.
						</DialogDescription>
					</DialogHeader>

					{promptEditScene && (
						<div className="rounded-md border border-border bg-card/50 p-2 space-y-1 text-xs">
							<div className="font-medium">{promptEditScene.story_purpose}</div>
							<div className="italic text-muted-foreground">
								"{promptEditScene.narration_text}"
							</div>
							<div className="text-muted-foreground">
								Visual event: {promptEditScene.visual_event}
							</div>
						</div>
					)}

					<div className="flex-1 overflow-y-auto space-y-2">
						<Label className="text-xs text-muted-foreground">
							Prompt (edit to customize the regenerated image)
						</Label>
						{promptEditLoading ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
								<Loader2 className="h-4 w-4 animate-spin" />
								Loading current prompt...
							</div>
						) : (
							<Textarea
								value={promptEditText}
								onChange={(e) => setPromptEditText(e.target.value)}
								className="font-mono text-xs min-h-[200px] resize-y"
								placeholder="Edit the prompt or leave empty to use the default compiled prompt..."
							/>
						)}
					</div>

					<DialogFooter className="gap-2">
						<Button
							variant="outline"
							onClick={closePromptEditor}
							disabled={promptEditRegenerating}
						>
							Cancel
						</Button>
						<Button
							onClick={handleRegenerateWithPrompt}
							disabled={promptEditRegenerating || promptEditLoading}
						>
							{promptEditRegenerating ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Regenerating...
								</>
							) : (
								<>
									<RotateCcw className="mr-2 h-4 w-4" />
									Regenerate with Prompt
								</>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
