import { useState, useEffect, useCallback, memo } from "react";
import {
	Plus,
	Pencil,
	Trash2,
	Film,
	RefreshCw,
	CheckCircle2,
	Globe,
	Clock,
	Layers,
	Image as ImageIcon,
	Mic,
	Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import {
	api,
	type Channel,
	type CharacterReference,
	type ProviderOptions,
	type VideoTemplateSummary,
} from "@/lib/api";
import { useDebouncedValue, usePagination } from "@/lib/hooks";
import { ChannelEditSheet } from "@/components/ChannelEditSheet";

function avatarUrl(refs: CharacterReference[]): string | null {
	if (refs.length === 0) return null;
	const priority = [
		"front",
		"three-quarter",
		"full-body front",
		"side",
		"expression",
	];
	for (const role of priority) {
		const ref = refs.find((r) => r.role.toLowerCase() === role);
		if (ref) return api.referenceFileUrl(ref.id);
	}
	return api.referenceFileUrl(refs[0]!.id);
}

// === Memoized channel card ===

interface ChannelCardProps {
	ch: Channel;
	info:
		| {
				characters: Array<{ id: string; name: string }>;
				refs: CharacterReference[];
		  }
		| undefined;
	onEdit: (ch: Channel) => void;
	onDelete: (id: string) => void;
}

const ChannelCard = memo(function ChannelCard({
	ch,
	info,
	onEdit,
	onDelete,
}: ChannelCardProps) {
	const avatar = info ? avatarUrl(info.refs) : null;
	const customLlmCount = ch.llmConfig ? Object.keys(ch.llmConfig).length : 0;
	return (
		<Card className="group overflow-hidden transition-all hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5 transition-all duration-200">
			<div className="p-4">
				<div className="flex items-start justify-between">
					<div className="flex items-center gap-3 min-w-0">
						{avatar && info && info.characters.length > 0 ? (
							<img
								src={avatar}
								alt={info.characters[0]!.name}
								className="h-10 w-10 rounded-full object-cover border-2 border-border shrink-0"
								loading="lazy"
							/>
						) : (
							<div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center border-2 border-border shrink-0">
								<Film className="h-4 w-4 text-muted-foreground" />
							</div>
						)}
						<div className="min-w-0">
							<p className="font-semibold truncate">{ch.name}</p>
							<p className="text-xs text-muted-foreground line-clamp-1">
								{ch.niche}
							</p>
						</div>
					</div>
					<div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7"
							onClick={() => onEdit(ch)}
						>
							<Pencil className="h-3.5 w-3.5" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7"
							onClick={() => onDelete(ch.id)}
						>
							<Trash2 className="h-3.5 w-3.5 text-destructive" />
						</Button>
					</div>
				</div>
			</div>
			<CardContent className="space-y-2 pt-0 px-4 pb-4">
				{info && info.characters.length > 0 ? (
					<div className="flex items-center gap-2 rounded-md bg-emerald-600/10 px-2.5 py-1.5">
						<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
						<span className="text-xs font-medium truncate">
							{info.characters.map((c) => c.name).join(", ")}
						</span>
						<Badge className="ml-auto text-[10px] bg-emerald-600/20 text-emerald-400 border-emerald-600/30">
							{info.characters.length} active
						</Badge>
					</div>
				) : (
					<div className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5">
						<span className="text-xs text-muted-foreground">
							No active character
						</span>
					</div>
				)}
				<div className="flex flex-wrap gap-1">
					<Badge variant="outline" className="text-[10px]">
						<Globe className="mr-1 h-2.5 w-2.5" />
						{ch.locale}
					</Badge>
					<Badge variant="outline" className="text-[10px]">
						<Clock className="mr-1 h-2.5 w-2.5" />
						{ch.targetDurationSeconds}s
					</Badge>
					<Badge variant="outline" className="text-[10px]">
						<Layers className="mr-1 h-2.5 w-2.5" />
						{ch.sceneMin}–{ch.sceneMax}
					</Badge>
					<Badge variant="outline" className="text-[10px]">
						{ch.aspectRatio ?? "9:16"}
					</Badge>
				</div>
				<div className="flex flex-wrap gap-1">
					<Badge variant="outline" className="text-[10px]">
						<Settings2 className="mr-1 h-2.5 w-2.5" />
						{customLlmCount > 0 ? `${customLlmCount} custom` : "env default"}
					</Badge>
					<Badge variant="outline" className="text-[10px]">
						<Mic className="mr-1 h-2.5 w-2.5" />
						{ch.ttsProvider}
					</Badge>
					<Badge variant="outline" className="text-[10px]">
						<ImageIcon className="mr-1 h-2.5 w-2.5" />
						{ch.imageProvider}
					</Badge>
					<Badge
						variant={ch.approvalEnabled ? "secondary" : "default"}
						className="text-[10px]"
					>
						{ch.approvalEnabled ? "Approvals on" : "Auto-approve"}
					</Badge>
					{!ch.researchEnabled && (
						<Badge variant="outline" className="text-[10px]">
							No research
						</Badge>
					)}
					{!ch.duplicateAdjudicationEnabled && (
						<Badge variant="outline" className="text-[10px]">
							No adjudication
						</Badge>
					)}
				</div>
			</CardContent>
		</Card>
	);
});

// === Main page ===

export function ChannelsPage() {
	const { page, pageSize, search, setPage, setSearch } = usePagination(24);
	const debouncedSearch = useDebouncedValue(search, 300);
	const [channels, setChannels] = useState<Channel[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [providers, setProviders] = useState<ProviderOptions | null>(null);
	const [videoTemplates, setVideoTemplates] = useState<VideoTemplateSummary[]>(
		[],
	);
	const [activeCharInfo, setActiveCharInfo] = useState<
		Record<
			string,
			{
				characters: Array<{ id: string; name: string }>;
				refs: CharacterReference[];
			}
		>
	>({});

	// Sheet state — only open + which channel; all form state is in ChannelEditSheet
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
	const [sheetKey, setSheetKey] = useState(0);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [result, provs, templates] = await Promise.all([
				api.listChannelsPaginated({
					search: debouncedSearch || undefined,
					limit: pageSize,
					offset: (page - 1) * pageSize,
				}),
				api.getProviders(),
				api.listVideoTemplates(),
			]);
			setChannels(result.items);
			setTotal(result.total);
			setProviders(provs);
			setVideoTemplates(templates);

			const infoMap: Record<
				string,
				{
					characters: Array<{ id: string; name: string }>;
					refs: CharacterReference[];
				}
			> = {};
			await Promise.all(
				result.items.map(async (ch) => {
					if (ch.activeCharacterIds.length === 0) {
						infoMap[ch.id] = { characters: [], refs: [] };
						return;
					}
					try {
						const chars = await api.listCharacters(ch.id);
						const activeChars = chars
							.filter((c) => ch.activeCharacterIds.includes(c.id))
							.map((c) => ({ id: c.id, name: c.name }));
						let refs: CharacterReference[] = [];
						if (activeChars.length > 0) {
							const charData = await api.getCharacter(activeChars[0]!.id);
							const frozen = charData.versions.find(
								(v) => v.status === "frozen",
							);
							if (frozen) {
								const vDetail = await api.getCharacterVersion(frozen.id);
								refs = vDetail.references;
							}
						}
						infoMap[ch.id] = { characters: activeChars, refs };
					} catch {
						infoMap[ch.id] = { characters: [], refs: [] };
					}
				}),
			);
			setActiveCharInfo(infoMap);
		} catch (err) {
			setError(String(err));
		} finally {
			setLoading(false);
		}
	}, [debouncedSearch, page, pageSize]);

	useEffect(() => {
		load();
	}, [load]);

	const handleSearchChange = (value: string) => {
		setSearch(value);
		setPage(1);
	};

	const openCreate = useCallback(() => {
		setEditingChannel(null);
		setSheetKey((k) => k + 1);
		setSheetOpen(true);
	}, []);

	const openEdit = useCallback((channel: Channel) => {
		setEditingChannel(channel);
		setSheetKey((k) => k + 1);
		setSheetOpen(true);
	}, []);

	const handleDelete = useCallback(
		async (id: string) => {
			if (
				!confirm(
					"Delete this channel? All characters, stories, and runs will be deleted.",
				)
			)
				return;
			try {
				await api.deleteChannel(id);
				await load();
			} catch (err) {
				setError(String(err));
			}
		},
		[load],
	);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Channels</h1>
					<p className="text-sm text-muted-foreground">
						Each channel has its own niche, character(s), providers, and style.
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="icon"
						onClick={load}
						disabled={loading}
					>
						<RefreshCw className={loading ? "animate-spin" : ""} />
					</Button>
					<Button onClick={openCreate}>
						<Plus className="mr-1" /> New Channel
					</Button>
				</div>
			</div>

			{error && (
				<div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-foreground">
					{error}
				</div>
			)}

			<SearchInput
				value={search}
				onChange={handleSearchChange}
				placeholder="Search channels by name or niche..."
			/>

			{loading ? (
				<div className="flex items-center justify-center py-20">
					<RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
				</div>
			) : channels.length === 0 ? (
				<EmptyState
					icon={Film}
					title="No channels yet"
					description="Create your first channel to start generating videos."
					action={
						<Button onClick={openCreate}>
							<Plus className="mr-1" /> New Channel
						</Button>
					}
				/>
			) : (
				<>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{channels.map((ch) => (
							<ChannelCard
								key={ch.id}
								ch={ch}
								info={activeCharInfo[ch.id]}
								onEdit={openEdit}
								onDelete={handleDelete}
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

			<ChannelEditSheet
				key={sheetKey}
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				editingChannel={editingChannel}
				providers={providers}
				videoTemplates={videoTemplates}
				onSaved={load}
				activeCharInfo={activeCharInfo}
			/>
		</div>
	);
}
