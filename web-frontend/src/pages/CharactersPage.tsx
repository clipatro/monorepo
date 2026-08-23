/**
 * CharactersPage — Global character management with card grid + right sidebar.
 *
 * Default view: Card grid of ALL characters (not filtered by channel).
 * Each card shows the channels the character is assigned to.
 * Clicking a card opens a right sidebar (Sheet) with character details,
 * channel assignments, version list, reference images, and version management.
 * A "New Character" button opens a Sheet for creating a new global character
 * with optional channel assignment.
 */

import { useState, useEffect, useCallback } from "react";
import {
	Plus,
	Pencil,
	Trash2,
	Users,
	RefreshCw,
	Upload,
	Snowflake,
	CheckCircle2,
	Circle,
	Image as ImageIcon,
	Copy,
	Save,
	AlertTriangle,
	Loader2,
	Film,
	X,
	Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogAction,
	AlertDialogCancel,
} from "@/components/ui/alert-dialog";
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
	type Channel,
	type Character,
	type CharacterVersion,
	type CharacterReference,
	type CharacterWithChannels,
} from "@/lib/api";
import { useDebouncedValue, usePagination } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { BibleEditor, BibleDisplay } from "@/components/BibleEditor";

// === Reference role options ===
const REFERENCE_ROLES = [
	{ value: "front", label: "Front view" },
	{ value: "three-quarter", label: "Three-quarter view" },
	{ value: "side", label: "Side view" },
	{ value: "back", label: "Back view" },
	{ value: "full-body front", label: "Full-body front" },
	{ value: "full-body three-quarter", label: "Full-body three-quarter" },
	{ value: "expressions", label: "Expressions" },
	{ value: "outfit-casual", label: "Outfit: Casual" },
	{ value: "outfit-formal", label: "Outfit: Formal" },
	{ value: "pose-standing", label: "Pose: Standing" },
	{ value: "pose-sitting", label: "Pose: Sitting" },
	{ value: "other", label: "Other" },
];

// === Helper: find the best avatar reference for a version ===
function pickAvatarRef(refs: CharacterReference[]): CharacterReference | null {
	if (refs.length === 0) return null;
	const priority = [
		"front",
		"three-quarter",
		"full-body front",
		"full-body three-quarter",
		"side",
		"expression",
	];
	for (const role of priority) {
		const ref = refs.find((r) => r.role.toLowerCase().startsWith(role));
		if (ref) return ref;
	}
	return refs[0]!;
}

// === Status badge for a version status ===
function VersionStatusBadge({
	status,
	className,
}: {
	status: CharacterVersion["status"];
	className?: string;
}) {
	if (status === "frozen") {
		return (
			<Badge
				className={cn(
					"bg-emerald-600/20 text-emerald-400 border-emerald-600/30",
					className,
				)}
			>
				<Snowflake className="mr-1 h-3 w-3" /> frozen
			</Badge>
		);
	}
	if (status === "draft") {
		return (
			<Badge
				className={cn(
					"bg-blue-600/20 text-blue-400 border-blue-600/30",
					className,
				)}
			>
				<Circle className="mr-1 h-3 w-3" /> draft
			</Badge>
		);
	}
	return (
		<Badge variant="outline" className={cn("text-muted-foreground", className)}>
			archived
		</Badge>
	);
}

