import { useMemo, useState, useEffect } from "react";
import { Download, Package, Clock, Mic, Film, Image as ImageIcon, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type RunDetails } from "@/lib/api";
import { AudioPlayer } from "@/components/ui/media-player";

interface RunSummaryProps {
	run: RunDetails;
}

interface AcceptedImage {
	assetId: string;
	sceneId: string;
	order: number;
	filePath: string;
	mimeType: string;
	width: number;
	height: number;
	checksum: string;
	provider: string;
	model: string;
	costUsd: number;
	isCharacterScene: boolean;
	createdAt: string;
}

interface VoiceResult {
	storyId: string;
	voiceoverId: string;
	durationMs: number;
	provider: string;
	model: string;
	warning: string | null;
}

interface TimingResult {
	voiceoverId: string;
	gameplayVideo: {
		sourceFile: string;
		startSec: string;
		durationSec: string;
		muted: boolean;
	};
}

interface PackageResult {
	storyId: string;
	packagePath: string;
	manifest: {
		storyTitle: string;
		audio: {
			durationSec: string;
			provider: string;
			model: string;
			voiceId: string;
		};
		scenes: {
			count: number;
			timelineFile: string;
			imageTimeline?: Array<{
				scene: number;
				imageStartSec: string;
				imageEndSec: string;
				imageDurationSec: string;
				narrationStartSec: string;
				narrationEndSec: string;
			}>;
		};
		gameplay: { sourceFile: string; durationSec: string; file: string; muted: boolean };
		captions: { file: string; precision: string };
		instructions: string;
	};
	files: string[];
}

