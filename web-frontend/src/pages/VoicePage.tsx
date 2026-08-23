/**
 * VoicePage — Voiceover library and synthesis.
 *
 * Default view: Card grid of all voiceovers with server-side search,
 * pagination, and a right sidebar detail dialog with audio playback
 * and scene timeline.
 * Secondary tab: Synthesis workflow (per-story generation).
 */

import { useState, useEffect, useCallback } from "react";
import {
	Mic,
	Loader2,
	Clock,
	Volume2,
	Play,
	History,
	Sparkles,
	Layers,
	Image as ImageIcon,
	AlertCircle,
	CheckCircle,
	DollarSign,
	Cpu,
	Calendar,
	Hash,
	Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetBody,
	SheetFooter,
} from "@/components/ui/sheet";
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
	type VoiceoverWithStory,
	type Voiceover,
	type TimingRecord,
	type Channel,
	type Story,
} from "@/lib/api";
import { useDebouncedValue, usePagination } from "@/lib/hooks";
import { AudioPlayer } from "@/components/ui/media-player";
import { cn } from "@/lib/utils";

function formatDuration(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	return `${min}:${sec.toString().padStart(2, "0")}`;
}

// === Voiceover Card ===

function VoiceoverCard({
	vo,
	onClick,
}: {
	vo: VoiceoverWithStory;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5 transition-all duration-200"
		>
			{/* Audio waveform placeholder header */}
			<div className="relative flex h-24 items-center justify-center bg-gradient-to-br from-secondary/40 to-secondary/10">
				<Waves className="h-8 w-8 text-muted-foreground/40" />
				<div className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
					{formatDuration(vo.duration_ms)}
				</div>
			</div>
			<div className="p-3 space-y-2">
				<p className="line-clamp-1 text-sm font-medium">
					{vo.storyTitle ?? vo.story_id.slice(0, 8)}
				</p>
				<div className="flex items-center gap-2 text-[10px] text-muted-foreground">
					<span className="inline-flex items-center gap-1">
						<Cpu className="h-3 w-3" />
						{vo.provider}
					</span>
					<span className="inline-flex items-center gap-1">
						<Mic className="h-3 w-3" />
						{vo.voice_id}
					</span>
				</div>
				<div className="flex items-center gap-2 text-[10px] text-muted-foreground">
					<Calendar className="h-3 w-3" />
					{new Date(vo.created_at).toLocaleDateString()}
				</div>
			</div>
		</button>
	);
}

// === Voiceover Detail Sidebar ===