// === Avatar component ===
function CharacterAvatar({
	refs,
	size = "md",
	name,
}: {
	refs: CharacterReference[];
	size?: "sm" | "md" | "lg";
	name: string;
}) {
	const avatarRef = pickAvatarRef(refs);
	const sizeClass =
		size === "sm" ? "h-10 w-10" : size === "lg" ? "h-20 w-20" : "h-14 w-14";

	if (avatarRef) {
		return (
			<img
				src={api.referenceFileUrl(avatarRef.id)}
				alt={name}
				className={`${sizeClass} rounded-full object-cover border-2 border-border`}
				loading="lazy"
			/>
		);
	}
	const initials = name
		.split(" ")
		.map((w) => w[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
	return (
		<div
			className={`${sizeClass} rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground border-2 border-border`}
		>
			{initials || "?"}
		</div>
	);
}

// === Card-level metadata fetched per character on the current page ===
interface CardMeta {
	refs: CharacterReference[];
	versionCount: number;
	frozenVersionId: string | null;
}

// === Character Card ===
function CharacterCard({
	character,
	meta,
	activeChannelIds,
	onClick,
}: {
	character: CharacterWithChannels;
	meta: CardMeta | undefined;
	activeChannelIds: string[];
	onClick: () => void;
}) {
	const refs = meta?.refs ?? [];
	const versionCount = meta?.versionCount ?? 0;
	const hasFrozen = !!meta?.frozenVersionId;
	const assignedChannels = character.channels;
	const activeInCount = activeChannelIds.length;

	return (
		<button
			onClick={onClick}
			className="group flex flex-col rounded-xl border bg-card p-4 text-left transition-all hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5 transition-all duration-200"
		>
			{/* Avatar + name + role */}
			<div className="flex items-center gap-3">
				<CharacterAvatar refs={refs} size="md" name={character.name} />
				<div className="flex-1 min-w-0">
					<p className="font-medium truncate">{character.name}</p>
					<p className="text-xs text-muted-foreground truncate">
						{character.role}
					</p>
				</div>
			</div>

			{/* Status badges */}
			<div className="mt-3 flex flex-wrap items-center gap-1.5">
				{hasFrozen ? (
					<Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30">
						<Snowflake className="mr-1 h-3 w-3" /> Frozen
					</Badge>
				) : (
					<Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30">
						<Circle className="mr-1 h-3 w-3" /> Draft
					</Badge>
				)}
				{versionCount > 0 && (
					<Badge variant="outline" className="text-xs">
						v{versionCount}
					</Badge>
				)}
				{character.autoCreated && (
					<Badge className="bg-purple-600/20 text-purple-400 border-purple-600/30 text-xs">
						<Sparkles className="mr-1 h-3 w-3" /> Auto
					</Badge>
				)}
				{refs.length > 0 && (
					<Badge variant="outline" className="text-xs">
						<ImageIcon className="mr-1 h-3 w-3" />
						{refs.length}
					</Badge>
				)}
				{activeInCount > 0 && (
					<Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30 text-xs">
						<CheckCircle2 className="mr-1 h-3 w-3" />
						{activeInCount} active
					</Badge>
				)}
			</div>

			{/* Assigned channels */}
			{assignedChannels.length > 0 ? (
				<div className="mt-3 flex flex-wrap gap-1">
					{assignedChannels.slice(0, 3).map((ch) => {
						const isActive = activeChannelIds.includes(ch.id);
						return (
							<Badge
								key={ch.id}
								variant={isActive ? "default" : "outline"}
								className={cn(
									"text-[10px] truncate max-w-[140px]",
									isActive &&
										"bg-emerald-600/20 text-emerald-400 border-emerald-600/30",
								)}
							>
								{isActive && (
									<CheckCircle2 className="mr-1 h-2.5 w-2.5 shrink-0" />
								)}
								{ch.name}
							</Badge>
						);
					})}
					{assignedChannels.length > 3 && (
						<Badge variant="outline" className="text-[10px]">
							+{assignedChannels.length - 3}
						</Badge>
					)}
				</div>
			) : (
				<div className="mt-3">
					<Badge variant="outline" className="text-[10px] text-muted-foreground">
						<Film className="mr-1 h-2.5 w-2.5" />
						Unassigned
					</Badge>
				</div>
			)}
		</button>
	);
}

export function CharactersPage() {
	// === Channels (full objects, for assignment + active version cross-ref) ===
	const [channels, setChannels] = useState<Channel[]>([]);

	// === Paginated global character list ===
	const { page, pageSize, search, setPage, setSearch } = usePagination(20);
	const debouncedSearch = useDebouncedValue(search, 300);
	const [characters, setCharacters] = useState<CharacterWithChannels[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Per-card metadata (avatar refs, version count, frozen version id)
	const [cardMeta, setCardMeta] = useState<Record<string, CardMeta>>({});

	// === Create / Edit character sheet ===
	const [createSheetOpen, setCreateSheetOpen] = useState(false);
	const [editingChar, setEditingChar] = useState<Character | null>(null);
	const [charForm, setCharForm] = useState({ name: "", role: "" });
	const [charFormChannels, setCharFormChannels] = useState<string[]>([]);

	// === Detail sidebar ===
	const [detailOpen, setDetailOpen] = useState(false);
	const [detailChar, setDetailChar] = useState<CharacterWithChannels | null>(
		null,
	);
	const [versions, setVersions] = useState<CharacterVersion[]>([]);
	const [versionRefs, setVersionRefs] = useState<
		Record<string, CharacterReference[]>
	>({});
	const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
		null,
	);
	const [detailLoading, setDetailLoading] = useState(false);
	const [assignChannelId, setAssignChannelId] = useState<string>("");

	// Version form (create new version)
	const [bibleText, setBibleText] = useState("{}");
	const [bibleError, setBibleError] = useState<string | null>(null);

	// Edit bible dialog
	const [editBibleOpen, setEditBibleOpen] = useState(false);
	const [editBibleText, setEditBibleText] = useState("");
	const [editBibleError, setEditBibleError] = useState<string | null>(null);

	// Reference upload
	const [refRole, setRefRole] = useState("front");

	// Image preview dialog
	const [previewRef, setPreviewRef] = useState<CharacterReference | null>(null);

	// Delete confirm dialogs
	const [deleteCharId, setDeleteCharId] = useState<string | null>(null);
	const [deleteVersionId, setDeleteVersionId] = useState<string | null>(null);
	const [deleteRefId, setDeleteRefId] = useState<string | null>(null);

	// === Load all channels (full objects with activeCharacterVersionId) ===
	const loadChannels = useCallback(async () => {
		try {
			const chs = await api.listChannels();
			setChannels(chs);
		} catch (err) {
			setError(String(err));
		}
	}, []);

	useEffect(() => {
		loadChannels();
	}, [loadChannels]);

	// === Load paginated characters globally ===
	const loadCharacters = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await api.listAllCharacters({
				search: debouncedSearch || undefined,
				limit: pageSize,
				offset: (page - 1) * pageSize,
			});
			setCharacters(result.characters);
			setTotal(result.total);

			// Fetch per-card metadata (versions + avatar refs) in parallel
			const newMeta: Record<string, CardMeta> = {};
			await Promise.all(
				result.characters.map(async (char) => {
					try {
						const data = await api.getCharacter(char.id);
						const frozen =
							data.versions.find((v) => v.status === "frozen") ??
							data.versions[0];
						let refs: CharacterReference[] = [];
						if (frozen) {
							const vDetail = await api.getCharacterVersion(frozen.id);
							refs = vDetail.references;
						}
						newMeta[char.id] = {
							refs,
							versionCount: data.versions.length,
							frozenVersionId: frozen?.id ?? null,
						};
					} catch {
						newMeta[char.id] = {
							refs: [],
							versionCount: 0,
							frozenVersionId: null,
						};
					}
				}),
			);
			setCardMeta(newMeta);
		} catch (err) {
			setError(String(err));
			setCharacters([]);
			setTotal(0);
		} finally {
			setLoading(false);
		}
	}, [debouncedSearch, page, pageSize]);

	useEffect(() => {
		loadCharacters();
	}, [loadCharacters]);

	// Reset to page 1 when debounced search changes
	useEffect(() => {
		if (debouncedSearch !== search) setPage(1);
	}, [debouncedSearch, search, setPage]);

	const handleSearchChange = (value: string) => {
		setSearch(value);
		setPage(1);
	};

	// === Helper: which channel IDs is this character active in? ===
	function getActiveChannelIds(char: CharacterWithChannels): string[] {
		return char.channels
			.filter((ch) => {
				const fullChannel = channels.find((c) => c.id === ch.id);
				return fullChannel?.activeCharacterIds.includes(char.id);
			})
			.map((ch) => ch.id);
	}

	// === Character CRUD ===

	function openCreateChar() {
		setEditingChar(null);
		setCharForm({ name: "", role: "" });
		setCharFormChannels([]);
		setCreateSheetOpen(true);
	}

	function openEditChar(char: Character) {
		setEditingChar(char);
		setCharForm({ name: char.name, role: char.role });
		setCharFormChannels([]);
		setCreateSheetOpen(true);
	}

	async function handleCharSubmit(e: React.FormEvent) {
		e.preventDefault();
		try {
			if (editingChar) {
				await api.updateCharacter(editingChar.id, charForm);
			} else {
				await api.createGlobalCharacter({
					name: charForm.name,
					role: charForm.role,
					channelIds: charFormChannels,
				});
			}
			setCreateSheetOpen(false);
			await loadCharacters();
		} catch (err) {
			setError(String(err));
		}
	}

	async function confirmDeleteChar() {
		if (!deleteCharId) return;
		try {
			await api.deleteCharacter(deleteCharId);
			setDetailOpen(false);
			setDetailChar(null);
			await loadCharacters();
		} catch (err) {
			setError(String(err));
		} finally {
			setDeleteCharId(null);
		}
	}

	// === Detail sidebar ===

	async function openDetail(char: CharacterWithChannels) {
		setDetailChar(char);
		setDetailOpen(true);
		setDetailLoading(true);
		setAssignChannelId("");
		try {
			const data = await api.getCharacter(char.id);
			setVersions(data.versions);
			if (data.versions.length > 0) {
				setSelectedVersionId(data.versions[0]!.id);
			} else {
				setSelectedVersionId(null);
			}
			const newVersionRefs: Record<string, CharacterReference[]> = {};
			await Promise.all(
				data.versions.map(async (v) => {
					try {
						const vDetail = await api.getCharacterVersion(v.id);
						newVersionRefs[v.id] = vDetail.references;
					} catch {
						newVersionRefs[v.id] = [];
					}
				}),
			);
			setVersionRefs(newVersionRefs);
		} catch (err) {
			setError(String(err));
		} finally {
			setDetailLoading(false);
		}
	}

	async function refreshVersions() {
		if (!detailChar) return;
		const data = await api.getCharacter(detailChar.id);
		setVersions(data.versions);
		const newVersionRefs: Record<string, CharacterReference[]> = {};
		await Promise.all(
			data.versions.map(async (v) => {
				try {
					const vDetail = await api.getCharacterVersion(v.id);
					newVersionRefs[v.id] = vDetail.references;
				} catch {
					newVersionRefs[v.id] = [];
				}
			}),
		);
		setVersionRefs(newVersionRefs);
	}

	async function handleCreateVersion() {
		if (!detailChar) return;
		try {
			const bible = JSON.parse(bibleText);
			const version = await api.createVersion(detailChar.id, bible);
			setBibleText("{}");
			setBibleError(null);
			await refreshVersions();
			setSelectedVersionId(version.id);
			await loadCharacters();
		} catch (err) {
			setBibleError(err instanceof Error ? err.message : String(err));
		}
	}

	async function handleFreezeVersion(versionId: string) {
		try {
			await api.freezeVersion(versionId);
			await refreshVersions();
			await loadCharacters();
		} catch (err) {
			setError(String(err));
		}
	}

	async function confirmDeleteVersion() {
		if (!deleteVersionId) return;
		try {
			await api.deleteVersion(deleteVersionId);
			if (selectedVersionId === deleteVersionId) {
				const remaining = versions.filter((v) => v.id !== deleteVersionId);
				setSelectedVersionId(remaining[0]?.id ?? null);
			}
			await refreshVersions();
			await loadCharacters();
		} catch (err) {
			setError(String(err));
		} finally {
			setDeleteVersionId(null);
		}
	}

	function openEditBible(version: CharacterVersion) {
		setEditBibleText(JSON.stringify(version.bible, null, 2));
		setEditBibleError(null);
		setEditBibleOpen(true);
	}

	async function handleSaveBible() {
		if (!selectedVersionId) return;
		try {
			const bible = JSON.parse(editBibleText);
			await api.updateVersion(selectedVersionId, bible);
			setEditBibleOpen(false);
			setEditBibleError(null);
			await refreshVersions();
			await loadCharacters();
		} catch (err) {
			setEditBibleError(err instanceof Error ? err.message : String(err));
		}
	}

	async function handleDuplicateVersion(version: CharacterVersion) {
		if (!detailChar) return;
		try {
			const newVersion = await api.createVersion(detailChar.id, version.bible);
			await refreshVersions();
			setSelectedVersionId(newVersion.id);
			await loadCharacters();
		} catch (err) {
			setError(String(err));
		}
	}

	// === Channel assignment ===

	async function handleAssignToChannel() {
		if (!detailChar || !assignChannelId) return;
		try {
			await api.addCharacterToChannel(assignChannelId, detailChar.id);
			setAssignChannelId("");
			// Refresh the character's channel list
			const updatedChannels = await api.getCharacterChannels(detailChar.id);
			setDetailChar({ ...detailChar, channels: updatedChannels });
			await loadCharacters();
		} catch (err) {
			setError(String(err));
		}
	}

	async function handleRemoveFromChannel(channelId: string) {
		if (!detailChar) return;
		try {
			await api.removeCharacterFromChannel(channelId, detailChar.id);
			const updatedChannels = await api.getCharacterChannels(detailChar.id);
			setDetailChar({ ...detailChar, channels: updatedChannels });
			await loadChannels();
			await loadCharacters();
		} catch (err) {
			setError(String(err));
		}
	}

	// === Active character (per-channel, multi-active) ===

	async function handleSetActive(channelId: string) {
		if (!detailChar) return;
		try {
			await api.toggleChannelCharacter(channelId, detailChar.id, true);
			await loadChannels();
			await loadCharacters();
		} catch (err) {
			setError(String(err));
		}
	}

	async function handleClearActive(channelId: string) {
		if (!detailChar) return;
		try {
			await api.toggleChannelCharacter(channelId, detailChar.id, false);
			await loadChannels();
			await loadCharacters();
		} catch (err) {
			setError(String(err));
		}
	}

	// === References ===

	async function handleUploadRef(e: React.FormEvent) {
		e.preventDefault();
		if (!selectedVersionId) return;
		const fileInput = e.currentTarget.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		const file = fileInput?.files?.[0];
		if (!file) return;
		try {
			await api.uploadReference(selectedVersionId, file, refRole);
			fileInput.value = "";
			const vDetail = await api.getCharacterVersion(selectedVersionId);
			setVersionRefs((prev) => ({
				...prev,
				[selectedVersionId]: vDetail.references,
			}));
			await loadCharacters();
		} catch (err) {
			setError(String(err));
		}
	}

	async function confirmDeleteRef() {
		if (!deleteRefId) return;
		try {
			await api.deleteReference(deleteRefId);
			if (selectedVersionId) {
				const vDetail = await api.getCharacterVersion(selectedVersionId);
				setVersionRefs((prev) => ({
					...prev,
					[selectedVersionId]: vDetail.references,
				}));
			}
			await loadCharacters();
		} catch (err) {
			setError(String(err));
		} finally {
			setDeleteRefId(null);
		}
	}

	const selectedVersion =
		versions.find((v) => v.id === selectedVersionId) ?? null;

	// Channels not yet assigned to the detail character (for the assign dropdown)
	const unassignedChannels = detailChar
		? channels.filter(
				(ch) => !detailChar.channels.some((dc) => dc.id === ch.id),
			)
		: [];

	// === Render ===

	return (
		<div className="space-y-6">
			{/* Page header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Characters</h1>
					<p className="text-sm text-muted-foreground">
						Create characters, upload reference images, freeze versions, and
						assign them to channels. Characters can be shared across channels.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="icon"
						onClick={() => {
							loadChannels();
							loadCharacters();
						}}
						title="Refresh"
					>
						<RefreshCw />
					</Button>
					<Button onClick={openCreateChar}>
						<Plus className="mr-1 h-4 w-4" /> New Character
					</Button>
				</div>
			</div>

			{error && (
				<Card className="border-destructive">
					<CardContent className="pt-6 text-sm text-destructive-foreground">
						{error}
					</CardContent>
				</Card>
			)}

			{/* Search + count */}
			<div className="flex items-center gap-3">
				<SearchInput
					value={search}
					onChange={handleSearchChange}
					placeholder="Search characters by name or role..."
					className="flex-1"
				/>
				<Badge variant="secondary" className="shrink-0">
					{total} {total === 1 ? "character" : "characters"}
				</Badge>
			</div>

			{/* Card grid */}
			{loading ? (
				<div className="flex items-center justify-center py-20">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
				</div>
			) : characters.length === 0 ? (
				<EmptyState
					icon={Users}
					title="No characters found"
					description={
						search
							? "Try a different search term."
							: "Create a character, upload reference images, freeze a version, and assign it to channels."
					}
					action={
						!search && (
							<Button onClick={openCreateChar}>
								<Plus className="mr-1 h-4 w-4" /> Create Character
							</Button>
						)
					}
				/>
			) : (
				<>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{characters.map((char) => {
							const meta = cardMeta[char.id];
							const activeChannelIds = getActiveChannelIds(char);
							return (
								<CharacterCard
									key={char.id}
									character={char}
									meta={meta}
									activeChannelIds={activeChannelIds}
									onClick={() => openDetail(char)}
								/>
							);
						})}
					</div>
					<Pagination
						page={page}
						pageSize={pageSize}
						total={total}
						onPageChange={setPage}
					/>
				</>
			)}

			{/* === Create / Edit Character Sheet === */}
			<Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
				<SheetContent width="max-w-md">
					<SheetHeader>
						<SheetTitle>
							{editingChar ? "Edit Character" : "Create Character"}
						</SheetTitle>
						<SheetDescription>
							{editingChar
								? "Update character details."
								: "Create a new character. You can assign it to channels now or later."}
						</SheetDescription>
					</SheetHeader>
					<form onSubmit={handleCharSubmit} className="flex-1 flex flex-col">
						<SheetBody className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="charName">Name</Label>
								<Input
									id="charName"
									value={charForm.name}
									onChange={(e) =>
										setCharForm({ ...charForm, name: e.target.value })
									}
									placeholder="NoahVale"
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="charRole">Role</Label>
								<Input
									id="charRole"
									value={charForm.role}
									onChange={(e) =>
										setCharForm({ ...charForm, role: e.target.value })
									}
									placeholder="Protagonist / Host"
									required
								/>
							</div>

							{/* Channel assignment (only for new characters) */}
							{!editingChar && channels.length > 0 && (
								<div className="space-y-2">
									<Label>Assign to Channels</Label>
									<p className="text-xs text-muted-foreground">
										Optional — select channels to assign this character to. You
										can change this later.
									</p>
									<div className="space-y-1.5 max-h-48 overflow-y-auto rounded-md border p-2">
										{channels.map((ch) => {
											const checked = charFormChannels.includes(ch.id);
											return (
												<label
													key={ch.id}
													className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
												>
													<input
														type="checkbox"
														checked={checked}
														onChange={(e) => {
															if (e.target.checked) {
																setCharFormChannels([
																	...charFormChannels,
																	ch.id,
																]);
															} else {
																setCharFormChannels(
																	charFormChannels.filter(
																		(id) => id !== ch.id,
																	),
																);
															}
														}}
														className="h-4 w-4 rounded border-border"
													/>
													<span className="truncate">{ch.name}</span>
												</label>
											);
										})}
									</div>
								</div>
							)}
						</SheetBody>
						<SheetFooter>
							<Button type="submit">{editingChar ? "Save" : "Create"}</Button>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>

			{/* === Character Detail Sidebar === */}
			<Sheet
				open={detailOpen}
				onOpenChange={(open) => {
					setDetailOpen(open);
					if (!open) {
						setDetailChar(null);
						setVersions([]);
						setVersionRefs({});
						setSelectedVersionId(null);
						setBibleText("{}");
						setBibleError(null);
						setAssignChannelId("");
					}
				}}
			>
				<SheetContent width="max-w-2xl">
					{detailChar && (
						<>
							<SheetHeader>
								<div className="flex items-center gap-4 pr-12">
									<CharacterAvatar
										refs={
											selectedVersionId
												? (versionRefs[selectedVersionId] ?? [])
												: []
										}
										size="lg"
										name={detailChar.name}
									/>
									<div className="flex-1 min-w-0">
										<SheetTitle className="text-xl truncate">
											{detailChar.name}
										</SheetTitle>
										<SheetDescription>
											{detailChar.role} — Character management
										</SheetDescription>
									</div>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => setDeleteCharId(detailChar.id)}
										title="Delete character"
										className="shrink-0"
									>
										<Trash2 className="h-4 w-4 text-destructive" />
									</Button>
								</div>
							</SheetHeader>

							<SheetBody className="space-y-5">
								{detailLoading ? (
									<div className="flex items-center justify-center py-12">
										<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
									</div>
								) : (
									<>
										{/* Character details */}
										<div className="grid grid-cols-2 gap-3">
											<div className="rounded-lg border bg-card p-3">
												<p className="text-xs text-muted-foreground">Name</p>
												<p className="text-sm font-medium truncate">
													{detailChar.name}
												</p>
											</div>
											<div className="rounded-lg border bg-card p-3">
												<p className="text-xs text-muted-foreground">Role</p>
												<p className="text-sm font-medium truncate">
													{detailChar.role}
												</p>
												{detailChar.autoCreated && (
													<Badge className="mt-1 bg-purple-600/20 text-purple-400 border-purple-600/30 text-[10px]">
														<Sparkles className="mr-1 h-2.5 w-2.5" /> Auto-created
													</Badge>
												)}
											</div>
											<div className="rounded-lg border bg-card p-3">
												<p className="text-xs text-muted-foreground">
													Versions
												</p>
												<p className="text-sm font-medium">{versions.length}</p>
											</div>
											<div className="rounded-lg border bg-card p-3">
												<p className="text-xs text-muted-foreground">
													Channels
												</p>
												<p className="text-sm font-medium">
													{detailChar.channels.length}
												</p>
											</div>
										</div>

										{/* Edit character button */}
										<Button
											variant="outline"
											size="sm"
											className="w-full"
											onClick={() => openEditChar(detailChar)}
										>
											<Pencil className="mr-1 h-3 w-3" /> Edit Character Details
										</Button>

										<Separator />

										{/* Channel assignments */}
										<div className="space-y-3">
											<div className="flex items-center justify-between">
												<h3 className="text-sm font-semibold">
													Channel Assignments
												</h3>
												<Badge variant="secondary">
													{detailChar.channels.length}
												</Badge>
											</div>

											{detailChar.channels.length > 0 ? (
												<div className="space-y-1.5">
													{detailChar.channels.map((ch) => {
														const fullChannel = channels.find(
															(c) => c.id === ch.id,
														);
														const isActive = fullChannel?.activeCharacterIds.includes(
															detailChar.id,
														);
														const hasFrozen =
															!!cardMeta[detailChar.id]?.frozenVersionId;
														return (
															<div
																key={ch.id}
																className="flex items-center gap-2 rounded-md border bg-card px-3 py-2"
															>
																<div className="flex-1 min-w-0">
																	<p className="text-sm font-medium truncate">
																		{ch.name}
																	</p>
																	<p className="text-xs text-muted-foreground line-clamp-1">
																		{ch.niche}
																	</p>
																</div>
																{isActive ? (
																	<Button
																		variant="outline"
																		size="sm"
																		className="h-7 text-xs shrink-0"
																		onClick={() => handleClearActive(ch.id)}
																		title="Deactivate for this channel"
																	>
																		<CheckCircle2 className="mr-1 h-3 w-3 text-emerald-500" />
																		Active
																	</Button>
																) : hasFrozen ? (
																	<Button
																		variant="outline"
																		size="sm"
																		className="h-7 text-xs shrink-0"
																		onClick={() => handleSetActive(ch.id)}
																		title="Set as active for this channel"
																	>
																		<Circle className="mr-1 h-3 w-3" />
																		Set active
																	</Button>
																) : (
																	<Badge
																		variant="outline"
																		className="text-xs text-muted-foreground shrink-0"
																	>
																		No frozen version
																	</Badge>
																)}
																<Button
																	variant="ghost"
																	size="icon"
																	className="h-7 w-7 shrink-0"
																	onClick={() => handleRemoveFromChannel(ch.id)}
																	title="Remove from channel"
																>
																	<X className="h-3.5 w-3.5 text-muted-foreground" />
																</Button>
															</div>
														);
													})}
												</div>
											) : (
												<p className="text-xs text-muted-foreground rounded-md border border-dashed p-3 text-center">
													This character is not assigned to any channel yet.
												</p>
											)}

											{/* Assign to channel */}
											{unassignedChannels.length > 0 && (
												<div className="flex items-end gap-2">
													<div className="flex-1">
														<Label className="text-xs">Add to channel</Label>
														<Select
															value={assignChannelId}
															onValueChange={setAssignChannelId}
														>
															<SelectTrigger className="h-8 text-xs">
																<SelectValue placeholder="Select a channel..." />
															</SelectTrigger>
															<SelectContent>
																{unassignedChannels.map((ch) => (
																	<SelectItem key={ch.id} value={ch.id}>
																		{ch.name}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													</div>
													<Button
														size="sm"
														onClick={handleAssignToChannel}
														disabled={!assignChannelId}
													>
														<Plus className="mr-1 h-3 w-3" /> Add
													</Button>
												</div>
											)}
										</div>

										<Separator />

										{/* Versions */}
										<div className="space-y-3">
											<div className="flex items-center justify-between">
												<h3 className="text-sm font-semibold">Versions</h3>
												<Badge variant="secondary">
													{versions.length} total
												</Badge>
											</div>

											{versions.length > 0 && (
												<div className="flex flex-wrap gap-2">
													{versions.map((v) => {
														return (
															<button
																key={v.id}
																onClick={() => setSelectedVersionId(v.id)}
																className={cn(
																	"rounded-md border px-3 py-1.5 text-sm transition-colors",
																	selectedVersionId === v.id
																		? "border-primary bg-secondary"
																		: "hover:bg-accent",
																)}
															>
																v{v.version}{" "}
																<VersionStatusBadge
																	status={v.status}
																	className="ml-1"
																/>
															</button>
														);
													})}
												</div>
											)}

											{selectedVersion && (
												<div className="rounded-lg border bg-card p-4 space-y-4">
													{/* Version header + actions */}
													<div className="flex items-center justify-between flex-wrap gap-2">
														<span className="text-sm font-medium">
															Version {selectedVersion.version}
															<span className="ml-2 text-xs text-muted-foreground">
																{new Date(
																	selectedVersion.createdAt,
																).toLocaleDateString()}
															</span>
														</span>
														<div className="flex gap-2 flex-wrap">
															{/* Edit bible — only for draft versions */}
															{selectedVersion.status === "draft" && (
																<Button
																	size="sm"
																	variant="outline"
																	onClick={() => openEditBible(selectedVersion)}
																>
																	<Pencil className="mr-1 h-3 w-3" /> Edit Bible
																</Button>
															)}
															{/* Duplicate version */}
															<Button
																size="sm"
																variant="ghost"
																onClick={() =>
																	handleDuplicateVersion(selectedVersion)
																}
																title="Duplicate as new draft"
															>
																<Copy className="mr-1 h-3 w-3" /> Duplicate
															</Button>
															{/* Freeze — only for draft versions */}
															{selectedVersion.status === "draft" && (
																<Button
																	size="sm"
																	variant="outline"
																	onClick={() =>
																		handleFreezeVersion(selectedVersion.id)
																	}
																>
																	<Snowflake className="mr-1 h-3 w-3" /> Freeze
																</Button>
															)}
															{/* Delete version */}
															<Button
																size="sm"
																variant="ghost"
																onClick={() =>
																	setDeleteVersionId(selectedVersion.id)
																}
																title="Delete this version"
																className="text-destructive hover:bg-destructive/10"
															>
																<Trash2 className="mr-1 h-3 w-3" /> Delete
															</Button>
														</div>
													</div>

													{/* Bible */}
													<div>
														<Label className="text-xs text-muted-foreground">
															Character Bible
														</Label>
														<BibleDisplay bible={selectedVersion.bible} />
													</div>

													{/* References */}
													<div className="space-y-2">
														<div className="flex items-center justify-between">
															<h4 className="text-sm font-semibold">
																Reference Images
															</h4>
															<Badge variant="outline">
																{(versionRefs[selectedVersion.id] ?? []).length}
															</Badge>
														</div>

														{selectedVersion.status === "draft" && (
															<form
																onSubmit={handleUploadRef}
																className="flex items-end gap-2 rounded-md border p-3"
															>
																<div className="flex-1">
																	<Label htmlFor="refFile" className="text-xs">
																		Image file
																	</Label>
																	<Input
																		id="refFile"
																		type="file"
																		accept="image/*"
																		required
																	/>
																</div>
																<div className="w-36">
																	<Label htmlFor="refRole" className="text-xs">
																		Role
																	</Label>
																	<Select
																		value={refRole}
																		onValueChange={setRefRole}
																	>
																		<SelectTrigger id="refRole">
																			<SelectValue placeholder="Select role" />
																		</SelectTrigger>
																		<SelectContent>
																			{REFERENCE_ROLES.map((r) => (
																				<SelectItem
																					key={r.value}
																					value={r.value}
																				>
																					{r.label}
																				</SelectItem>
																			))}
																		</SelectContent>
																	</Select>
																</div>
																<Button type="submit" size="sm">
																	<Upload className="mr-1 h-3 w-3" /> Upload
																</Button>
															</form>
														)}

														{(versionRefs[selectedVersion.id] ?? []).length >
														0 ? (
															<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
																{(versionRefs[selectedVersion.id] ?? []).map(
																	(ref) => (
																		<div
																			key={ref.id}
																			className="rounded-md border overflow-hidden group relative"
																		>
																			<div
																				className="aspect-square bg-muted cursor-pointer"
																				onClick={() => setPreviewRef(ref)}
																			>
																				<img
																					src={api.referenceFileUrl(ref.id)}
																					alt={ref.role}
																					className="h-full w-full object-cover"
																					loading="lazy"
																				/>
																			</div>
																			<div className="p-2 flex items-center justify-between">
																				<Badge
																					variant="secondary"
																					className="text-xs"
																				>
																					{ref.role}
																				</Badge>
																				{selectedVersion.status === "draft" && (
																					<Button
																						variant="ghost"
																						size="icon"
																						className="h-6 w-6"
																						onClick={() =>
																							setDeleteRefId(ref.id)
																						}
																					>
																						<Trash2 className="h-3 w-3 text-destructive" />
																					</Button>
																				)}
																			</div>
																		</div>
																	),
																)}
															</div>
														) : (
															<div className="flex flex-col items-center justify-center py-8 text-center rounded-md border border-dashed">
																<ImageIcon className="mb-2 h-8 w-8 text-muted-foreground" />
																<p className="text-xs text-muted-foreground">
																	{selectedVersion.status === "draft"
																		? "No reference images yet. Upload front, three-quarter, and side views."
																		: "No reference images in this version."}
																</p>
															</div>
														)}
													</div>
												</div>
											)}

											<Separator />

											{/* Create new version */}
											<div className="space-y-2">
												<h4 className="text-sm font-semibold">
													Create New Version
												</h4>
												<Label htmlFor="bible" className="text-xs">
													Character Bible — immutable identity attributes
												</Label>
												<BibleEditor
													value={bibleText}
													onChange={(json) => {
														setBibleText(json);
														setBibleError(null);
													}}
													compact
												/>
												{bibleError && (
													<p className="text-xs text-destructive">
														{bibleError}
													</p>
												)}
												<Button size="sm" onClick={handleCreateVersion}>
													<Plus className="mr-1 h-3 w-3" /> Create Version
												</Button>
											</div>
										</div>
									</>
								)}
							</SheetBody>
						</>
					)}
				</SheetContent>
			</Sheet>

			{/* === Edit Bible Dialog === */}
			<Dialog open={editBibleOpen} onOpenChange={setEditBibleOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Character Bible</DialogTitle>
						<DialogDescription>
							Update the bible for this draft version. Once frozen, the bible is
							immutable.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<BibleEditor
							value={editBibleText}
							onChange={(json) => {
								setEditBibleText(json);
								setEditBibleError(null);
							}}
						/>
						{editBibleError && (
							<p className="text-xs text-destructive">{editBibleError}</p>
						)}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setEditBibleOpen(false)}>
							Cancel
						</Button>
						<Button onClick={handleSaveBible}>
							<Save className="mr-1 h-4 w-4" /> Save Bible
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* === Image Preview Dialog === */}
			<Dialog
				open={!!previewRef}
				onOpenChange={(open) => {
					if (!open) setPreviewRef(null);
				}}
			>
				<DialogContent className="max-w-4xl">
					{previewRef && (
						<>
							<DialogHeader>
								<DialogTitle>{previewRef.role}</DialogTitle>
								<DialogDescription>
									{previewRef.mimeType} — {previewRef.width}x{previewRef.height}
								</DialogDescription>
							</DialogHeader>
							<div className="flex items-center justify-center rounded-md overflow-hidden bg-muted">
								<img
									src={api.referenceFileUrl(previewRef.id)}
									alt={previewRef.role}
									className="max-h-[60vh] w-auto object-contain"
								/>
							</div>
						</>
					)}
				</DialogContent>
			</Dialog>

			{/* === Delete Character Confirm === */}
			<AlertDialog
				open={!!deleteCharId}
				onOpenChange={(open) => {
					if (!open) setDeleteCharId(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5 text-destructive" />
							Delete Character
						</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete the character and all its versions
							and reference images. The character will be removed from all
							assigned channels. This cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={confirmDeleteChar}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* === Delete Version Confirm === */}
			<AlertDialog
				open={!!deleteVersionId}
				onOpenChange={(open) => {
					if (!open) setDeleteVersionId(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5 text-destructive" />
							Delete Version
						</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete this version and all its reference
							images. If this version is active for any channel, clear it from
							those channels first.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={confirmDeleteVersion}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* === Delete Reference Confirm === */}
			<AlertDialog
				open={!!deleteRefId}
				onOpenChange={(open) => {
					if (!open) setDeleteRefId(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5 text-destructive" />
							Delete Reference Image
						</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete this reference image from the
							version.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={confirmDeleteRef}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