export function RunSummary({ run }: RunSummaryProps) {
	// Get storyId from the scene_plan step result
	const storyId = useMemo(() => {
		const scenePlanStep = run.steps.find((s) => s.stepType === "scene_plan");
		return scenePlanStep?.resultData?.storyId as string | undefined;
	}, [run]);

	// Fetch actual accepted images from the database (not the stale step snapshot).
	// This ensures regenerated images during approval are shown correctly.
	const [imageResults, setImageResults] = useState<AcceptedImage[]>([]);
	const [imagesLoading, setImagesLoading] = useState(false);

	useEffect(() => {
		if (!storyId) {
			setImageResults([]);
			return;
		}
		setImagesLoading(true);
		api
			.getAcceptedImages(storyId)
			.then((images) => setImageResults(images))
			.catch(() => setImageResults([]))
			.finally(() => setImagesLoading(false));
	}, [storyId]);

	const voiceResult = useMemo(() => {
		const step = run.steps.find((s) => s.stepType === "voice_generation");
		return step?.resultData as VoiceResult | undefined;
	}, [run]);

	const timingResult = useMemo(() => {
		const step = run.steps.find((s) => s.stepType === "audio_timing");
		return step?.resultData as TimingResult | undefined;
	}, [run]);

	const packageResult = useMemo(() => {
		const step = run.steps.find((s) => s.stepType === "package_assembly");
		return step?.resultData as PackageResult | undefined;
	}, [run]);

	if (!packageResult) return null;

	const manifest = packageResult.manifest;
	// Use the accurate cost from the cost ledger (attached by the API as
	// run.totalCostUsd), not the sum of step.actualCostUsd which misses
	// handlers that don't return costUsd (research, candidates, scene_plan, etc.)
	const totalCost = run.totalCostUsd ?? run.steps.reduce((sum, s) => sum + (s.actualCostUsd ?? 0), 0);

	return (
		<Card className="border-border bg-card/50">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-amber-400">
					<Package className="h-5 w-5" />
					Package Ready — {manifest.storyTitle}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Download button */}
				<div className="flex items-center gap-3">
					<a href={api.downloadPackageUrl(run.id)} download>
						<Button size="default">
							<Download className="mr-2 h-4 w-4" />
							Download Export Package (ZIP)
						</Button>
					</a>
					<span className="text-xs text-muted-foreground">
						{packageResult.files.length} files included
					</span>
				</div>

				{/* Package contents */}
				<div className="rounded-md border border-border bg-card/50 p-3 space-y-2">
					<div className="text-sm font-medium">Package Contents</div>
					<div className="grid grid-cols-1 gap-1.5 text-xs">
						{packageResult.files.map((file) => {
							const icon = file.endsWith(".wav")
								? <Mic className="h-3.5 w-3.5 text-blue-400" />
								: file.endsWith(".mp4")
								? <Film className="h-3.5 w-3.5 text-purple-400" />
								: file.endsWith(".srt")
								? <FileText className="h-3.5 w-3.5 text-amber-400" />
								: file.endsWith(".csv")
								? <FileText className="h-3.5 w-3.5 text-amber-400" />
								: <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
							return (
								<div key={file} className="flex items-center gap-2">
									{icon}
									<span className="font-mono">{file}</span>
								</div>
							);
						})}
					</div>
				</div>

			{/* Generated images preview with timeline */}
			{imagesLoading ? (
				<div className="rounded-md border border-border bg-card/50 p-3 text-xs text-muted-foreground">
					Loading images...
				</div>
			) : imageResults.length > 0 ? (
				<div className="rounded-md border border-border bg-card/50 p-3 space-y-2">
					<div className="flex items-center gap-2 text-sm font-medium">
						<ImageIcon className="h-4 w-4" />
						Generated Images ({imageResults.length})
					</div>
					<div className="grid grid-cols-4 gap-2">
						{imageResults.map((img) => {
							// Find the image timeline entry for this scene
							const timelineEntry = manifest.scenes.imageTimeline?.find(
								(t) => t.scene === img.order,
							);
							return (
								<div
									key={img.assetId}
									className="rounded-md border overflow-hidden bg-muted/20"
								>
									<div className="relative aspect-[9/16] bg-muted">
										<img
											src={api.assetUrl(img.assetId)}
											alt={`Scene ${img.order} image`}
											className="w-full h-full object-cover"
											loading="lazy"
										/>
										{timelineEntry && (
											<div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm px-1.5 py-1">
												<div className="text-[10px] text-white font-mono">
													{timelineEntry.imageStartSec}s – {timelineEntry.imageEndSec}s
												</div>
												<div className="text-[9px] text-white/70">
													{timelineEntry.imageDurationSec}s display
												</div>
											</div>
										)}
									</div>
									<div className="p-1 text-[10px] text-muted-foreground">
										<div>Scene {img.order}</div>
										<div>${img.costUsd.toFixed(4)}</div>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			) : null}

				{/* Image timeline table */}
				{manifest.scenes.imageTimeline && manifest.scenes.imageTimeline.length > 0 && (
					<div className="rounded-md border border-border bg-card/50 p-3 space-y-2">
						<div className="flex items-center gap-2 text-sm font-medium">
							<Clock className="h-4 w-4 text-amber-400" />
							Image Display Timeline
						</div>
						<div className="space-y-1">
							{/* Header */}
							<div className="grid grid-cols-4 gap-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
								<div>Scene</div>
								<div>Image Start</div>
								<div>Image End</div>
								<div>Duration</div>
							</div>
							{manifest.scenes.imageTimeline.map((t) => (
								<div
									key={t.scene}
									className="grid grid-cols-4 gap-2 text-xs font-mono py-1 border-t border-border/50"
								>
									<div className="flex items-center gap-1.5">
										<Badge variant="outline" className="text-[10px]">
											{t.scene}
										</Badge>
									</div>
									<div className="text-foreground">{t.imageStartSec}s</div>
									<div className="text-foreground">{t.imageEndSec}s</div>
									<div className="text-amber-400">{t.imageDurationSec}s</div>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Audio details + player */}
				{voiceResult && (
					<div className="rounded-md border border-border bg-card/50 p-3 space-y-2">
						<div className="flex items-center gap-2 text-sm font-medium">
							<Mic className="h-4 w-4 text-blue-400" />
							Voiceover
						</div>
						<div className="grid grid-cols-2 gap-2 text-xs">
							<div>
								<span className="text-muted-foreground">Duration</span>
								<p className="text-foreground flex items-center gap-1">
									<Clock className="h-3 w-3" />
									{(voiceResult.durationMs / 1000).toFixed(1)}s
								</p>
							</div>
							<div>
								<span className="text-muted-foreground">Provider</span>
								<p className="text-foreground">{voiceResult.provider}</p>
							</div>
							<div>
								<span className="text-muted-foreground">Model</span>
								<p className="text-foreground truncate">{voiceResult.model}</p>
							</div>
							<div>
								<span className="text-muted-foreground">Voice</span>
								<p className="text-foreground">{manifest.audio.voiceId}</p>
							</div>
						</div>
						{/* Audio player */}
						<AudioPlayer
							src={api.voiceoverAudioUrl(voiceResult.voiceoverId)}
						/>
					</div>
				)}

				{/* Gameplay video */}
				{timingResult && (
					<div className="rounded-md border border-border bg-card/50 p-3 space-y-1.5">
						<div className="flex items-center gap-2 text-sm font-medium">
							<Film className="h-4 w-4 text-purple-400" />
							Gameplay Background
						</div>
						<div className="grid grid-cols-2 gap-2 text-xs">
							<div>
								<span className="text-muted-foreground">Source</span>
								<p className="text-foreground">{timingResult.gameplayVideo.sourceFile}</p>
							</div>
							<div>
								<span className="text-muted-foreground">Duration</span>
								<p className="text-foreground">{timingResult.gameplayVideo.durationSec}s</p>
							</div>
							<div>
								<span className="text-muted-foreground">Start</span>
								<p className="text-foreground">{timingResult.gameplayVideo.startSec}s</p>
							</div>
							<div>
								<span className="text-muted-foreground">Audio</span>
								<p className="text-foreground">
									{timingResult.gameplayVideo.muted ? "muted" : "with audio"}
								</p>
							</div>
						</div>
					</div>
				)}

				{/* CapCut instructions */}
				<div className="rounded-md border border-border bg-card/50 p-3 space-y-1">
					<div className="text-sm font-medium">CapCut Assembly Instructions</div>
					<p className="text-xs text-muted-foreground">{manifest.instructions}</p>
				</div>

				{/* Total cost */}
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">Total Run Cost</span>
					<Badge variant="outline" className="text-amber-400 border-amber-800">
						${totalCost.toFixed(4)}
					</Badge>
				</div>
			</CardContent>
		</Card>
	);
}
