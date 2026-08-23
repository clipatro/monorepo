/**
 * RunSummaryDialog — wraps the RunSummary content in a right sidebar Sheet.
 *
 * Opens when the run completes and the user clicks the "View Results"
 * button in the run header. Can be re-opened any time.
 * Also shows a detailed cost breakdown from the cost tracker API.
 */

import { useEffect, useState } from "react";
import {
	Package,
	DollarSign,
	TrendingUp,
	Cpu,
	Layers,
	Download,
	Clock,
	Mic,
	Film,
	Image as ImageIcon,
	FileText,
	Loader2,
} from "lucide-react";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetBody,
	SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type RunDetails, type RunCostSummary } from "@/lib/api";
import { AudioPlayer, VideoPlayer } from "@/components/ui/media-player";
import { useMemo } from "react";

interface RunSummaryDialogProps {
	run: RunDetails | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function RunSummaryDialog({ run, open, onOpenChange }: RunSummaryDialogProps) {
	const [costSummary, setCostSummary] = useState<RunCostSummary | null>(null);
	const [costLoading, setCostLoading] = useState(false);
	const [hasVideo, setHasVideo] = useState(false);

	useEffect(() => {
		if (!open || !run) {
			setCostSummary(null);
			setHasVideo(false);
			return;
		}
		setCostLoading(true);
		api
			.getRunCostSummary(run.id)
			.then((summary) => setCostSummary(summary))
			.catch(() => setCostSummary(null))
			.finally(() => setCostLoading(false));

		// Check if the video_generation step completed (not skipped)
		const videoStep = run.steps.find((s) => s.stepType === "video_generation");
		const videoData = videoStep?.resultData;
		setHasVideo(!!videoData && !("skipped" in videoData));
	}, [open, run]);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent width="max-w-2xl">
				{run && (
					<>
						<SheetHeader>
							<SheetTitle className="flex items-center gap-2">
								<Package className="h-5 w-5 text-muted-foreground" />
								Run Results
							</SheetTitle>
							<SheetDescription className="">
								{run.topic} — {hasVideo ? "Video & export package ready" : "Export package is ready"}
							</SheetDescription>
						</SheetHeader>
						<SheetBody>
							<div className="space-y-4">
								<RunSummary run={run} />

								{/* Detailed cost breakdown */}
								{costLoading ? (
									<div className="flex items-center gap-2 rounded-xl border border-border/40 bg-card/50 p-3 text-xs text-muted-foreground">
										<Loader2 className="h-3.5 w-3.5 animate-spin" />
										Loading cost breakdown...
									</div>
								) : costSummary && costSummary.entryCount > 0 ? (
									<CostBreakdownCard summary={costSummary} />
								) : null}
							</div>
						</SheetBody>
						<SheetFooter>
							<div className="flex gap-2">
								{hasVideo && (
									<a href={run ? api.videoDownloadUrl(run.id) : "#"} download>
										<Button variant="outline">
											<Film className="mr-2 h-4 w-4" />
											Download Video
										</Button>
									</a>
								)}
								<a href={run ? api.downloadPackageUrl(run.id) : "#"} download>
									<Button>
										<Download className="mr-2 h-4 w-4" />
										Download ZIP
									</Button>
								</a>
							</div>
						</SheetFooter>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}

// === Run Summary content (inline, modernized) ===

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
	gameplayVideo?: {
		sourceFile: string;
		startSec: string;
		durationSec: string;
		muted: boolean;
	} | null;
}

interface PackageResult {
	storyId: string;
	packagePath: string;
	manifest: {
		storyTitle: string;
		audio?: {
			durationSec: string;
			provider: string;
			model: string;
			voiceId: string;
		};
		scenes?: {
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
			clips?: Array<{ order: number; file: string; durationSec: string }>;
			clipTimeline?: Array<{ scene: number; clipFile: string; durationSec: string }>;
		};
		gameplay?: { sourceFile: string; durationSec: string; file: string; muted: boolean };
		captions?: { file: string; precision: string };
		instructions?: string;
		hasVoiceover?: boolean;
	};
	files: string[];
}

interface VideoResult {
	assetId: string;
	filePath: string;
	durationSec: number;
	fps: string;
	sizeMB: number;
	sceneCount: number;
	storyTitle: string;
	audioLufs: number;
	audioTruePeak: number;
}

function RunSummary({ run }: { run: RunDetails }) {
	const storyId = useMemo(() => {
		const scenePlanStep = run.steps.find((s) => s.stepType === "scene_plan");
		return scenePlanStep?.resultData?.storyId as string | undefined;
	}, [run]);

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

	const videoResult = useMemo(() => {
		const step = run.steps.find((s) => s.stepType === "video_generation");
		return step?.resultData as VideoResult | undefined;
	}, [run]);

	if (!packageResult) {
		return (
			<div className="rounded-xl border border-border/40 bg-card/50 p-4 text-sm text-muted-foreground">
				No package data available for this run.
			</div>
		);
	}

	const manifest = packageResult.manifest;
	const totalCost = run.totalCostUsd ?? run.steps.reduce((sum, s) => sum + (s.actualCostUsd ?? 0), 0);

	return (
		<div className="space-y-4">
			{/* Package contents */}
			<div className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-3">
				<div className="flex items-center gap-2 text-sm font-medium">
					<Package className="h-4 w-4 text-amber-400" />
					{manifest.storyTitle}
					<Badge variant="secondary" className="ml-auto text-[10px]">
						{packageResult.files.length} files
					</Badge>
				</div>
				<div className="grid grid-cols-1 gap-1.5 text-xs">
					{packageResult.files.map((file) => {
						const icon = file.endsWith(".wav")
							? <Mic className="h-3.5 w-3.5 text-blue-400" />
							: file.endsWith(".mp4")
								? <Film className="h-3.5 w-3.5 text-purple-400" />
								: file.endsWith(".srt") || file.endsWith(".csv")
									? <FileText className="h-3.5 w-3.5 text-amber-400" />
									: <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
						return (
							<div key={file} className="flex items-center gap-2">
								{icon}
								<span className="font-mono text-muted-foreground">{file}</span>
							</div>
						);
					})}
				</div>
			</div>

			{/* Generated images preview */}
			{imagesLoading ? (
				<div className="flex items-center gap-2 rounded-xl border border-border/40 bg-card/50 p-3 text-xs text-muted-foreground">
					<Loader2 className="h-3.5 w-3.5 animate-spin" />
					Loading images...
				</div>
			) : imageResults.length > 0 ? (
				<div className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-3">
					<div className="flex items-center gap-2 text-sm font-medium">
						<ImageIcon className="h-4 w-4" />
						Generated Images ({imageResults.length})
					</div>
					<div className="grid grid-cols-4 gap-2">
						{imageResults.map((img) => {
							const timelineEntry = manifest.scenes?.imageTimeline?.find((t) => t.scene === img.order);
							return (
								<div key={img.assetId} className="overflow-hidden rounded-lg border border-border/40 bg-muted/20">
									<div className="relative aspect-[9/16] bg-muted">
										<img
											src={api.assetUrl(img.assetId)}
											alt={`Scene ${img.order}`}
											loading="lazy"
											className="h-full w-full object-cover"
										/>
										{timelineEntry && (
											<div className="absolute inset-x-0 bottom-0 bg-black/70 px-1.5 py-1 backdrop-blur-sm">
												<div className="font-mono text-[10px] text-white">
													{timelineEntry.imageStartSec}s – {timelineEntry.imageEndSec}s
												</div>
												<div className="text-[9px] text-white/70">
													{timelineEntry.imageDurationSec}s
												</div>
											</div>
										)}
									</div>
									<div className="p-1.5 text-[10px] text-muted-foreground">
										<div>Scene {img.order}</div>
										<div className="text-amber-400">${img.costUsd.toFixed(4)}</div>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			) : null}

			{/* Image timeline table */}
			{manifest.scenes?.imageTimeline && manifest.scenes?.imageTimeline.length > 0 && (
				<div className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-2">
					<div className="flex items-center gap-2 text-sm font-medium">
						<Clock className="h-4 w-4 text-amber-400" />
						Image Display Timeline
					</div>
					<div className="space-y-1">
						<div className="grid grid-cols-4 gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
							<div>Scene</div>
							<div>Start</div>
							<div>End</div>
							<div>Duration</div>
						</div>
						{manifest.scenes?.imageTimeline.map((t) => (
							<div key={t.scene} className="grid grid-cols-4 gap-2 border-t border-border/30 py-1 font-mono text-xs">
								<div><Badge variant="outline" className="text-[10px]">{t.scene}</Badge></div>
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
				<div className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-3">
					<div className="flex items-center gap-2 text-sm font-medium">
						<Mic className="h-4 w-4 text-blue-400" />
						Voiceover
					</div>
					<div className="grid grid-cols-2 gap-3 text-xs">
						<div className="rounded-lg border border-border/30 bg-card p-2.5">
							<p className="text-muted-foreground">Duration</p>
							<p className="flex items-center gap-1 font-medium">
								<Clock className="h-3 w-3" />
								{(voiceResult.durationMs / 1000).toFixed(1)}s
							</p>
						</div>
						<div className="rounded-lg border border-border/30 bg-card p-2.5">
							<p className="text-muted-foreground">Provider</p>
							<p className="font-medium">{voiceResult.provider}</p>
						</div>
						<div className="rounded-lg border border-border/30 bg-card p-2.5">
							<p className="text-muted-foreground">Model</p>
							<p className="truncate font-medium">{voiceResult.model}</p>
						</div>
						<div className="rounded-lg border border-border/30 bg-card p-2.5">
							<p className="text-muted-foreground">Voice</p>
							<p className="font-medium">{manifest.audio?.voiceId ?? "—"}</p>
						</div>
					</div>
					<AudioPlayer
						src={api.voiceoverAudioUrl(voiceResult.voiceoverId)}
					/>
				</div>
			)}

			{/* Gameplay video */}
			{timingResult?.gameplayVideo && (
				<div className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-2">
					<div className="flex items-center gap-2 text-sm font-medium">
						<Film className="h-4 w-4 text-purple-400" />
						Gameplay Background
					</div>
					<div className="grid grid-cols-2 gap-3 text-xs">
						<div className="rounded-lg border border-border/30 bg-card p-2.5">
							<p className="text-muted-foreground">Source</p>
							<p className="font-medium">{timingResult.gameplayVideo.sourceFile}</p>
						</div>
						<div className="rounded-lg border border-border/30 bg-card p-2.5">
							<p className="text-muted-foreground">Duration</p>
							<p className="font-medium">{timingResult.gameplayVideo.durationSec}s</p>
						</div>
						<div className="rounded-lg border border-border/30 bg-card p-2.5">
							<p className="text-muted-foreground">Start</p>
							<p className="font-medium">{timingResult.gameplayVideo.startSec}s</p>
						</div>
						<div className="rounded-lg border border-border/30 bg-card p-2.5">
							<p className="text-muted-foreground">Audio</p>
							<p className="font-medium">{timingResult.gameplayVideo.muted ? "muted" : "with audio"}</p>
						</div>
					</div>
				</div>
			)}

			{/* Generated video */}
			{videoResult && !("skipped" in videoResult) && (
				<div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
					<div className="flex items-center gap-2 text-sm font-medium">
						<Film className="h-4 w-4 text-purple-400" />
						Generated Video
						<Badge variant="secondary" className="ml-auto text-[10px]">
							{videoResult.fps}fps · {videoResult.sizeMB}MB
						</Badge>
					</div>
					<div className="grid grid-cols-3 gap-3 text-xs">
						<div className="rounded-lg border border-border/30 bg-card p-2.5">
							<p className="text-muted-foreground">Duration</p>
							<p className="flex items-center gap-1 font-medium">
								<Clock className="h-3 w-3" />
								{videoResult.durationSec.toFixed(1)}s
							</p>
						</div>
						<div className="rounded-lg border border-border/30 bg-card p-2.5">
							<p className="text-muted-foreground">Scenes</p>
							<p className="font-medium">{videoResult.sceneCount}</p>
						</div>
						<div className="rounded-lg border border-border/30 bg-card p-2.5">
							<p className="text-muted-foreground">Loudness</p>
							<p className="font-medium">{videoResult.audioLufs.toFixed(1)} LUFS</p>
						</div>
					</div>
					<VideoPlayer
						src={api.videoStreamUrl(run.id)}
						maxHeight="400px"
					/>
					<a href={api.videoDownloadUrl(run.id)} download>
						<Button size="sm" variant="outline" className="w-full">
							<Download className="mr-2 h-3.5 w-3.5" />
							Download MP4
						</Button>
					</a>
				</div>
			)}

			{/* CapCut instructions */}
			<div className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-1.5">
				<div className="text-sm font-medium">CapCut Assembly Instructions</div>
				<p className="text-xs leading-relaxed text-muted-foreground">{manifest.instructions ?? "No instructions available"}</p>
			</div>

			{/* Total cost */}
			<div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
				<span className="text-muted-foreground">Total Run Cost</span>
				<Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 tabular-nums">
					${totalCost.toFixed(4)}
				</Badge>
			</div>
		</div>
	);
}

// === Cost Breakdown ===

function CostBreakdownCard({ summary }: { summary: RunCostSummary }) {
	const providerEntries = Object.entries(summary.byProvider).sort(([, a], [, b]) => b.cost - a.cost);
	const modelEntries = Object.entries(summary.byModel).sort(([, a], [, b]) => b.cost - a.cost);
	const capabilityEntries = Object.entries(summary.byCapability).sort(([, a], [, b]) => b.cost - a.cost);

	return (
		<div className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-3">
			<div className="flex items-center gap-2 text-sm font-medium">
				<DollarSign className="h-4 w-4 text-amber-400" />
				Cost Breakdown
			</div>

			{/* Top totals */}
			<div className="grid grid-cols-4 gap-2">
				<CostStat label="Total" value={`$${summary.totalCost.toFixed(4)}`} highlight />
				<CostStat label="Paid cost" value={`$${summary.totalPaidCost.toFixed(4)}`} />
				<CostStat label="Paid calls" value={String(summary.totalPaidCalls)} />
				<CostStat label="Free calls" value={String(summary.totalFreeCalls)} />
			</div>

			{/* By provider */}
			{providerEntries.length > 0 && (
				<CostSection icon={<Cpu className="h-3 w-3" />} title="By Provider">
					{providerEntries.map(([provider, info]) => (
						<CostRow key={provider} left={
							<>
								<Badge variant="outline" className="text-[9px] px-1.5 py-0">{provider}</Badge>
								<span className="text-muted-foreground">{info.calls} calls</span>
							</>
						} cost={info.cost} />
					))}
				</CostSection>
			)}

			{/* By model */}
			{modelEntries.length > 0 && (
				<CostSection icon={<TrendingUp className="h-3 w-3" />} title="By Model">
					{modelEntries.map(([model, info]) => (
						<CostRow key={model} left={
							<>
								<span className="truncate font-mono text-[10px] text-foreground/80">{model}</span>
								<span className="text-[10px] text-muted-foreground">{info.calls}</span>
							</>
						} cost={info.cost} />
					))}
				</CostSection>
			)}

			{/* By capability */}
			{capabilityEntries.length > 0 && (
				<CostSection icon={<Layers className="h-3 w-3" />} title="By Capability">
					{capabilityEntries.map(([capability, info]) => (
						<CostRow key={capability} left={
							<>
								<span className="text-foreground/80">{capability.replace(/\./g, " ")}</span>
								<span className="text-[10px] text-muted-foreground">{info.calls}</span>
							</>
						} cost={info.cost} />
					))}
				</CostSection>
			)}

			{/* Per-step breakdown */}
			{summary.byStep.length > 0 && (
				<CostSection title="Per Step (top 10)">
					{summary.byStep.slice(0, 10).map((step, i) => (
						<div key={`${step.stepId}-${step.capability}-${i}`} className="flex items-center justify-between border-t border-border/30 py-1 text-xs">
							<div className="flex min-w-0 items-center gap-2">
								<span className="truncate text-foreground/80">{step.capability.replace(/\./g, " ")}</span>
								<span className="truncate font-mono text-[10px] text-muted-foreground">{step.model}</span>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<span className="text-[10px] text-muted-foreground">{step.calls}x</span>
								<span className="tabular-nums font-medium text-amber-400">${step.cost.toFixed(4)}</span>
							</div>
						</div>
					))}
				</CostSection>
			)}
		</div>
	);
}

function CostSection({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }) {
	return (
		<div className="space-y-1">
			<div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
				{icon}
				{title}
			</div>
			<div className="space-y-0.5">{children}</div>
		</div>
	);
}

function CostRow({ left, cost }: { left: React.ReactNode; cost: number }) {
	return (
		<div className="flex items-center justify-between py-0.5 text-xs">
			<div className="flex items-center gap-2">{left}</div>
			<span className="tabular-nums font-medium text-amber-400">${cost.toFixed(4)}</span>
		</div>
	);
}

function CostStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
	return (
		<div className={`rounded-lg border p-2.5 ${highlight ? "border-amber-500/30 bg-amber-500/10" : "border-border/40 bg-card/30"}`}>
			<div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
			<div className={`text-sm font-semibold tabular-nums ${highlight ? "text-amber-400" : "text-foreground"}`}>{value}</div>
		</div>
	);
}