function VoiceoverDetailSidebar({
	voiceover,
	open,
	onOpenChange,
}: {
	voiceover: VoiceoverWithStory | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [timings, setTimings] = useState<
		Array<TimingRecord & { scene_order: number }>
	>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (voiceover && open) {
			setLoading(true);
			api
				.getVoiceover(voiceover.id)
				.then((r) => setTimings(r.timings))
				.catch(() => setTimings([]))
				.finally(() => setLoading(false));
		}
	}, [voiceover, open]);

	if (!voiceover) return null;
	const totalDuration = voiceover.duration_ms;

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent width="max-w-2xl">
				<SheetHeader>
					<SheetTitle className="flex items-center gap-2">
						<Mic className="h-5 w-5 text-muted-foreground" />
						Voiceover Details
					</SheetTitle>
					<SheetDescription>
						{voiceover.storyTitle ?? voiceover.story_id.slice(0, 8)} ·{" "}
						{formatDuration(totalDuration)}
					</SheetDescription>
				</SheetHeader>
				<SheetBody>
					<div className="space-y-4">
						{/* Audio player */}
						<div className="rounded-lg border bg-card p-3">
							<AudioPlayer
								src={api.voiceoverAudioUrl(voiceover.id)}
							/>
						</div>

						{/* Metadata grid */}
						<div className="grid grid-cols-2 gap-3">
							<div className="rounded-lg border bg-card p-3">
								<p className="text-xs text-muted-foreground">Duration</p>
								<p className="text-sm font-medium">
									{formatDuration(voiceover.duration_ms)}
								</p>
							</div>
							<div className="rounded-lg border bg-card p-3">
								<p className="text-xs text-muted-foreground">Sample Rate</p>
								<p className="text-sm font-medium">
									{(voiceover.sample_rate / 1000).toFixed(1)} kHz
								</p>
							</div>
							<div className="rounded-lg border bg-card p-3">
								<p className="text-xs text-muted-foreground">Provider</p>
								<p className="text-sm font-medium">{voiceover.provider}</p>
							</div>
							<div className="rounded-lg border bg-card p-3">
								<p className="text-xs text-muted-foreground">Model</p>
								<p className="text-sm font-medium truncate">
									{voiceover.model}
								</p>
							</div>
							<div className="rounded-lg border bg-card p-3">
								<p className="text-xs text-muted-foreground">Voice</p>
								<p className="text-sm font-medium">{voiceover.voice_id}</p>
							</div>
							<div className="rounded-lg border bg-card p-3">
								<p className="text-xs text-muted-foreground">Created</p>
								<p className="text-sm font-medium">
									{new Date(voiceover.created_at).toLocaleDateString()}
								</p>
							</div>
						</div>

						{/* Scene timings */}
						{loading ? (
							<div className="flex items-center justify-center py-8">
								<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
							</div>
						) : timings.length > 0 ? (
							<div>
								<p className="mb-2 text-xs font-medium text-muted-foreground">
									Scene Timings ({timings.length} scenes)
								</p>
								<div className="space-y-1.5">
									{timings.map((t) => {
										const startPct =
											(t.narration_start_ms / totalDuration) * 100;
										const widthPct =
											((t.narration_end_ms - t.narration_start_ms) /
												totalDuration) *
											100;
										return (
											<div
												key={t.id}
												className="rounded-lg border bg-card p-2.5"
											>
												<div className="flex items-center gap-2 mb-1">
													<Badge variant="secondary" className="text-[10px]">
														#{t.scene_order}
													</Badge>
													<span className="text-xs text-muted-foreground">
														{formatDuration(t.narration_start_ms)} –{" "}
														{formatDuration(t.narration_end_ms)}
													</span>
												</div>
												<p className="line-clamp-2 text-xs text-muted-foreground mb-1.5">
													{t.narration_text}
												</p>
												{/* Timeline bar */}
												<div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
													<div
														className="absolute h-full rounded-full bg-primary/60"
														style={{
															left: `${startPct}%`,
															width: `${Math.max(widthPct, 1)}%`,
														}}
													/>
												</div>
											</div>
										);
									})}
								</div>
							</div>
						) : null}

						{/* Voiceover ID */}
						<div>
							<p className="mb-1.5 text-xs font-medium text-muted-foreground">
								Voiceover ID
							</p>
							<code className="block rounded-lg border bg-card p-2 text-xs text-muted-foreground break-all">
								{voiceover.id}
							</code>
						</div>
					</div>
				</SheetBody>
			</SheetContent>
		</Sheet>
	);
}

// === Library View ===

