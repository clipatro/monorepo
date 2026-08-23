/**
 * ImagesPage — Image library and scene planning.
 *
 * Default view: Gallery grid of all generated images with server-side
 * search, pagination, and a right sidebar detail dialog.
 * Secondary tab: Scene planning workflow (per-story).
 */

import { useState, useEffect, useCallback } from "react";
import {
	Image as ImageIcon,
	Film,
	CheckCircle,
	XCircle,
	Copy,
	Upload,
	Sparkles,
	ChevronDown,
	ChevronRight,
	Wand2,
	Layers,
	Clock,
	Eye,
	Maximize2,
	Clapperboard,
	Workflow,
	Loader2,
	DollarSign,
	Cpu,
	Hash,
	Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetBody,
	SheetFooter,
} from "@/components/ui/sheet";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import {
	api,
	type GalleryImage,
	type Channel,
	type Story,
	type Scene,
	type SceneImage,
} from "@/lib/api";
import { useDebouncedValue, usePagination } from "@/lib/hooks";
import { cn } from "@/lib/utils";

// === Gallery View ===

function ImageCard({
	image,
	onClick,
}: {
	image: GalleryImage;
	onClick: () => void;
}) {
	const status =
		image.type === "image_accepted"
			? "accepted"
			: image.type === "image_rejected"
				? "rejected"
				: "pending";
	const statusColor = {
		accepted: "bg-emerald-500/80",
		rejected: "bg-red-500/80",
		pending: "bg-blue-500/80",
	}[status];

	return (
		<button
			onClick={onClick}
			className="group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5 transition-all duration-200"
		>
			<div className="relative aspect-[9/16] overflow-hidden bg-muted">
				<img
					src={api.assetUrl(image.assetId)}
					alt={image.narrationText ?? `Scene ${image.order ?? ""}`}
					loading="lazy"
					className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
				/>
				<div className="absolute left-2 top-2 flex items-center gap-1.5">
					<span className={cn("h-2 w-2 rounded-full", statusColor)} />
					<span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm capitalize">
						{status}
					</span>
				</div>
				{image.order !== null && (
					<div className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
						#{image.order}
					</div>
				)}
			</div>
			<div className="p-3">
				<p className="line-clamp-2 text-xs text-muted-foreground">
					{image.narrationText ?? "No narration"}
				</p>
				<div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
					{image.provider && (
						<span className="inline-flex items-center gap-1">
							<Cpu className="h-3 w-3" />
							{image.provider}
						</span>
					)}
					{image.costUsd !== null && image.costUsd > 0 && (
						<span className="inline-flex items-center gap-1 text-amber-400">
							<DollarSign className="h-3 w-3" />
							{image.costUsd.toFixed(4)}
						</span>
					)}
				</div>
			</div>
		</button>
	);
}

