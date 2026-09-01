/**
 * LibraryPage — Video library and social media publishing.
 *
 * Two tabs:
 * 1. Library — card grid of all rendered videos with search, pagination,
 *    and a publish dialog per video.
 * 2. Publish Jobs — list of publish attempts with per-platform status.
 *
 * Platform connection management is accessible from the Library tab
 * via the "Connect Platforms" button.
 */

import { useState, useEffect, useCallback } from "react";
import {
	Film,
	Loader2,
	Upload,
	Plus,
	Trash2,
	ExternalLink,
	CheckCircle,
	XCircle,
	Clock,
	AlertCircle,
	Share2,
	Video as VideoIcon,
	Settings2,
	Calendar,
	Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	api,
	type Channel,
	type LibraryVideo,
	type PlatformAccount,
	type SupportedPlatform,
	type PublishJob,
	type PublishMetadata,
	type SocialPlatform,
} from "@/lib/api";
import { useDebouncedValue, usePagination } from "@/lib/hooks";

const PAGE_SIZE = 24;

// === Platform icon mapping ===
const platformIcons: Record<string, typeof Film> = {
	youtube: Film,
	tiktok: VideoIcon,
	instagram: Film,
	facebook: Film,
	twitter: Film,
	linkedin: Film,
	threads: Film,
	pinterest: Film,
	reddit: Film,
	bluesky: Film,
	snapchat: Film,
	telegram: Film,
	discord: Film,
	slack: Film,
	googlebusiness: Film,
};

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
	const Icon = platformIcons[platform] ?? Film;
	return <Icon className={className} />;
}

// === Video Card ===

function VideoCard({
	video,
	channels,
	onPublish,
}: {
	video: LibraryVideo;
	channels: Channel[];
	onPublish: (video: LibraryVideo) => void;
}) {
	const channel = channels.find((c) => c.id === video.channelId);
	const title = video.storyTitle ?? video.runTopic ?? `Video ${video.id.slice(0, 8)}`;

	return (
		<Card className="group overflow-hidden transition-all hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5 transition-all duration-200">
			<div className="relative aspect-video bg-muted flex items-center justify-center overflow-hidden">
				<video
					src={api.libraryVideoUrl(video.id)}
					className="h-full w-full object-cover"
					preload="metadata"
					muted
					onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
					onMouseLeave={(e) => e.currentTarget.pause()}
				/>
				<div className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
					{video.width && video.height ? `${video.width}x${video.height}` : "Video"}
				</div>
			</div>
			<CardContent className="p-3 space-y-2">
				<p className="line-clamp-2 text-sm font-medium">{title}</p>
				<div className="flex items-center gap-2 text-[10px] text-muted-foreground">
					{channel && (
						<span className="inline-flex items-center gap-1">
							<Film className="h-3 w-3" />
							{channel.name}
						</span>
					)}
					<span className="inline-flex items-center gap-1">
						<Calendar className="h-3 w-3" />
						{new Date(video.createdAt).toLocaleDateString()}
					</span>
				</div>
				<Button
					size="sm"
					className="w-full"
					onClick={() => onPublish(video)}
				>
					<Share2 className="mr-1.5 h-3.5 w-3.5" />
					Publish
				</Button>
			</CardContent>
		</Card>
	);
}

// === Publish Dialog ===

