/**
 * StoriesPage — Story library and generation.
 *
 * Layout:
 * - PageHeader
 * - Tabs: "Library" (card grid with server-side search + pagination) and
 *   "Generate" (step-by-step candidate generation workflow)
 * - Clicking a library card opens a right sidebar Sheet with full story details
 *   (version JSON, DNA, sources, claims)
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
	BookOpen,
	Sparkles,
	CheckCircle2,
	AlertTriangle,
	Loader2,
	ChevronRight,
	FileText,
	Star,
	Clock,
	Tag,
	Layers,
	ExternalLink,
	Snowflake,
	Search,
	Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetBody,
} from "@/components/ui/sheet";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDebouncedValue, usePagination } from "@/lib/hooks";
import {
	api,
	type Channel,
	type Story,
	type StoryCandidate,
	type StoryVersion,
	type StoryDna,
	type StorySource,
	type StoryClaim,
	type DuplicateResult,
	type ContentType,
	type ResearchOutput,
} from "@/lib/api";
import { PageHeader, LoadingState } from "@/components/shared/PageLayout";

const PAGE_SIZE = 24;

export function StoriesPage() {
	const [tab, setTab] = useState<"library" | "generate">("library");

	return (
		<div>
			<PageHeader
				icon={BookOpen}
				title="Stories"
				subtitle="Browse, search, and generate story candidates across all channels"
			/>

			<Tabs
				value={tab}
				onValueChange={(v) => setTab(v as "library" | "generate")}
			>
				<TabsList>
					<TabsTrigger value="library" className="gap-1.5">
						<BookOpen className="h-3.5 w-3.5" />
						Library
					</TabsTrigger>
					<TabsTrigger value="generate" className="gap-1.5">
						<Sparkles className="h-3.5 w-3.5" />
						Generate
					</TabsTrigger>
				</TabsList>

				<TabsContent value="library">
					<StoryLibrary />
				</TabsContent>

				<TabsContent value="generate">
					<GenerateTab onGenerated={() => setTab("library")} />
				</TabsContent>
			</Tabs>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Library tab — card grid with server-side search + pagination
// ---------------------------------------------------------------------------

function StoryLibrary() {
	const { page, pageSize, search, setPage, setSearch, resetPage } =
		usePagination(PAGE_SIZE);
	const debouncedSearch = useDebouncedValue(search, 350);

	const [channels, setChannels] = useState<Channel[]>([]);
	const [channelId, setChannelId] = useState<string>("all");
	const [stories, setStories] = useState<Story[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(false);

	// Selected story for the detail sidebar
	const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

	// Load channels once for the filter dropdown
	useEffect(() => {
		api.listChannels().then(setChannels).catch(console.error);
	}, []);

	// Reset to page 1 when search or channel filter changes
	useEffect(() => {
		resetPage();
	}, [debouncedSearch, channelId, resetPage]);

	// Load stories (server-side pagination + search + channel filter)
	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		api
			.listStoriesPaginated({
				search: debouncedSearch || undefined,
				limit: pageSize,
				offset: (page - 1) * pageSize,
				channelId: channelId !== "all" ? channelId : undefined,
			})
			.then((res) => {
				if (cancelled) return;
				setStories(res.items);
				setTotal(res.total);
			})
			.catch((err) => {
				console.error("Failed to load stories:", err);
				if (!cancelled) {
					setStories([]);
					setTotal(0);
				}
			})
			.finally(() => !cancelled && setLoading(false));
		return () => {
			cancelled = true;
		};
	}, [debouncedSearch, channelId, page, pageSize]);

	const channelName = useCallback(
		(id: string) => channels.find((c) => c.id === id)?.name ?? "—",
		[channels],
	);

	return (
		<div className="space-y-4">
			{/* Toolbar: search + channel filter */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
				<SearchInput
					value={search}
					onChange={setSearch}
					placeholder="Search stories by title..."
					className="flex-1"
				/>
				<Select value={channelId} onValueChange={setChannelId}>
					<SelectTrigger className="sm:w-[220px]">
						<SelectValue placeholder="All channels" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All channels</SelectItem>
						{channels.map((c) => (
							<SelectItem key={c.id} value={c.id}>
								{c.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Card grid */}
			{loading ? (
				<LoadingState message="Loading stories..." />
			) : stories.length === 0 ? (
				<EmptyState
					icon={BookOpen}
					title={
						search || channelId !== "all"
							? "No stories found"
							: "No stories yet"
					}
					description={
						search || channelId !== "all"
							? "Try adjusting your search or channel filter."
							: "Generate story candidates to populate the library."
					}
				/>
			) : (
				<>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
						{stories.map((s) => (
							<StoryCard
								key={s.id}
								story={s}
								channelName={channelName(s.channelId)}
								onClick={() => setSelectedStoryId(s.id)}
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

			{/* Detail sidebar */}
			<StoryDetailSheet
				storyId={selectedStoryId}
				open={selectedStoryId !== null}
				onOpenChange={(open) => !open && setSelectedStoryId(null)}
			/>
		</div>
	);
}

function StoryCard({
	story,
	channelName,
	onClick,
}: {
	story: Story;
	channelName: string;
	onClick: () => void;
}) {
	const approved = !!story.approvedAt;
	return (
		<Card
			className="rounded-xl border bg-card hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5 transition-all duration-200 transition-all cursor-pointer"
			onClick={onClick}
		>
			<CardContent className="p-4 space-y-3">
				<h3 className="font-medium text-sm leading-tight line-clamp-2">
					{story.title}
				</h3>

				<div className="flex flex-wrap items-center gap-1.5">
					<Badge variant="secondary" className="text-[10px] gap-1">
						<Tag className="h-2.5 w-2.5" />
						{story.contentType}
					</Badge>
					{approved ? (
						<Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
							<CheckCircle2 className="h-2.5 w-2.5" />
							Approved
						</Badge>
					) : (
						<Badge variant="outline" className="text-[10px] gap-1">
							<Clock className="h-2.5 w-2.5" />
							Pending
						</Badge>
					)}
				</div>

				<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
					<Radio className="h-3 w-3 shrink-0" />
					<span className="truncate">{channelName}</span>
				</div>

				<div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t">
					<span className="flex items-center gap-1">
						<Clock className="h-2.5 w-2.5" />
						{new Date(story.createdAt).toLocaleDateString(undefined, {
							month: "short",
							day: "numeric",
						})}
					</span>
					{story.approvedAt && (
						<span className="flex items-center gap-1 text-emerald-500">
							<CheckCircle2 className="h-2.5 w-2.5" />
							{new Date(story.approvedAt).toLocaleDateString(undefined, {
								month: "short",
								day: "numeric",
							})}
						</span>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

// ---------------------------------------------------------------------------
// Story detail sidebar (Sheet)
// ---------------------------------------------------------------------------

interface StoryDetailData {
	story: Story;
	version: StoryVersion | null;
	dna: StoryDna | null;
	sources: StorySource[];
	claims: StoryClaim[];
}

function StoryDetailSheet({
	storyId,
	open,
	onOpenChange,
}: {
	storyId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [data, setData] = useState<StoryDetailData | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!storyId || !open) return;
		setLoading(true);
		setData(null);
		api
			.getStory(storyId)
			.then(setData)
			.catch(console.error)
			.finally(() => setLoading(false));
	}, [storyId, open]);

	const candidate = data?.version?.storyJson;

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" width="max-w-2xl" className="p-0">
				<SheetHeader>
					<SheetTitle className="pr-8">
						{loading ? "Loading..." : (data?.story.title ?? "Story Details")}
					</SheetTitle>
					<SheetDescription>
						Full story version, DNA, sources, and claims.
					</SheetDescription>
				</SheetHeader>

				<SheetBody className="space-y-5">
					{loading ? (
						<LoadingState message="Loading story details..." />
					) : !data ? (
						<EmptyState icon={FileText} title="Story not found" />
					) : (
						<>
							{/* Meta badges */}
							<div className="flex flex-wrap items-center gap-2">
								<Badge variant="secondary" className="text-xs gap-1">
									<Tag className="h-3 w-3" />
									{data.story.contentType}
								</Badge>
								{data.story.approvedAt ? (
									<Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs gap-1">
										<CheckCircle2 className="h-3 w-3" />
										Approved
									</Badge>
								) : (
									<Badge variant="outline" className="text-xs gap-1">
										<Clock className="h-3 w-3" />
										Pending
									</Badge>
								)}
								<span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
									<Clock className="h-3 w-3" />
									{new Date(data.story.createdAt).toLocaleDateString(
										undefined,
										{
											month: "short",
											day: "numeric",
											year: "numeric",
										},
									)}
								</span>
							</div>

							{candidate && (
								<>
									{/* Hook */}
									<div className="text-sm text-muted-foreground italic leading-relaxed border-l-2 border-primary/30 pl-3">
										"{candidate.hook}"
									</div>

									{/* Premise / Emotional Arc / Core Idea / Character Role */}
									<div className="grid grid-cols-2 gap-4 text-sm">
										<DetailField label="Premise" value={candidate.premise} />
										<DetailField
											label="Emotional Arc"
											value={candidate.emotionalArc}
										/>
										<DetailField
											label="Core Idea"
											value={candidate.corePsychologicalIdea}
										/>
										<DetailField
											label="Character Role"
											value={candidate.mainCharacterRole}
										/>
									</div>

									{/* Character assignments */}
									{(candidate.characters?.length || candidate.newCharacters?.length) ? (
										<div>
											<span className="text-xs text-muted-foreground">Characters</span>
											<div className="mt-1 flex flex-wrap gap-1.5">
												{candidate.characters?.map((ch, j) => (
													<Badge key={`ex-${j}`} className="text-[10px] bg-blue-600/20 text-blue-400 border-blue-600/30">
														{ch.name}
														<span className="text-blue-400/60 ml-1">{ch.roleInStory}</span>
													</Badge>
												))}
												{candidate.newCharacters?.map((ch, j) => (
													<Badge key={`new-${j}`} className="text-[10px] bg-purple-600/20 text-purple-400 border-purple-600/30">
														<Sparkles className="mr-1 h-2.5 w-2.5" />
														{ch.name}
														<span className="text-purple-400/60 ml-1">{ch.roleInStory}</span>
													</Badge>
												))}
											</div>
										</div>
									) : null}

									{/* Storyline */}
									<div>
										<span className="text-xs text-muted-foreground">
											Storyline
										</span>
										<p className="text-sm mt-0.5">{candidate.storyline}</p>
									</div>

									{/* Key events timeline */}
									<div>
										<span className="text-xs text-muted-foreground">
											Key Events
										</span>
										<div className="flex flex-wrap items-center gap-2 mt-1.5">
											{candidate.keyEvents.map((e, i) => (
												<div key={i} className="flex items-center gap-2">
													<Badge variant="outline" className="text-[10px]">
														{i + 1}
													</Badge>
													<span className="text-sm">{e}</span>
													{i < candidate.keyEvents.length - 1 && (
														<ChevronRight className="h-3 w-3 text-muted-foreground/50" />
													)}
												</div>
											))}
										</div>
									</div>

									{/* Twist / Lesson */}
									<div className="grid grid-cols-2 gap-4 text-sm">
										<DetailField
											label="Twist / Resolution"
											value={candidate.twistOrResolution}
										/>
										<DetailField
											label="Lesson"
											value={candidate.lessonOrTakeaway}
										/>
									</div>
								</>
							)}

							{/* Story DNA */}
							{data.dna && (
								<>
									<Separator />
									<div>
										<h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
											<Layers className="h-4 w-4 text-muted-foreground" />
											Story DNA
										</h3>
										<div className="grid grid-cols-2 gap-2 text-xs">
											{Object.entries(
												data.dna as unknown as Record<string, unknown>,
											)
												.filter(
													([k, v]) =>
														k !== "id" &&
														k !== "storyId" &&
														k !== "created_at" &&
														v,
												)
												.map(([k, v]) => (
													<div
														key={k}
														className="rounded-md bg-muted/30 px-2.5 py-1.5"
													>
														<span className="text-muted-foreground capitalize">
															{k.replace(/([A-Z])/g, " $1").trim()}:
														</span>
														<span className="ml-1">{String(v)}</span>
													</div>
												))}
										</div>
									</div>
								</>
							)}

							{/* Sources */}
							{data.sources.length > 0 && (
								<>
									<Separator />
									<div>
										<h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
											<FileText className="h-4 w-4 text-muted-foreground" />
											Sources ({data.sources.length})
										</h3>
										<div className="space-y-1.5">
											{data.sources.map((s) => (
												<div
													key={s.id}
													className="text-xs rounded-md bg-muted/20 px-2.5 py-1.5"
												>
													<div className="flex items-center gap-1">
														<strong>{s.source_id}:</strong> {s.title}
														{s.url && (
															<a
																href={s.url}
																target="_blank"
																rel="noopener"
																className="ml-1 text-blue-400 hover:underline inline-flex items-center gap-0.5"
															>
																<ExternalLink className="h-2.5 w-2.5" />
															</a>
														)}
													</div>
													{s.excerpt && (
														<div className="text-muted-foreground italic mt-0.5">
															{s.excerpt.slice(0, 120)}...
														</div>
													)}
												</div>
											))}
										</div>
									</div>
								</>
							)}

							{/* Claims */}
							{data.claims.length > 0 && (
								<>
									<Separator />
									<div>
										<h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
											<CheckCircle2 className="h-4 w-4 text-muted-foreground" />
											Claims ({data.claims.length})
										</h3>
										<div className="space-y-1.5">
											{data.claims.map((cl) => (
												<div
													key={cl.id}
													className="text-xs rounded-md bg-muted/20 px-2.5 py-1.5"
												>
													<div>
														<strong>{cl.claim_id}:</strong> {cl.claim}
													</div>
													<div className="text-muted-foreground mt-0.5 flex items-center gap-2">
														<span>Sources: {cl.sourceIds.join(", ")}</span>
														<Badge
															variant="outline"
															className={cn(
																"text-[10px]",
																cl.confidence === "high" && "text-green-400",
																cl.confidence === "medium" && "text-amber-400",
																cl.confidence === "low" && "text-red-400",
															)}
														>
															{cl.confidence}
														</Badge>
													</div>
												</div>
											))}
										</div>
									</div>
								</>
							)}
						</>
					)}
				</SheetBody>
			</SheetContent>
		</Sheet>
	);
}

function DetailField({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<span className="text-xs text-muted-foreground">{label}</span>
			<p className="mt-0.5">{value}</p>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Generate tab — step-by-step candidate generation workflow
// ---------------------------------------------------------------------------

const GEN_STEPS = [
	"Classifying content type",
	"Researching with grounding",
	"Generating candidates",
	"Duplicate detection",
];

function GenerateTab({ onGenerated }: { onGenerated: () => void }) {
	const [channels, setChannels] = useState<Channel[]>([]);
	const [selectedChannel, setSelectedChannel] = useState<string>("");
	const [topic, setTopic] = useState("");
	const [generating, setGenerating] = useState(false);
	const [genStep, setGenStep] = useState("");
	const [genStepIdx, setGenStepIdx] = useState(-1);
	const [candidates, setCandidates] = useState<StoryCandidate[]>([]);
	const [contentType, setContentType] = useState<ContentType | "">("");
	const [research, setResearch] = useState<ResearchOutput | null>(null);
	const [duplicateResults, setDuplicateResults] = useState<DuplicateResult[]>(
		[],
	);
	const [selectedCandidate, setSelectedCandidate] = useState<number | null>(
		null,
	);
	const [freezing, setFreezing] = useState(false);

	useEffect(() => {
		api
			.listChannels()
			.then((ch) => {
				setChannels(ch);
				if (ch.length > 0 && !selectedChannel) setSelectedChannel(ch[0]!.id);
			})
			.catch(console.error);
	}, [selectedChannel]);

	const channel = useMemo(
		() => channels.find((c) => c.id === selectedChannel),
		[channels, selectedChannel],
	);

	async function handleGenerate() {
		if (!topic.trim() || !selectedChannel) return;
		setGenerating(true);
		setGenStepIdx(0);
		setGenStep("Classifying content type...");
		setCandidates([]);
		setDuplicateResults([]);
		setSelectedCandidate(null);
		setResearch(null);

		try {
			// Step 1: Classify
			const classifyResult = await api.classifyContent(topic, selectedChannel);
			setContentType(classifyResult.contentType as ContentType);
			setGenStep(`Classified as ${classifyResult.contentType}`);

			// Step 2: Research (if not fictional)
			let generationResearch: ResearchOutput | undefined;
			if (classifyResult.contentType !== "fictional_story") {
				setGenStepIdx(1);
				setGenStep("Researching with Gemini grounding...");
				generationResearch = await api.performResearch({
					channelId: selectedChannel,
					topic,
					contentType: classifyResult.contentType,
				});
				setResearch(generationResearch);
				setGenStep(
					`Research complete: ${generationResearch.sources.length} sources`,
				);
			}

			const novelty = await api.getNoveltyContext(selectedChannel, topic);

			// Step 3: Generate candidates
			setGenStepIdx(2);
			setGenStep("Generating story candidates...");
			const candidatesResult = await api.generateCandidates({
				channel: selectedChannel,
				topic,
				contentType: classifyResult.contentType,
				targetDurationSeconds: channel?.targetDurationSeconds,
				noveltyContext: novelty.noveltyContext,
				research: generationResearch,
				candidateCount: 3,
			});
			setCandidates(candidatesResult);
			setGenStep(`Generated ${candidatesResult.length} candidates`);

			// Step 4: Duplicate detection
			if (candidatesResult.length > 0) {
				setGenStepIdx(3);
				setGenStep("Running duplicate detection...");
				try {
					const dupResults = await api.runDuplicateDetection({
						channelId: selectedChannel,
						runId: "manual-" + Date.now(),
						candidates: candidatesResult,
					});
					setDuplicateResults(dupResults);
					setGenStep("Duplicate detection complete");
				} catch {
					setGenStep("Duplicate detection skipped");
				}
			}

			setGenStepIdx(4);
			setGenStep("");
		} catch (err) {
			setGenStep(`Error: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setGenerating(false);
		}
	}

	async function handleFreeze(candidate: StoryCandidate) {
		if (!selectedChannel) return;
		setFreezing(true);
		try {
			await api.freezeStoryVersion({
				runId: "manual-" + Date.now(),
				channelId: selectedChannel,
				candidate,
				research: research ?? undefined,
			});
			// Reset and switch to library
			setTopic("");
			setCandidates([]);
			setDuplicateResults([]);
			setSelectedCandidate(null);
			setResearch(null);
			setContentType("");
			setGenStepIdx(-1);
			onGenerated();
		} catch (err) {
			setGenStep(
				`Freeze failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setFreezing(false);
		}
	}

	const classificationColor = (c: string) =>
		c === "duplicate"
			? "bg-red-500/15 text-red-400 border-red-500/30"
			: c === "borderline"
				? "bg-amber-500/15 text-amber-400 border-amber-500/30"
				: "bg-green-500/15 text-green-400 border-green-500/30";

	return (
		<div className="space-y-5 max-w-3xl">
			{/* Channel + topic input */}
			<div className="space-y-3">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
					<Select value={selectedChannel} onValueChange={setSelectedChannel}>
						<SelectTrigger className="sm:w-[220px]">
							<SelectValue placeholder="Select channel..." />
						</SelectTrigger>
						<SelectContent>
							{channels.map((c) => (
								<SelectItem key={c.id} value={c.id}>
									{c.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex gap-2">
					<Input
						placeholder="e.g. The psychology of procrastination"
						value={topic}
						onChange={(e) => setTopic(e.target.value)}
						disabled={generating}
						onKeyDown={(e) => {
							if (
								e.key === "Enter" &&
								!generating &&
								topic.trim() &&
								selectedChannel
							) {
								handleGenerate();
							}
						}}
					/>
					<Button
						onClick={handleGenerate}
						disabled={generating || !topic.trim() || !selectedChannel}
						className="shrink-0"
					>
						{generating ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Sparkles className="mr-2 h-4 w-4" />
						)}
						{generating ? "Working..." : "Generate"}
					</Button>
				</div>
			</div>

			{/* Step progress */}
			{(generating || genStepIdx >= 0) && (
				<div className="space-y-2">
					{GEN_STEPS.map((step, i) => {
						const done = genStepIdx > i;
						const active = genStepIdx === i;
						return (
							<div
								key={i}
								className={cn(
									"flex items-center gap-2.5 text-sm transition-colors",
									done && "text-green-500",
									active && "text-foreground",
									!done && !active && "text-muted-foreground/50",
								)}
							>
								<div className="flex-shrink-0">
									{done ? (
										<CheckCircle2 className="h-4 w-4" />
									) : active ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<div className="h-4 w-4 rounded-full border border-current" />
									)}
								</div>
								{step}
							</div>
						);
					})}
					{genStep && genStepIdx < 4 && (
						<div className="text-xs text-muted-foreground ml-6.5 pl-0.5">
							{genStep}
						</div>
					)}
				</div>
			)}

			{/* Classification + Research summary */}
			{(contentType || research) && (
				<div className="flex flex-wrap gap-2">
					{contentType && (
						<Badge variant="secondary" className="gap-1">
							<Tag className="h-3 w-3" />
							{contentType}
						</Badge>
					)}
					{research && (
						<>
							<Badge variant="outline" className="gap-1">
								<FileText className="h-3 w-3" />
								{research.sources.length} sources
							</Badge>
							<Badge variant="outline" className="gap-1">
								<Layers className="h-3 w-3" />
								{research.claims.length} claims
							</Badge>
							{research.warnings.length > 0 && (
								<Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1">
									<AlertTriangle className="h-3 w-3" />
									{research.warnings.length} warnings
								</Badge>
							)}
						</>
					)}
				</div>
			)}

			{/* Research sources (collapsible) */}
			{research && research.sources.length > 0 && (
				<details className="group">
					<summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
						<ChevronRight className="h-3.5 w-3.5 group-open:rotate-90 transition-transform" />
						Research sources
					</summary>
					<ul className="mt-2 space-y-1 ml-5">
						{research.sources.map((s) => (
							<li key={s.id} className="text-xs text-muted-foreground">
								<strong>{s.id}:</strong> {s.title}
								{s.url && (
									<a
										href={s.url}
										target="_blank"
										rel="noopener"
										className="ml-1 text-blue-400 hover:underline inline-flex items-center gap-0.5"
									>
										link <ExternalLink className="h-2.5 w-2.5" />
									</a>
								)}
							</li>
						))}
					</ul>
				</details>
			)}

			{/* Candidates */}
			{candidates.length > 0 && (
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold">
							Candidates ({candidates.length})
						</h3>
						<span className="text-xs text-muted-foreground">
							Click to expand · Select to approve
						</span>
					</div>

					{candidates.map((c, i) => {
						const dupResult = duplicateResults[i];
						const isSelected = selectedCandidate === i;
						return (
							<Card
								key={i}
								className={cn(
									"cursor-pointer transition-all",
									isSelected && "ring-1 ring-primary/50",
								)}
								onClick={() => setSelectedCandidate(i)}
							>
								<CardContent className="p-4">
									{/* Header row */}
									<div className="flex items-start justify-between gap-2 mb-2">
										<h4 className="font-medium text-sm leading-tight">
											{c.title}
										</h4>
										<div className="flex items-center gap-1.5 shrink-0">
											{dupResult?.bestCandidate && (
												<Badge className="bg-primary/15 text-primary border-primary/30 gap-1">
													<Star className="h-3 w-3 fill-current" />
													Best
												</Badge>
											)}
											{dupResult && (
												<Badge
													className={classificationColor(
														dupResult.classification,
													)}
												>
													{dupResult.classification}
												</Badge>
											)}
										</div>
									</div>

									{/* Hook (always visible) */}
									<p className="text-xs text-muted-foreground italic leading-relaxed">
										"{c.hook}"
									</p>

									{/* Character badges (if any) */}
									{(c.characters?.length || c.newCharacters?.length) ? (
										<div className="mt-2 flex flex-wrap gap-1">
											{c.characters?.map((ch, j) => (
												<Badge key={`ex-${j}`} className="text-[10px] bg-blue-600/20 text-blue-400 border-blue-600/30">
													{ch.name}
													<span className="text-blue-400/60 ml-1">{ch.roleInStory}</span>
												</Badge>
											))}
											{c.newCharacters?.map((ch, j) => (
												<Badge key={`new-${j}`} className="text-[10px] bg-purple-600/20 text-purple-400 border-purple-600/30">
													<Sparkles className="mr-1 h-2.5 w-2.5" />
													{ch.name}
													<span className="text-purple-400/60 ml-1">{ch.roleInStory}</span>
												</Badge>
											))}
										</div>
									) : null}

									{/* Expanded details */}
									{isSelected && (
										<div className="mt-3 space-y-3">
											<Separator />

											<div className="grid grid-cols-2 gap-3 text-xs">
												<div>
													<span className="text-muted-foreground">Premise</span>
													<p className="mt-0.5">{c.premise}</p>
												</div>
												<div>
													<span className="text-muted-foreground">
														Emotional Arc
													</span>
													<p className="mt-0.5">{c.emotionalArc}</p>
												</div>
												<div>
													<span className="text-muted-foreground">
														Core Idea
													</span>
													<p className="mt-0.5">{c.corePsychologicalIdea}</p>
												</div>
												<div>
													<span className="text-muted-foreground">
														Character Role
													</span>
													<p className="mt-0.5">{c.mainCharacterRole}</p>
												</div>
											</div>

											<div>
												<span className="text-xs text-muted-foreground">
													Storyline
												</span>
												<p className="text-xs mt-0.5">{c.storyline}</p>
											</div>

											<div>
												<span className="text-xs text-muted-foreground">
													Key Events
												</span>
												<div className="flex flex-wrap items-center gap-1.5 mt-1">
													{c.keyEvents.map((e, j) => (
														<div key={j} className="flex items-center gap-1.5">
															<Badge variant="outline" className="text-[10px]">
																{j + 1}
															</Badge>
															<span className="text-xs">{e}</span>
															{j < c.keyEvents.length - 1 && (
																<ChevronRight className="h-3 w-3 text-muted-foreground/50" />
															)}
														</div>
													))}
												</div>
											</div>

											<div className="grid grid-cols-2 gap-3 text-xs">
												<div>
													<span className="text-muted-foreground">
														Twist / Resolution
													</span>
													<p className="mt-0.5">{c.twistOrResolution}</p>
												</div>
												<div>
													<span className="text-muted-foreground">Lesson</span>
													<p className="mt-0.5">{c.lessonOrTakeaway}</p>
												</div>
											</div>

											{/* Duplicate checks */}
											{dupResult && dupResult.checks.length > 0 && (
												<>
													<Separator />
													<div className="space-y-1.5">
														<span className="text-xs font-medium">
															Duplicate Checks ({dupResult.checks.length})
														</span>
														{dupResult.checks.map((ch, j) => (
															<div
																key={j}
																className="flex items-center gap-2 text-xs"
															>
																<Badge
																	className={classificationColor(
																		ch.classification,
																	)}
																>
																	{ch.classification}
																</Badge>
																<span className="text-muted-foreground">
																	vs "{ch.existingTitle}"
																</span>
																<span className="text-muted-foreground/70 ml-auto font-mono">
																	L:{ch.lexicalScore.toFixed(2)} S:
																	{ch.semanticScore.toFixed(2)} St:
																	{ch.structuralScore.toFixed(2)}
																</span>
															</div>
														))}
													</div>
												</>
											)}

											{/* Approve & freeze button */}
											{dupResult?.classification !== "duplicate" && (
												<div className="pt-1">
													<Button
														size="sm"
														onClick={(e) => {
															e.stopPropagation();
															handleFreeze(c);
														}}
														disabled={freezing}
													>
														{freezing ? (
															<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
														) : (
															<Snowflake className="mr-2 h-3.5 w-3.5" />
														)}
														{freezing ? "Freezing..." : "Approve & Freeze"}
													</Button>
												</div>
											)}
										</div>
									)}
								</CardContent>
							</Card>
						);
					})}
				</div>
			)}

			{/* Empty state */}
			{!generating && genStepIdx < 0 && (
				<EmptyState
					icon={Search}
					title="Enter a topic to generate"
					description="Pick a channel, enter a topic, and generate story candidates with research, classification, and duplicate detection."
				/>
			)}
		</div>
	);
}