function ImageDetailSidebar({
	image,
	open,
	onOpenChange,
	onAccept,
	onReject,
}: {
	image: GalleryImage | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAccept?: (assetId: string) => void;
	onReject?: (assetId: string) => void;
}) {
	const [accepting, setAccepting] = useState(false);
	const [rejecting, setRejecting] = useState(false);

	const handleAccept = async () => {
		if (!image || !onAccept) return;
		setAccepting(true);
		try {
			await onAccept(image.assetId);
		} finally {
			setAccepting(false);
		}
	};
	const handleReject = async () => {
		if (!image || !onReject) return;
		setRejecting(true);
		try {
			await onReject(image.assetId);
		} finally {
			setRejecting(false);
		}
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent width="max-w-2xl">
				{image && (
					<>
						<SheetHeader>
							<SheetTitle className="flex items-center gap-2">
								<ImageIcon className="h-5 w-5 text-muted-foreground" />
								Image Details
							</SheetTitle>
							<SheetDescription>
								{image.provider ?? "Unknown"} · {image.model ?? "Unknown model"}
							</SheetDescription>
						</SheetHeader>
						<SheetBody>
							<div className="space-y-4">
								{/* Image preview */}
								<div className="overflow-hidden rounded-lg border bg-muted">
									<img
										src={api.assetUrl(image.assetId)}
										alt={image.narrationText ?? "Generated image"}
										className="w-full object-contain"
									/>
								</div>

								{/* Status badge */}
								<div className="flex items-center gap-2">
									{image.type === "image_accepted" && (
										<Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30">
											<CheckCircle className="mr-1 h-3 w-3" /> Accepted
										</Badge>
									)}
									{image.type === "image_rejected" && (
										<Badge className="bg-red-600/20 text-red-400 border-red-600/30">
											<XCircle className="mr-1 h-3 w-3" /> Rejected
										</Badge>
									)}
									{image.type === "image" && (
										<Badge variant="secondary">
											<Clock className="mr-1 h-3 w-3" /> Pending
										</Badge>
									)}
								</div>

								{/* Metadata grid */}
								<div className="grid grid-cols-2 gap-3">
									<div className="rounded-lg border bg-card p-3">
										<p className="text-xs text-muted-foreground">Dimensions</p>
										<p className="text-sm font-medium">
											{image.width} × {image.height}
										</p>
									</div>
									<div className="rounded-lg border bg-card p-3">
										<p className="text-xs text-muted-foreground">Cost</p>
										<p className="text-sm font-medium text-amber-400">
											${image.costUsd?.toFixed(4) ?? "—"}
										</p>
									</div>
									<div className="rounded-lg border bg-card p-3">
										<p className="text-xs text-muted-foreground">Provider</p>
										<p className="text-sm font-medium">
											{image.provider ?? "—"}
										</p>
									</div>
									<div className="rounded-lg border bg-card p-3">
										<p className="text-xs text-muted-foreground">Model</p>
										<p className="text-sm font-medium truncate">
											{image.model ?? "—"}
										</p>
									</div>
									{image.order !== null && (
										<div className="rounded-lg border bg-card p-3">
											<p className="text-xs text-muted-foreground">
												Scene Order
											</p>
											<p className="text-sm font-medium">#{image.order}</p>
										</div>
									)}
									<div className="rounded-lg border bg-card p-3">
										<p className="text-xs text-muted-foreground">Created</p>
										<p className="text-sm font-medium">
											{new Date(image.createdAt).toLocaleDateString()}
										</p>
									</div>
								</div>

								{/* Narration */}
								{image.narrationText && (
									<div>
										<p className="mb-1.5 text-xs font-medium text-muted-foreground">
											Scene Narration
										</p>
										<p className="text-sm leading-relaxed rounded-lg border bg-card p-3">
											{image.narrationText}
										</p>
									</div>
								)}

								{/* Asset ID */}
								<div>
									<p className="mb-1.5 text-xs font-medium text-muted-foreground">
										Asset ID
									</p>
									<code className="block rounded-lg border bg-card p-2 text-xs text-muted-foreground break-all">
										{image.assetId}
									</code>
								</div>
							</div>
						</SheetBody>
						{onAccept && onReject && image.type === "image" && (
							<SheetFooter>
								<Button
									variant="outline"
									onClick={handleReject}
									disabled={rejecting}
									className="border-red-600/30 text-red-400 hover:bg-red-600/10"
								>
									{rejecting ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<XCircle className="h-4 w-4" />
									)}
									Reject
								</Button>
								<Button
									onClick={handleAccept}
									disabled={accepting}
									className="bg-emerald-600 text-white hover:bg-emerald-700"
								>
									{accepting ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<CheckCircle className="h-4 w-4" />
									)}
									Accept
								</Button>
							</SheetFooter>
						)}
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}

function GalleryView() {
	const { page, pageSize, search, setPage, setSearch } = usePagination(24);
	const debouncedSearch = useDebouncedValue(search, 300);
	const [images, setImages] = useState<GalleryImage[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [selected, setSelected] = useState<GalleryImage | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState(false);

	const fetchData = useCallback(async () => {
		setLoading(true);
		try {
			const result = await api.listImageGallery({
				search: debouncedSearch || undefined,
				limit: pageSize,
				offset: (page - 1) * pageSize,
			});
			setImages(result.items);
			setTotal(result.total);
		} catch {
			setImages([]);
			setTotal(0);
		} finally {
			setLoading(false);
		}
	}, [debouncedSearch, page, pageSize]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);
	useEffect(() => {
		if (debouncedSearch !== search) setPage(1);
	}, [debouncedSearch, setPage]);

	const handleSearchChange = (value: string) => {
		setSearch(value);
		setPage(1);
	};

	const handleAccept = async (assetId: string) => {
		await api.acceptImage(assetId);
		await fetchData();
		const updated = images.find((i) => i.assetId === assetId);
		if (updated) {
			setSelected({ ...updated, type: "image_accepted" });
		}
	};
	const handleReject = async (assetId: string) => {
		await api.rejectImage(assetId);
		await fetchData();
		const updated = images.find((i) => i.assetId === assetId);
		if (updated) {
			setSelected({ ...updated, type: "image_rejected" });
		}
	};

	const openDetail = (image: GalleryImage) => {
		setSelected(image);
		setSidebarOpen(true);
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<SearchInput
					value={search}
					onChange={handleSearchChange}
					placeholder="Search by narration, provider, model..."
					className="flex-1"
				/>
				<Badge variant="secondary" className="shrink-0">
					{total} {total === 1 ? "image" : "images"}
				</Badge>
			</div>

			{loading ? (
				<div className="flex items-center justify-center py-20">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
				</div>
			) : images.length === 0 ? (
				<EmptyState
					icon={ImageIcon}
					title="No images found"
					description={
						search
							? "Try a different search term."
							: "Generate images from the Scene Planning tab to populate the gallery."
					}
				/>
			) : (
				<>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
						{images.map((image) => (
							<ImageCard
								key={image.assetId}
								image={image}
								onClick={() => openDetail(image)}
							/>
						))}
					</div>
					<Pagination
						page={page}
						pageSize={pageSize}
						total={total}
						onPageChange={setPage}
					/>
				</>
			)}

			<ImageDetailSidebar
				image={selected}
				open={sidebarOpen}
				onOpenChange={setSidebarOpen}
				onAccept={handleAccept}
				onReject={handleReject}
			/>
		</div>
	);
}

// === Scene Planning View (existing functionality, preserved) ===

function ScenePlanningView() {
	const [channels, setChannels] = useState<Channel[]>([]);
	const [stories, setStories] = useState<Story[]>([]);
	const [selectedChannel, setSelectedChannel] = useState<string>("");
	const [selectedStory, setSelectedStory] = useState<string>("");
	const [scenes, setScenes] = useState<Scene[]>([]);
	const [expandedScene, setExpandedScene] = useState<string | null>(null);
	const [sceneImages, setSceneImages] = useState<Record<string, SceneImage[]>>(
		{},
	);
	const [planning, setPlanning] = useState(false);
	const [generating, setGenerating] = useState<string | null>(null);
	const [batchGenerating, setBatchGenerating] = useState(false);
	const [flowOpen, setFlowOpen] = useState(false);
	const [flowPrompts, setFlowPrompts] = useState<
		Array<{
			sceneId: string;
			order: number;
			prompt: string;
			expectedFilename: string;
			isCharacterScene: boolean;
			model: string;
		}>
	>([]);

	useEffect(() => {
		api
			.listChannels()
			.then(setChannels)
			.catch(() => {});
	}, []);

	useEffect(() => {
		if (selectedChannel) {
			api
				.listStories(selectedChannel)
				.then(setStories)
				.catch(() => setStories([]));
			setSelectedStory("");
		} else {
			setStories([]);
		}
	}, [selectedChannel]);

	useEffect(() => {
		if (selectedStory) {
			api
				.listScenes(selectedStory)
				.then(setScenes)
				.catch(() => setScenes([]));
		} else {
			setScenes([]);
		}
	}, [selectedStory]);

	const loadSceneImages = async (sceneId: string) => {
		const imgs = await api.listImages(sceneId);
		setSceneImages((prev) => ({ ...prev, [sceneId]: imgs }));
	};

	const toggleScene = async (sceneId: string) => {
		if (expandedScene === sceneId) {
			setExpandedScene(null);
		} else {
			setExpandedScene(sceneId);
			if (!sceneImages[sceneId]) await loadSceneImages(sceneId);
		}
	};

	const handlePlanScenes = async () => {
		if (!selectedStory) return;
		setPlanning(true);
		try {
			await api.planScenes(selectedStory);
			const updated = await api.listScenes(selectedStory);
			setScenes(updated);
		} catch (err) {
			alert(`Failed to plan scenes: ${err}`);
		} finally {
			setPlanning(false);
		}
	};

	const handleGenerate = async (sceneId: string) => {
		setGenerating(sceneId);
		try {
			await api.generateImage(sceneId);
			await loadSceneImages(sceneId);
		} catch (err) {
			alert(`Failed to generate image: ${err}`);
		} finally {
			setGenerating(null);
		}
	};

	const handleBatchGenerate = async () => {
		if (!selectedStory) return;
		setBatchGenerating(true);
		try {
			await api.generateBatch(selectedStory);
			const updated = await api.listScenes(selectedStory);
			setScenes(updated);
			for (const s of updated) await loadSceneImages(s.id);
		} catch (err) {
			alert(`Batch generation failed: ${err}`);
		} finally {
			setBatchGenerating(false);
		}
	};

	const handleAccept = async (assetId: string, sceneId: string) => {
		await api.acceptImage(assetId);
		await loadSceneImages(sceneId);
	};
	const handleReject = async (assetId: string, sceneId: string) => {
		await api.rejectImage(assetId);
		await loadSceneImages(sceneId);
	};

	const handleFlowPrompts = async () => {
		if (!selectedStory) return;
		try {
			const result = await api.getFlowPrompts(selectedStory);
			setFlowPrompts(result.prompts);
			setFlowOpen(true);
		} catch (err) {
			alert(`Failed to get flow prompts: ${err}`);
		}
	};

	return (
		<div className="space-y-4">
			{/* Story selector */}
			<div className="flex flex-wrap items-end gap-3">
				<div className="space-y-1.5">
					<label className="text-xs font-medium text-muted-foreground">
						Channel
					</label>
					<Select value={selectedChannel} onValueChange={setSelectedChannel}>
						<SelectTrigger className="w-[180px]">
							<SelectValue placeholder="Select channel" />
						</SelectTrigger>
						<SelectContent>
							{channels.map((ch) => (
								<SelectItem key={ch.id} value={ch.id}>
									{ch.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1.5">
					<label className="text-xs font-medium text-muted-foreground">
						Story
					</label>
					<Select
						value={selectedStory}
						onValueChange={setSelectedStory}
						disabled={!selectedChannel}
					>
						<SelectTrigger className="w-[240px]">
							<SelectValue placeholder="Select story" />
						</SelectTrigger>
						<SelectContent>
							{stories.map((s) => (
								<SelectItem key={s.id} value={s.id}>
									{s.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				{selectedStory && scenes.length === 0 && (
					<Button onClick={handlePlanScenes} disabled={planning}>
						{planning ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Sparkles className="h-4 w-4" />
						)}
						Plan Scenes
					</Button>
				)}
				{selectedStory && scenes.length > 0 && (
					<>
						<Button onClick={handleBatchGenerate} disabled={batchGenerating}>
							{batchGenerating ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Layers className="h-4 w-4" />
							)}
							Generate All
						</Button>
						<Button variant="outline" onClick={handleFlowPrompts}>
							<Workflow className="h-4 w-4" /> Flow Mode
						</Button>
					</>
				)}
			</div>

			{!selectedStory ? (
				<EmptyState
					icon={Clapperboard}
					title="Select a story to begin"
					description="Choose a channel and story to plan scenes and generate images."
				/>
			) : scenes.length === 0 ? (
				<EmptyState
					icon={Sparkles}
					title="No scenes planned yet"
					description="Click 'Plan Scenes' to generate a scene breakdown for this story."
				/>
			) : (
				<div className="space-y-2">
					{scenes.map((scene) => (
						<Card key={scene.id} className="overflow-hidden">
							<button
								onClick={() => toggleScene(scene.id)}
								className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent/50 transition-colors"
							>
								{expandedScene === scene.id ? (
									<ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
								) : (
									<ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
								)}
								<Badge variant="secondary" className="shrink-0">
									#{scene.order}
								</Badge>
								<span className="flex-1 truncate text-sm">
									{scene.narration_text}
								</span>
								{sceneImages[scene.id]?.some(
									(i) => i.type === "image_accepted",
								) && (
									<CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
								)}
							</button>
							{expandedScene === scene.id && (
								<div className="border-t p-4 space-y-3">
									<div className="grid gap-3 sm:grid-cols-2">
										<div>
											<p className="text-xs font-medium text-muted-foreground">
												Visual Event
											</p>
											<p className="text-sm">{scene.visual_event}</p>
										</div>
										<div>
											<p className="text-xs font-medium text-muted-foreground">
												Environment
											</p>
											<p className="text-sm">{scene.environment}</p>
										</div>
										<div>
											<p className="text-xs font-medium text-muted-foreground">
												Camera
											</p>
											<p className="text-sm">{scene.camera_framing}</p>
										</div>
										<div>
											<p className="text-xs font-medium text-muted-foreground">
												Lighting & Mood
											</p>
											<p className="text-sm">{scene.lighting_and_mood}</p>
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Button
											size="sm"
											onClick={() => handleGenerate(scene.id)}
											disabled={generating === scene.id}
										>
											{generating === scene.id ? (
												<Loader2 className="h-3 w-3 animate-spin" />
											) : (
												<Sparkles className="h-3 w-3" />
											)}
											Generate
										</Button>
									</div>
									{sceneImages[scene.id] &&
										sceneImages[scene.id]!.length > 0 && (
											<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
												{sceneImages[scene.id]!.map((img) => (
													<div
														key={img.id}
														className="group relative overflow-hidden rounded-lg border"
													>
														<img
															src={api.assetUrl(img.id)}
															alt=""
															className="aspect-[9/16] w-full object-cover"
														/>
														<div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/70 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
															<Button
																size="sm"
																variant="ghost"
																className="h-6 px-2 text-xs text-white hover:bg-white/20"
																onClick={() => handleAccept(img.id, scene.id)}
															>
																<CheckCircle className="h-3 w-3" />
															</Button>
															<Button
																size="sm"
																variant="ghost"
																className="h-6 px-2 text-xs text-white hover:bg-white/20"
																onClick={() => handleReject(img.id, scene.id)}
															>
																<XCircle className="h-3 w-3" />
															</Button>
														</div>
														{img.type === "image_accepted" && (
															<div className="absolute right-1 top-1 rounded-full bg-emerald-500 p-0.5">
																<CheckCircle className="h-3 w-3 text-white" />
															</div>
														)}
													</div>
												))}
											</div>
										)}
								</div>
							)}
						</Card>
					))}
				</div>
			)}

			{/* Flow mode dialog */}
			<Dialog open={flowOpen} onOpenChange={setFlowOpen}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Flow Mode — Manual Prompts</DialogTitle>
						<DialogDescription>
							Copy these prompts into your external image generator, then import
							the results.
						</DialogDescription>
					</DialogHeader>
					<div className="max-h-[60vh] overflow-y-auto themed-scroll space-y-2">
						{flowPrompts.map((p) => (
							<div key={p.sceneId} className="rounded-lg border p-3">
								<div className="mb-1.5 flex items-center gap-2">
									<Badge variant="secondary">#{p.order}</Badge>
									<Badge variant="outline" className="text-xs">
										{p.isCharacterScene ? "Character" : "Non-character"}
									</Badge>
									<Badge variant="outline" className="text-xs">
										{p.model}
									</Badge>
								</div>
								<p className="text-xs leading-relaxed text-muted-foreground">
									{p.prompt}
								</p>
								<p className="mt-1.5 text-xs font-mono text-muted-foreground/70">
									{p.expectedFilename}
								</p>
							</div>
						))}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

// === Main page ===

export function ImagesPage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Images</h1>
				<p className="text-sm text-muted-foreground">
					Browse generated images and manage scene planning.
				</p>
			</div>
			<Tabs defaultValue="gallery">
				<TabsList>
					<TabsTrigger value="gallery">
						<ImageIcon className="mr-1.5 h-4 w-4" /> Gallery
					</TabsTrigger>
					<TabsTrigger value="planning">
						<Clapperboard className="mr-1.5 h-4 w-4" /> Scene Planning
					</TabsTrigger>
				</TabsList>
				<TabsContent value="gallery">
					<GalleryView />
				</TabsContent>
				<TabsContent value="planning">
					<ScenePlanningView />
				</TabsContent>
			</Tabs>
		</div>
	);
}