function PublishDialog({
	video,
	channels,
	accounts,
	open,
	onOpenChange,
	onPublished,
}: {
	video: LibraryVideo | null;
	channels: Channel[];
	accounts: PlatformAccount[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onPublished: () => void;
}) {
	const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [tags, setTags] = useState("");
	const [hashtags, setHashtags] = useState("");
	const [publishing, setPublishing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const channel = video ? channels.find((c) => c.id === video.channelId) : null;
	const channelAccounts = accounts.filter((a) => a.channelId === video?.channelId);

	useEffect(() => {
		if (video) {
			const titleFromVideo = video.storyTitle ?? video.runTopic ?? `Video ${video.id.slice(0, 8)}`;
			setTitle(titleFromVideo);
			setDescription("");
			setTags("");
			setHashtags("");
			setSelectedPlatforms(new Set());
			setError(null);
		}
	}, [video]);

	const togglePlatform = (accountId: string) => {
		setSelectedPlatforms((prev) => {
			const next = new Set(prev);
			if (next.has(accountId)) next.delete(accountId);
			else next.add(accountId);
			return next;
		});
	};

	const handlePublish = async () => {
		if (!video || !channel) return;
		if (selectedPlatforms.size === 0) {
			setError("Select at least one platform to publish to.");
			return;
		}

		setPublishing(true);
		setError(null);

		try {
			const platforms = Array.from(selectedPlatforms).map((accountId) => {
				const account = channelAccounts.find((a) => a.id === accountId)!;
				return { platform: account.platform, accountId: account.providerAccountId };
			});

			const metadata: PublishMetadata = {
				title,
				description,
				tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
				hashtags: hashtags ? hashtags.split(",").map((t) => t.trim()).filter(Boolean) : [],
				scheduledFor: null,
				publishNow: true,
			};

			await api.publishVideo({
				channelId: channel.id,
				videoAssetId: video.id,
				platforms,
				metadata,
			});

			onPublished();
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setPublishing(false);
		}
	};

	if (!video) return null;

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent width="max-w-2xl">
				<SheetHeader>
					<SheetTitle className="flex items-center gap-2">
						<Share2 className="h-5 w-5 text-muted-foreground" />
						Publish Video
					</SheetTitle>
					<SheetDescription>
						{video.storyTitle ?? video.runTopic ?? `Video ${video.id.slice(0, 8)}`}
						{channel && ` · ${channel.name}`}
					</SheetDescription>
				</SheetHeader>
				<SheetBody>
					<div className="space-y-4">
						{/* Video preview */}
						<div className="rounded-lg overflow-hidden border bg-card">
							<video
								src={api.libraryVideoUrl(video.id)}
								className="w-full aspect-video"
								controls
								preload="metadata"
							/>
						</div>

						{/* Platform selection */}
						<div className="space-y-2">
							<Label className="text-sm font-medium">Target Platforms</Label>
							{channelAccounts.length === 0 ? (
								<div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-600 dark:text-amber-400">
									No platforms connected for this channel. Close this dialog and click "Connect Platforms" first.
								</div>
							) : (
								<div className="grid grid-cols-2 gap-2">
									{channelAccounts.map((account) => {
										const isSelected = selectedPlatforms.has(account.id);
										return (
											<button
												key={account.id}
												onClick={() => togglePlatform(account.id)}
												className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-all ${
													isSelected
														? "border-primary bg-primary/10"
														: "border-border hover:bg-accent"
												}`}
											>
												<PlatformIcon
													platform={account.platform}
													className="h-4 w-4 shrink-0"
												/>
												<div className="min-w-0 flex-1">
													<p className="text-xs font-medium capitalize">
														{account.platform}
													</p>
													<p className="text-[10px] text-muted-foreground truncate">
														{account.displayName ?? account.username ?? "Connected"}
													</p>
												</div>
												{isSelected && (
													<CheckCircle className="h-4 w-4 text-primary shrink-0" />
												)}
											</button>
										);
									})}
								</div>
							)}
						</div>

						<Separator />

						{/* Metadata */}
						<div className="space-y-3">
							<div>
								<Label htmlFor="publish-title" className="text-sm font-medium">Title</Label>
								<Input
									id="publish-title"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									placeholder="Video title"
									className="mt-1"
								/>
							</div>
							<div>
								<Label htmlFor="publish-description" className="text-sm font-medium">Description</Label>
								<Textarea
									id="publish-description"
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder="Video description / caption"
									rows={3}
									className="mt-1"
								/>
							</div>
							<div className="grid grid-cols-2 gap-3">
								<div>
									<Label htmlFor="publish-tags" className="text-sm font-medium">
										<Hash className="inline h-3 w-3 mr-1" />
										Tags (comma-separated)
									</Label>
									<Input
										id="publish-tags"
										value={tags}
										onChange={(e) => setTags(e.target.value)}
										placeholder="story, psychology, short"
										className="mt-1"
									/>
								</div>
								<div>
									<Label htmlFor="publish-hashtags" className="text-sm font-medium">Hashtags</Label>
									<Input
										id="publish-hashtags"
										value={hashtags}
										onChange={(e) => setHashtags(e.target.value)}
										placeholder="#story #psychology"
										className="mt-1"
									/>
								</div>
							</div>
						</div>

						{error && (
							<div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive flex items-start gap-2">
								<AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
								{error}
							</div>
						)}
					</div>
				</SheetBody>
				<SheetFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={handlePublish}
						disabled={publishing || selectedPlatforms.size === 0}
					>
						{publishing ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Upload className="mr-2 h-4 w-4" />
						)}
						{publishing ? "Publishing..." : "Publish Now"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

// === Connect Platforms Dialog ===

function ConnectPlatformsDialog({
	channel,
	platforms,
	accounts,
	open,
	onOpenChange,
	onAccountsChanged,
}: {
	channel: Channel | null;
	platforms: SupportedPlatform[];
	accounts: PlatformAccount[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAccountsChanged: () => void;
}) {
	const [connecting, setConnecting] = useState<string | null>(null);

	if (!channel) return null;

	const channelAccounts = accounts.filter((a) => a.channelId === channel.id);

	const handleConnect = async (platform: string) => {
		setConnecting(platform);
		try {
			const result = await api.connectPlatform(
				channel.id,
				platform,
				`${window.location.origin}/library`,
			);
			// Open the OAuth URL in a new tab
			window.open(result.authUrl, "_blank");
		} catch (err) {
			console.error("Connect error:", err);
		} finally {
			setConnecting(null);
		}
	};

	const handleDisconnect = async (account: PlatformAccount) => {
		try {
			await api.disconnectPlatform(channel.id, account.platform, account.providerAccountId);
			onAccountsChanged();
		} catch (err) {
			console.error("Disconnect error:", err);
		}
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent width="max-w-lg">
				<SheetHeader>
					<SheetTitle className="flex items-center gap-2">
						<Settings2 className="h-5 w-5 text-muted-foreground" />
						Connect Platforms
					</SheetTitle>
					<SheetDescription>
						Connect social media accounts for {channel.name}. Click a platform to authorize via Zernio.
					</SheetDescription>
				</SheetHeader>
				<SheetBody>
					<div className="space-y-2">
						{/* Connected accounts */}
						{channelAccounts.length > 0 && (
							<>
								<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
									Connected
								</p>
								{channelAccounts.map((account) => (
									<div
										key={account.id}
										className="flex items-center gap-3 rounded-lg border bg-card p-3"
									>
										<PlatformIcon platform={account.platform} className="h-5 w-5 shrink-0" />
										<div className="min-w-0 flex-1">
											<p className="text-sm font-medium capitalize">{account.platform}</p>
											<p className="text-xs text-muted-foreground truncate">
												{account.displayName ?? account.username ?? "Connected"}
											</p>
										</div>
										<Badge variant="outline" className="text-[10px] bg-emerald-600/10 text-emerald-600 border-emerald-600/30">
											<CheckCircle className="mr-1 h-2.5 w-2.5" />
											Active
										</Badge>
										<Button
											variant="ghost"
											size="icon"
											className="h-7 w-7"
											onClick={() => handleDisconnect(account)}
										>
											<Trash2 className="h-3.5 w-3.5 text-destructive" />
										</Button>
									</div>
								))}
								<Separator className="my-3" />
							</>
						)}

						{/* Available platforms */}
						<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Available Platforms
						</p>
						<div className="grid grid-cols-1 gap-2">
							{platforms.map((p) => {
								const isConnected = channelAccounts.some(
									(a) => a.platform === p.value && a.isActive,
								);
								return (
									<button
										key={p.value}
										onClick={() => !isConnected && handleConnect(p.value)}
										disabled={isConnected || connecting === p.value}
										className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${
											isConnected
												? "opacity-50 cursor-not-allowed"
												: "hover:bg-accent border-border"
										}`}
									>
										<PlatformIcon platform={p.value} className="h-5 w-5 shrink-0" />
										<div className="min-w-0 flex-1">
											<p className="text-sm font-medium">{p.label}</p>
										</div>
										{connecting === p.value ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : isConnected ? (
											<CheckCircle className="h-4 w-4 text-emerald-500" />
										) : (
											<Plus className="h-4 w-4 text-muted-foreground" />
										)}
									</button>
								);
							})}
						</div>

						<div className="rounded-md bg-blue-500/10 border border-blue-500/30 p-3 text-xs text-blue-600 dark:text-blue-400 mt-3">
							<p className="font-medium mb-1">How it works</p>
							<ol className="list-decimal list-inside space-y-0.5">
								<li>Click a platform to open Zernio's OAuth page</li>
								<li>Authorize Zernio to access your account</li>
								<li>After redirect, your account is connected</li>
								<li>You can then publish videos to that platform</li>
							</ol>
						</div>
					</div>
				</SheetBody>
				<SheetFooter>
					<Button onClick={() => onOpenChange(false)}>Done</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

// === Publish Job Card ===

function PublishJobCard({ job }: { job: PublishJob }) {
	const statusIcon = {
		published: <CheckCircle className="h-4 w-4 text-emerald-500" />,
		failed: <XCircle className="h-4 w-4 text-destructive" />,
		publishing: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
		pending: <Clock className="h-4 w-4 text-muted-foreground" />,
		uploading: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
		cancelled: <XCircle className="h-4 w-4 text-muted-foreground" />,
	};

	return (
		<Card className="overflow-hidden">
			<CardContent className="p-3 space-y-2">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						{statusIcon[job.status]}
						<span className="text-sm font-medium capitalize">{job.status}</span>
					</div>
					<span className="text-[10px] text-muted-foreground">
						{new Date(job.createdAt).toLocaleString()}
					</span>
				</div>
				<div className="flex flex-wrap gap-1">
					{job.platforms.map((p, i) => {
						const result = job.results.find(
							(r) => r.platform === p.platform && r.accountId === p.accountId,
						);
						const resultStatus = result?.status ?? "pending";
						return (
							<Badge
								key={i}
								variant="outline"
								className={`text-[10px] ${
									resultStatus === "published"
										? "bg-emerald-600/10 text-emerald-600 border-emerald-600/30"
										: resultStatus === "failed"
											? "bg-destructive/10 text-destructive border-destructive/30"
											: ""
								}`}
							>
								<PlatformIcon platform={p.platform} className="mr-1 h-2.5 w-2.5" />
								{p.platform}
								{result?.postUrl && (
									<a
										href={result.postUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="ml-1 inline-flex"
									>
										<ExternalLink className="h-2.5 w-2.5" />
									</a>
								)}
							</Badge>
						);
					})}
				</div>
				{job.error && (
					<p className="text-xs text-destructive line-clamp-2">{job.error}</p>
				)}
			</CardContent>
		</Card>
	);
}

// === Main Page ===

export function LibraryPage() {
	const [channels, setChannels] = useState<Channel[]>([]);
	const [videos, setVideos] = useState<LibraryVideo[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebouncedValue(search, 300);
	const { page, pageSize, setPage } = usePagination(PAGE_SIZE);
	const offset = (page - 1) * pageSize;

	const [platforms, setPlatforms] = useState<SupportedPlatform[]>([]);
	const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
	const [publishJobs, setPublishJobs] = useState<PublishJob[]>([]);

	const [selectedVideo, setSelectedVideo] = useState<LibraryVideo | null>(null);
	const [publishDialogOpen, setPublishDialogOpen] = useState(false);

	const [connectChannel, setConnectChannel] = useState<Channel | null>(null);
	const [connectDialogOpen, setConnectDialogOpen] = useState(false);

	const [activeTab, setActiveTab] = useState("library");

	const loadVideos = useCallback(async () => {
		setLoading(true);
		try {
			const result = await api.listAllLibraryVideos({
				search: debouncedSearch || undefined,
				limit: PAGE_SIZE,
				offset,
			});
			setVideos(result.items);
			setTotal(result.total);
		} catch {
			setVideos([]);
			setTotal(0);
		} finally {
			setLoading(false);
		}
	}, [debouncedSearch, offset]);

	const loadAccounts = useCallback(async () => {
		const allAccounts: PlatformAccount[] = [];
		for (const ch of channels) {
			try {
				const chAccounts = await api.getPlatformAccounts(ch.id);
				allAccounts.push(...chAccounts);
			} catch {
				// ignore
			}
		}
		setAccounts(allAccounts);
	}, [channels]);

	const loadPublishJobs = useCallback(async () => {
		const allJobs: PublishJob[] = [];
		for (const ch of channels) {
			try {
				const jobs = await api.listPublishJobs(ch.id, { limit: 20 });
				allJobs.push(...jobs);
			} catch {
				// ignore
			}
		}
		allJobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		setPublishJobs(allJobs.slice(0, 50));
	}, [channels]);

	useEffect(() => {
		api.listChannels().then(setChannels).catch(() => {});
		api.getSupportedPlatforms().then(setPlatforms).catch(() => {});
	}, []);

	useEffect(() => {
		loadVideos();
	}, [loadVideos]);

	useEffect(() => {
		if (channels.length > 0) {
			loadAccounts();
			loadPublishJobs();
		}
	}, [channels, loadAccounts, loadPublishJobs]);

	const handlePublish = (video: LibraryVideo) => {
		setSelectedVideo(video);
		setPublishDialogOpen(true);
	};

	const handleConnectPlatforms = (channel: Channel) => {
		setConnectChannel(channel);
		setConnectDialogOpen(true);
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-bold">Library & Publishing</h1>
					<p className="text-sm text-muted-foreground">
						Browse rendered videos and publish to social platforms
					</p>
				</div>
				{channels.length > 0 && (
					<Select
						value={connectChannel?.id ?? ""}
						onValueChange={(val) => {
							const ch = channels.find((c) => c.id === val);
							if (ch) handleConnectPlatforms(ch);
						}}
					>
						<SelectTrigger className="w-[200px]">
							<Plus className="mr-1 h-3.5 w-3.5" />
							<SelectValue placeholder="Connect Platforms" />
						</SelectTrigger>
						<SelectContent>
							{channels.map((ch) => (
								<SelectItem key={ch.id} value={ch.id}>
									{ch.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</div>

			<Tabs value={activeTab} onValueChange={setActiveTab}>
				<TabsList>
					<TabsTrigger value="library">
						<Film className="mr-1.5 h-3.5 w-3.5" />
						Library
					</TabsTrigger>
					<TabsTrigger value="jobs">
						<Share2 className="mr-1.5 h-3.5 w-3.5" />
						Publish Jobs
						{publishJobs.length > 0 && (
							<Badge variant="secondary" className="ml-1.5 text-[10px]">
								{publishJobs.length}
							</Badge>
						)}
					</TabsTrigger>
				</TabsList>

				{/* Library Tab */}
				<TabsContent value="library" className="space-y-4">
					<div className="flex items-center gap-2">
						<SearchInput
							value={search}
							onChange={setSearch}
							placeholder="Search videos by story title, topic, or channel..."
							className="flex-1"
						/>
					</div>

					{loading ? (
						<div className="flex items-center justify-center py-12">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					) : videos.length === 0 ? (
						<EmptyState
							icon={Film}
							title="No videos yet"
							description="Rendered videos from your pipeline will appear here. Complete a workflow run with video generation enabled to see videos."
						/>
					) : (
						<>
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
								{videos.map((video) => (
									<VideoCard
										key={video.id}
										video={video}
										channels={channels}
										onPublish={handlePublish}
									/>
								))}
							</div>
							{total > PAGE_SIZE && (
								<Pagination
									page={page}
									pageSize={pageSize}
									total={total}
									onPageChange={setPage}
								/>
							)}
						</>
					)}
				</TabsContent>

				{/* Publish Jobs Tab */}
				<TabsContent value="jobs" className="space-y-4">
					{publishJobs.length === 0 ? (
						<EmptyState
							icon={Share2}
							title="No publish jobs yet"
							description="Publish a video from the Library tab to see publish jobs here."
						/>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
							{publishJobs.map((job) => (
								<PublishJobCard key={job.id} job={job} />
							))}
						</div>
					)}
				</TabsContent>
			</Tabs>

			{/* Publish Dialog */}
			<PublishDialog
				video={selectedVideo}
				channels={channels}
				accounts={accounts}
				open={publishDialogOpen}
				onOpenChange={setPublishDialogOpen}
				onPublished={() => {
					loadPublishJobs();
					loadAccounts();
				}}
			/>

			{/* Connect Platforms Dialog */}
			<ConnectPlatformsDialog
				channel={connectChannel}
				platforms={platforms}
				accounts={accounts}
				open={connectDialogOpen}
				onOpenChange={setConnectDialogOpen}
				onAccountsChanged={loadAccounts}
			/>
		</div>
	);
}
