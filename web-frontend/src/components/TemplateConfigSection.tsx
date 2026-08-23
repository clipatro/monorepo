/**
 * TemplateConfigSection — Template-specific configuration UI.
 *
 * Renders a dynamic config form based on the selected video template's
 * TemplateConfig. Shows different fields depending on the template:
 *
 * - Image templates (gameplay-with-image-scenes): image provider, character/non-character
 *   models, Ken Burns variants, FPS, quality
 * - Video clip templates (ai-video-clips): video provider, video model, clip duration
 *   range, FPS, quality, clip stitching mode
 * - Both: voiceover toggle (if optional), captions toggle (if optional)
 *
 * The component reads from and writes to a ChannelTemplateOverrides object,
 * so only overridden fields are stored — everything else falls back to
 * template defaults.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Video, Image as ImageIcon, Mic, FileText, Film, Settings2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type {
	TemplateConfig,
	ChannelTemplateOverrides,
	ProviderOptions,
} from "@/lib/api";

// === Helper: get effective value (override or default) ===

function effective<T>(override: T | undefined, defaultValue: T | undefined): T | undefined {
	return override !== undefined ? override : defaultValue;
}

// === Collapsible section ===

function CollapsibleSection({
	title,
	icon,
	defaultOpen = false,
	children,
}: {
	title: string;
	icon?: React.ReactNode;
	defaultOpen?: boolean;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="rounded-lg border">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex w-full items-center gap-2 p-3 text-left"
			>
				{open ? (
					<ChevronDown className="h-4 w-4 text-muted-foreground" />
				) : (
					<ChevronRight className="h-4 w-4 text-muted-foreground" />
				)}
				{icon}
				<span className="text-sm font-medium">{title}</span>
			</button>
			{open && (
				<div className="space-y-3 border-t px-3 pb-3 pt-3">
					{children}
				</div>
			)}
		</div>
	);
}

// === Main component ===

export interface TemplateConfigSectionProps {
	/** The full template config (defaults). */
	templateConfig: TemplateConfig;
	/** Current overrides (channel-specific). */
	overrides: ChannelTemplateOverrides;
	/** Called when overrides change. */
	onOverridesChange: (overrides: ChannelTemplateOverrides) => void;
	/** Provider options from /api/providers (for dropdown population). */
	providers: ProviderOptions | undefined;
}