function LibraryView() {
	const { page, pageSize, search, setPage, setSearch } = usePagination(24);
	const debouncedSearch = useDebouncedValue(search, 300);
	const [voiceovers, setVoiceovers] = useState<VoiceoverWithStory[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [selected, setSelected] = useState<VoiceoverWithStory | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState(false);

	const fetchData = useCallback(async () => {
		setLoading(true);
		try {
			const result = await api.listAllVoiceovers({
				search: debouncedSearch || undefined,
				limit: pageSize,
				offset: (page - 1) * pageSize,
			});
			setVoiceovers(result.items);
			setTotal(result.total);
		} catch {
			setVoiceovers([]);
			setTotal(0);
		} finally {
			setLoading(false);
		}
	}, [debouncedSearch, page, pageSize]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	const handleSearchChange = (value: string) => {
		setSearch(value);
		setPage(1);
	};

	const openDetail = (vo: VoiceoverWithStory) => {
		setSelected(vo);
		setSidebarOpen(true);
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<SearchInput
					value={search}
					onChange={handleSearchChange}
					placeholder="Search by story, provider..."
					className="flex-1"
				/>
				<Badge variant="secondary" className="shrink-0">
					{total} {total === 1 ? "voiceover" : "voiceovers"}
				</Badge>
			</div>

			{loading ? (
				<div className="flex items-center justify-center py-20">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
				</div>
			) : voiceovers.length === 0 ? (
				<EmptyState
					icon={Mic}
					title="No voiceovers found"
					description={
						search
							? "Try a different search term."
							: "Generate voiceovers from the Synthesis tab."
					}
				/>
			) : (
				<>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
						{voiceovers.map((vo) => (
							<VoiceoverCard
								key={vo.id}
								vo={vo}
								onClick={() => openDetail(vo)}
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

			<VoiceoverDetailSidebar
				voiceover={selected}
				open={sidebarOpen}
				onOpenChange={setSidebarOpen}
			/>
		</div>
	);
}

// === Synthesis View ===

function SynthesisView() {
	const [channels, setChannels] = useState<Channel[]>([]);
	const [stories, setStories] = useState<Story[]>([]);
	const [selectedChannel, setSelectedChannel] = useState("");
	const [selectedStory, setSelectedStory] = useState("");
	const [voiceovers, setVoiceovers] = useState<Voiceover[]>([]);
	const [selectedVo, setSelectedVo] = useState<Voiceover | null>(null);
	const [synthesizing, setSynthesizing] = useState(false);
	const [timings, setTimings] = useState<
		Array<TimingRecord & { scene_order: number }>
	>([]);
	const [error, setError] = useState<string | null>(null);

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
				.listVoiceovers(selectedStory)
				.then(setVoiceovers)
				.catch(() => setVoiceovers([]));
			setSelectedVo(null);
			setTimings([]);
		} else {
			setVoiceovers([]);
		}
	}, [selectedStory]);

	const handleSynthesize = async (provider?: "kokoro" | "gemini" | "auto") => {
		if (!selectedStory) return;
		setSynthesizing(true);
		setError(null);
		try {
			const result = await api.synthesize(selectedStory, provider);
			const updated = await api.listVoiceovers(selectedStory);
			setVoiceovers(updated);
			const newVo = updated.find((v) => v.id === result.voiceoverId);
			if (newVo) {
				setSelectedVo(newVo);
				const detail = await api.getVoiceover(newVo.id);
				setTimings(detail.timings);
			}
		} catch (err) {
			setError(String(err));
		} finally {
			setSynthesizing(false);
		}
	};

	const selectVoiceover = async (vo: Voiceover) => {
		setSelectedVo(vo);
		try {
			const detail = await api.getVoiceover(vo.id);
			setTimings(detail.timings);
		} catch {
			setTimings([]);
		}
	};

	return (
		<div className="space-y-4">
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
				{selectedStory && (
					<Button
						onClick={() => handleSynthesize("auto")}
						disabled={synthesizing}
					>
						{synthesizing ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Sparkles className="h-4 w-4" />
						)}
						Synthesize
					</Button>
				)}
			</div>

			{error && (
				<div className="flex items-center gap-2 rounded-lg border border-red-600/30 bg-red-600/10 p-3 text-sm text-red-400">
					<AlertCircle className="h-4 w-4 shrink-0" />
					{error}
				</div>
			)}

			{!selectedStory ? (
				<EmptyState
					icon={Mic}
					title="Select a story to begin"
					description="Choose a channel and story to generate a voiceover."
				/>
			) : (
				<div className="grid gap-4 lg:grid-cols-3">
					{/* Voiceover history */}
					<div className="space-y-2 lg:col-span-1">
						<p className="text-xs font-medium text-muted-foreground">
							Voiceover History
						</p>
						{voiceovers.length === 0 ? (
							<p className="text-sm text-muted-foreground py-8 text-center">
								No voiceovers yet
							</p>
						) : (
							voiceovers.map((vo) => (
								<button
									key={vo.id}
									onClick={() => selectVoiceover(vo)}
									className={cn(
										"w-full rounded-lg border p-3 text-left transition-colors",
										selectedVo?.id === vo.id
											? "border-primary bg-accent"
											: "hover:bg-accent/50",
									)}
								>
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium">
											{formatDuration(vo.duration_ms)}
										</span>
										<Badge variant="outline" className="text-[10px]">
											{vo.provider}
										</Badge>
									</div>
									<p className="mt-1 text-xs text-muted-foreground">
										{vo.voice_id} ·{" "}
										{new Date(vo.created_at).toLocaleDateString()}
									</p>
								</button>
							))
						)}
					</div>

					{/* Player + timeline */}
					<div className="space-y-4 lg:col-span-2">
						{selectedVo ? (
							<>
								<Card>
									<CardHeader>
										<CardTitle className="text-sm">Audio Player</CardTitle>
									</CardHeader>
									<CardContent>
										<AudioPlayer
											src={api.voiceoverAudioUrl(selectedVo.id)}
										/>
										<div className="mt-3 grid grid-cols-3 gap-3 text-sm">
											<div>
												<p className="text-xs text-muted-foreground">
													Duration
												</p>
												<p className="font-medium">
													{formatDuration(selectedVo.duration_ms)}
												</p>
											</div>
											<div>
												<p className="text-xs text-muted-foreground">
													Provider
												</p>
												<p className="font-medium">{selectedVo.provider}</p>
											</div>
											<div>
												<p className="text-xs text-muted-foreground">Voice</p>
												<p className="font-medium">{selectedVo.voice_id}</p>
											</div>
										</div>
									</CardContent>
								</Card>

								{timings.length > 0 && (
									<Card>
										<CardHeader>
											<CardTitle className="text-sm">Scene Timeline</CardTitle>
										</CardHeader>
										<CardContent className="space-y-1.5">
											{timings.map((t) => {
												const startPct =
													(t.narration_start_ms / selectedVo.duration_ms) * 100;
												const widthPct =
													((t.narration_end_ms - t.narration_start_ms) /
														selectedVo.duration_ms) *
													100;
												return (
													<div
														key={t.id}
														className="rounded-lg border bg-card p-2.5"
													>
														<div className="flex items-center gap-2 mb-1">
															<Badge
																variant="secondary"
																className="text-[10px]"
															>
																#{t.scene_order}
															</Badge>
															<span className="text-xs text-muted-foreground">
																{formatDuration(t.narration_start_ms)} –{" "}
																{formatDuration(t.narration_end_ms)}
															</span>
														</div>
														<p className="line-clamp-2 text-xs text-muted-foreground mb-1.5">
															{t.narration_text}
														</p>
														<div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
															<div
																className="absolute h-full rounded-full bg-primary/60"
																style={{
																	left: `${startPct}%`,
																	width: `${Math.max(widthPct, 1)}%`,
																}}
															/>
														</div>
													</div>
												);
											})}
										</CardContent>
									</Card>
								)}
							</>
						) : (
							<EmptyState
								icon={Volume2}
								title="No voiceover selected"
								description="Select a voiceover from the history or synthesize a new one."
							/>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

// === Main page ===

export function VoicePage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Voice</h1>
				<p className="text-sm text-muted-foreground">
					Browse voiceovers and generate new audio narration.
				</p>
			</div>
			<Tabs defaultValue="library">
				<TabsList>
					<TabsTrigger value="library">
						<Volume2 className="mr-1.5 h-4 w-4" /> Library
					</TabsTrigger>
					<TabsTrigger value="synthesis">
						<Mic className="mr-1.5 h-4 w-4" /> Synthesis
					</TabsTrigger>
				</TabsList>
				<TabsContent value="library">
					<LibraryView />
				</TabsContent>
				<TabsContent value="synthesis">
					<SynthesisView />
				</TabsContent>
			</Tabs>
		</div>
	);
}