export function TemplateConfigSection({
	templateConfig,
	overrides,
	onOverridesChange,
	providers,
}: TemplateConfigSectionProps) {
	const cfg = templateConfig;
	const isVideoClipTemplate = cfg.scenePlan.sceneType === "video-clip-scene";
	const isImageTemplate = cfg.scenePlan.sceneType === "image-scene";

	// === Helper to update overrides ===
	function updateOverrides(patch: Partial<ChannelTemplateOverrides>) {
		onOverridesChange({ ...overrides, ...patch });
	}

	function updateProviders(patch: Partial<NonNullable<ChannelTemplateOverrides["providers"]>>) {
		const current = overrides.providers ?? {};
		updateOverrides({
			providers: {
				...current,
				...patch,
				// Deep-merge image/video sub-objects so we don't drop sibling fields
				image: { ...current.image, ...patch.image },
				video: { ...current.video, ...patch.video },
			},
		});
	}

	function updateRender(patch: Partial<NonNullable<ChannelTemplateOverrides["render"]>>) {
		updateOverrides({
			render: { ...overrides.render, ...patch },
		});
	}

	function updateScenePlan(patch: Partial<NonNullable<ChannelTemplateOverrides["scenePlan"]>>) {
		updateOverrides({
			scenePlan: { ...overrides.scenePlan, ...patch },
		});
	}

	function updateAssets(patch: Partial<NonNullable<ChannelTemplateOverrides["assets"]>>) {
		updateOverrides({
			assets: { ...overrides.assets, ...patch },
		});
	}

	// === Effective values ===
	const imgProvider = effective(overrides.providers?.image?.defaultProvider, cfg.providers.image?.defaultProvider);
	const imgCharModel = effective(overrides.providers?.image?.characterModel, cfg.providers.image?.characterModel);
	const imgNonCharModel = effective(overrides.providers?.image?.nonCharacterModel, cfg.providers.image?.nonCharacterModel);
	const vidProvider = effective(overrides.providers?.video?.defaultProvider, cfg.providers.video?.defaultProvider);
	const vidModel = effective(overrides.providers?.video?.defaultModel, cfg.providers.video?.defaultModel);
	const fps = effective(overrides.render?.fps, cfg.render.fps);
	const quality = effective(overrides.render?.quality, cfg.render.quality);
	const kenBurnsVariants = effective(overrides.render?.kenBurnsVariants, cfg.render.kenBurnsVariants);
	const clipStitching = effective(overrides.render?.clipStitching, cfg.render.clipStitching);
	const clipDurationMin = effective(overrides.scenePlan?.clipDurationSeconds?.min, cfg.scenePlan.clipDurationSeconds?.min);
	const clipDurationMax = effective(overrides.scenePlan?.clipDurationSeconds?.max, cfg.scenePlan.clipDurationSeconds?.max);
	const voiceoverDefault = effective(overrides.assets?.voiceover?.default, cfg.assets.voiceover?.default);
	const captionsDefault = effective(overrides.assets?.captions?.default, cfg.assets.captions?.default);

	// === Provider option lists ===
	const imageProviders = providers?.image?.providers ?? [];
	const videoProviders = providers?.video?.providers ?? [];

	// Get models for the currently selected image provider
	const imageProviderObj = imageProviders.find((p) => p.id === imgProvider);
	const imageModels = imageProviderObj?.models ?? [];

	// Get models for the currently selected video provider
	const videoProviderObj = videoProviders.find((p) => p.id === vidProvider);
	const videoModels = videoProviderObj?.models ?? [];

	// All video models (from all providers) for fallback
	const allVideoModels = videoProviders.flatMap((p) => p.models);

	return (
		<div className="space-y-3">
			{/* === Video Clip Provider Settings === */}
			{isVideoClipTemplate && (
				<CollapsibleSection
					title="Video Clip Generation"
					icon={<Video className="h-4 w-4 text-muted-foreground" />}
					defaultOpen
				>
					<p className="text-xs text-muted-foreground">
						AI video clips are generated for each scene using the configured
						provider and model. Cost: ~$0.02 per clip.
					</p>

					{/* Video Provider */}
					<div className="space-y-2">
						<Label>Video Provider</Label>
						<Select
							value={vidProvider ?? "__default__"}
							onValueChange={(v) =>
								updateProviders({
									video: {
										defaultProvider: v === "__default__" ? (cfg.providers.video?.defaultProvider ?? "") : v,
										defaultModel: v === "__default__" ? (cfg.providers.video?.defaultModel ?? "") : (videoProviders.find((p) => p.id === v)?.models[0]?.id ?? cfg.providers.video?.defaultModel ?? ""),
									},
								})
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Provider default" />
							</SelectTrigger>
							<SelectContent>
								{videoProviders.length === 0 && (
									<SelectItem value="__default__" disabled>
										No video providers configured
									</SelectItem>
								)}
								{videoProviders.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										{p.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Video Model */}
					<div className="space-y-2">
						<Label>Video Model</Label>
						<Select
							value={vidModel ?? "__default__"}
							onValueChange={(v) =>
								updateProviders({
									video: {
										defaultProvider: vidProvider ?? cfg.providers.video?.defaultProvider ?? "",
										defaultModel: v === "__default__" ? (cfg.providers.video?.defaultModel ?? "") : v,
									},
								})
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Provider default" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__default__">
									Use template default ({cfg.providers.video?.defaultModel})
								</SelectItem>
								{videoModels.map((m) => (
									<SelectItem key={m.id} value={m.id}>
										{m.label}
									</SelectItem>
								))}
								{/* Also show models from template config's alternative list */}
								{cfg.providers.video?.alternativeModels
									?.filter((m) => !videoModels.find((vm) => vm.id === m))
									.map((m) => (
										<SelectItem key={m} value={m}>
											{m}
										</SelectItem>
									))}
							</SelectContent>
						</Select>
						<p className="text-[10px] text-muted-foreground">
							Default: {cfg.providers.video?.defaultModel}
							{cfg.providers.video?.alternativeModels?.length
								? ` · Alternatives: ${cfg.providers.video.alternativeModels.join(", ")}`
								: ""}
						</p>
					</div>

					{/* Clip Duration Range */}
					{cfg.scenePlan.clipDurationSeconds && (
						<div className="space-y-2">
							<Label>Clip Duration Range (seconds)</Label>
							<div className="grid grid-cols-2 gap-3">
								<div>
									<Label className="text-[10px] text-muted-foreground">Min</Label>
									<Input
										type="number"
										min={1}
										max={30}
										value={clipDurationMin ?? 5}
										onChange={(e) =>
											updateScenePlan({
												clipDurationSeconds: {
													min: Number(e.target.value),
													max: clipDurationMax ?? 10,
												},
											})
										}
										className="h-8"
									/>
								</div>
								<div>
									<Label className="text-[10px] text-muted-foreground">Max</Label>
									<Input
										type="number"
										min={1}
										max={60}
										value={clipDurationMax ?? 10}
										onChange={(e) =>
											updateScenePlan({
												clipDurationSeconds: {
													min: clipDurationMin ?? 5,
													max: Number(e.target.value),
												},
											})
										}
										className="h-8"
									/>
								</div>
							</div>
							<p className="text-[10px] text-muted-foreground">
								Each scene's AI video clip will be {clipDurationMin ?? 5}-{clipDurationMax ?? 10} seconds long.
							</p>
						</div>
					)}

					{/* Clip Stitching */}
					<div className="space-y-2">
						<Label>Clip Stitching</Label>
						<Select
							value={clipStitching ?? "__default__"}
							onValueChange={(v) =>
								updateRender({
									clipStitching: v === "__default__" ? undefined : (v as "crossfade" | "cut"),
								})
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Template default" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__default__">
									Use template default ({cfg.render.clipStitching ?? "crossfade"})
								</SelectItem>
								<SelectItem value="crossfade">Crossfade (smooth)</SelectItem>
								<SelectItem value="cut">Cut (abrupt)</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</CollapsibleSection>
			)}

			{/* === Image Provider Settings === */}
			{isImageTemplate && (
				<CollapsibleSection
					title="Image Generation"
					icon={<ImageIcon className="h-4 w-4 text-muted-foreground" />}
					defaultOpen
				>
					<p className="text-xs text-muted-foreground">
						AI-generated scene images with character identity consistency.
						One image per scene.
					</p>

					{/* Image Provider */}
					<div className="space-y-2">
						<Label>Image Provider</Label>
						<Select
							value={imgProvider ?? "__default__"}
							onValueChange={(v) =>
								updateProviders({
									image: {
										defaultProvider: v,
										defaultModel: imageProviders.find((p) => p.id === v)?.models[0]?.id ?? cfg.providers.image?.defaultModel ?? "",
										characterModel: imageProviders.find((p) => p.id === v)?.models[0]?.id ?? undefined,
										nonCharacterModel: imageProviders.find((p) => p.id === v)?.models[1]?.id ?? undefined,
									},
								})
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Provider default" />
							</SelectTrigger>
							<SelectContent>
								{imageProviders.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										{p.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						{/* Character Scene Model */}
						<div className="space-y-2">
							<Label>Character Scene Model</Label>
							<Select
								value={imgCharModel ?? "__default__"}
								onValueChange={(v) =>
									updateProviders({
										image: {
											characterModel: v === "__default__" ? undefined : v,
										},
									})
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Provider default" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__default__">
										Use template default
									</SelectItem>
									{imageModels.map((m) => (
										<SelectItem key={m.id} value={m.id}>
											{m.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Non-Character Model */}
						<div className="space-y-2">
							<Label>Non-Character Model</Label>
							<Select
								value={imgNonCharModel ?? "__default__"}
								onValueChange={(v) =>
									updateProviders({
										image: {
											nonCharacterModel: v === "__default__" ? undefined : v,
										},
									})
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Provider default" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__default__">
										Use template default
									</SelectItem>
									{imageModels.map((m) => (
										<SelectItem key={m.id} value={m.id}>
											{m.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Ken Burns Variants */}
					{cfg.render.kenBurnsVariants !== undefined && (
						<div className="space-y-2">
							<Label>Ken Burns Motion Variants</Label>
							<Input
								type="number"
								min={1}
								max={10}
								value={kenBurnsVariants ?? 5}
								onChange={(e) =>
									updateRender({
										kenBurnsVariants: Number(e.target.value),
									})
								}
								className="h-8"
							/>
							<p className="text-[10px] text-muted-foreground">
								Number of motion variants for Ken Burns zoom/pan effect. Higher = more variety but slower rendering.
							</p>
						</div>
					)}
				</CollapsibleSection>
			)}

			{/* === Render Settings === */}
			<CollapsibleSection
				title="Render Settings"
				icon={<Film className="h-4 w-4 text-muted-foreground" />}
			>
				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-2">
						<Label>Frame Rate (FPS)</Label>
						<Select
							value={String(fps ?? 30)}
							onValueChange={(v) => updateRender({ fps: Number(v) })}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="24">24 fps (cinematic)</SelectItem>
								<SelectItem value="30">30 fps (standard)</SelectItem>
								<SelectItem value="60">60 fps (smooth)</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-[10px] text-muted-foreground">
							Template default: {cfg.render.fps} fps
						</p>
					</div>
					<div className="space-y-2">
						<Label>Quality</Label>
						<Select
							value={quality ?? "high"}
							onValueChange={(v) => updateRender({ quality: v as "low" | "medium" | "high" })}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="low">Low (fastest)</SelectItem>
								<SelectItem value="medium">Medium</SelectItem>
								<SelectItem value="high">High (best)</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-[10px] text-muted-foreground">
							Template default: {cfg.render.quality}
						</p>
					</div>
				</div>
			</CollapsibleSection>

			{/* === Optional Assets === */}
			{(cfg.assets.voiceover?.required === false || cfg.assets.captions?.required === false) && (
				<CollapsibleSection
					title="Optional Assets"
					icon={<Settings2 className="h-4 w-4 text-muted-foreground" />}
					defaultOpen
				>
					{/* Voiceover toggle (if optional) */}
					{cfg.assets.voiceover?.required === false && (
						<div className="flex items-center justify-between rounded-md border p-3">
							<div className="flex items-center gap-2">
								<Mic className="h-4 w-4 text-muted-foreground" />
								<div>
									<p className="text-sm font-medium">Voiceover</p>
									<p className="text-xs text-muted-foreground">
										AI-generated voice narration for the video
									</p>
								</div>
							</div>
							<Select
								value={voiceoverDefault ?? cfg.assets.voiceover?.default ?? "enabled"}
								onValueChange={(v) =>
									updateAssets({
										voiceover: { required: false, default: v },
									})
								}
							>
								<SelectTrigger className="w-32">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="enabled">Enabled</SelectItem>
									<SelectItem value="disabled">Disabled</SelectItem>
								</SelectContent>
							</Select>
						</div>
					)}

					{/* Captions toggle (if optional) */}
					{cfg.assets.captions?.required === false && (
						<div className="flex items-center justify-between rounded-md border p-3">
							<div className="flex items-center gap-2">
								<FileText className="h-4 w-4 text-muted-foreground" />
								<div>
									<p className="text-sm font-medium">Captions</p>
									<p className="text-xs text-muted-foreground">
										SRT subtitle file ({cfg.assets.captions?.precision ?? "scene-level"})
									</p>
								</div>
							</div>
							<Select
								value={captionsDefault ?? cfg.assets.captions?.default ?? "disabled"}
								onValueChange={(v) =>
									updateAssets({
										captions: { required: false, default: v },
									})
								}
							>
								<SelectTrigger className="w-32">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="enabled">Enabled</SelectItem>
									<SelectItem value="disabled">Disabled</SelectItem>
								</SelectContent>
							</Select>
						</div>
					)}
				</CollapsibleSection>
			)}

			{/* === Template Info Summary === */}
			<div className="rounded-md bg-muted/50 p-3 space-y-1.5">
				<div className="flex items-center gap-2">
					<Badge variant="outline" className="text-[10px]">
						{cfg.scenePlan.sceneType}
					</Badge>
					<Badge variant="outline" className="text-[10px]">
						{cfg.layout.width}×{cfg.layout.height}
					</Badge>
					<Badge variant="outline" className="text-[10px]">
						{cfg.layout.aspectRatio}
					</Badge>
					<Badge variant="outline" className="text-[10px]">
						{cfg.render.fps} fps
					</Badge>
				</div>
				<div className="flex flex-wrap gap-1">
					{cfg.assets.images?.required && <Badge className="text-[10px] bg-blue-600/20 text-blue-400 border-blue-600/30">Images</Badge>}
					{cfg.assets.videoClips?.required && <Badge className="text-[10px] bg-purple-600/20 text-purple-400 border-purple-600/30">Video Clips</Badge>}
					{cfg.assets.gameplayVideo?.required && <Badge className="text-[10px] bg-green-600/20 text-green-400 border-green-600/30">Gameplay</Badge>}
					{cfg.assets.voiceover?.required && <Badge className="text-[10px] bg-orange-600/20 text-orange-400 border-orange-600/30">Voiceover</Badge>}
					{cfg.assets.captions?.required && <Badge className="text-[10px] bg-cyan-600/20 text-cyan-400 border-cyan-600/30">Captions</Badge>}
				</div>
			</div>
		</div>
	);
}
