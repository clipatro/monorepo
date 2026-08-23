import { useState, useEffect } from "react";
import { Play, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { usePipelineStore } from "@/stores/pipeline-store";
import {
	api,
	type CharacterRosterEntry,
	type ContentType,
	CONTENT_TYPE_LABELS,
} from "@/lib/api";

interface CreateRunDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function CreateRunDialog({ open, onOpenChange }: CreateRunDialogProps) {
	const channels = usePipelineStore((s) => s.channels);
	const channelFilter = usePipelineStore((s) => s.channelFilter);
	const createRun = usePipelineStore((s) => s.createRun);

	const [channelId, setChannelId] = useState(channelFilter);
	const [topic, setTopic] = useState("");
	const [storyline, setStoryline] = useState("");
	const [contentType, setContentType] = useState<string>("");
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [roster, setRoster] = useState<CharacterRosterEntry[]>([]);

	// Sync channel filter → dialog
	useEffect(() => {
		if (open) {
			setChannelId(channelFilter || channels[0]?.id || "");
		}
	}, [open, channelFilter, channels]);

	// Fetch character roster when channel changes
	useEffect(() => {
		if (!channelId) {
			setRoster([]);
			return;
		}
		let cancelled = false;
		api
			.getChannelCharacterRoster(channelId)
			.then((r) => {
				if (!cancelled) setRoster(r);
			})
			.catch(() => {
				if (!cancelled) setRoster([]);
			});
		return () => {
			cancelled = true;
		};
	}, [channelId]);

	// Detect mentioned character names in topic/storyline
	const mentionedNames = roster.filter((entry) => {
		const text = `${topic} ${storyline}`.toLowerCase();
		return text.includes(entry.name.toLowerCase());
	});

	const handleCreate = async () => {
		if (!channelId || !topic.trim()) return;
		setCreating(true);
		setError(null);
		try {
			await createRun({
				channelId,
				topic: topic.trim(),
				...(storyline.trim() ? { storyline: storyline.trim() } : {}),
				...(contentType
					? {
							contentType: contentType as
								| "fictional_story"
								| "psychology_concept_story"
								| "true_case",
						}
					: {}),
			});
			onOpenChange(false);
			setTopic("");
			setStoryline("");
			setContentType("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create run");
		} finally {
			setCreating(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Create New Pipeline Run</DialogTitle>
					<DialogDescription>
						Start a new content generation pipeline. The workflow will run
						through all steps automatically, pausing at approval checkpoints.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div>
						<Label htmlFor="channel">Channel</Label>
						<select
							id="channel"
							value={channelId}
							onChange={(e) => setChannelId(e.target.value)}
							className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
						>
							<option value="">Select a channel...</option>
							{channels.map((ch) => (
								<option key={ch.id} value={ch.id}>
									{ch.name}
								</option>
							))}
						</select>
					</div>

					{/* Character roster context */}
					{roster.length > 0 && (
						<div className="rounded-md border bg-muted/30 px-3 py-2">
							<div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
								<Users className="h-3 w-3" />
								Character Roster ({roster.length})
							</div>
							<div className="mt-1.5 flex flex-wrap gap-1">
								{roster.map((entry) => {
									const isMentioned = mentionedNames.some(
										(m) => m.characterId === entry.characterId,
									);
									return (
										<span
											key={entry.characterId}
											className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
												isMentioned
													? "bg-green-600/20 text-green-400 ring-1 ring-green-600/40"
													: "bg-muted text-muted-foreground"
											}`}
										>
											{entry.name}
											{entry.autoCreated && (
												<span className="ml-1 text-[10px] opacity-60">
													auto
												</span>
											)}
											{!entry.hasReferenceImages && (
												<span className="ml-1 text-[10px] opacity-60">
													no refs
												</span>
											)}
										</span>
									);
								})}
							</div>
							{mentionedNames.length > 0 && (
								<p className="mt-1.5 text-xs text-green-400">
									{mentionedNames.length} character
									{mentionedNames.length > 1 ? "s" : ""} detected in your
									topic/storyline
								</p>
							)}
						</div>
					)}

					<div>
						<Label htmlFor="topic">Topic</Label>
						<Textarea
							id="topic"
							value={topic}
							onChange={(e) => setTopic(e.target.value)}
							placeholder="e.g. The psychology behind procrastination and how to overcome it"
							className="mt-1"
							rows={3}
						/>
					</div>
					<div>
						<Label htmlFor="storyline">Storyline (optional)</Label>
						<Textarea
							id="storyline"
							value={storyline}
							onChange={(e) => setStoryline(e.target.value)}
							placeholder="e.g. Emily gets caught by her father George with her boyfriend Noah. The confrontation reveals deeper family tensions."
							className="mt-1"
							rows={3}
						/>
						<p className="mt-1 text-xs text-muted-foreground">
							If provided, the story will be built around this storyline.
							Character names are matched against the channel roster.
						</p>
					</div>
					<div>
						<Label htmlFor="contentType">Content Type (optional)</Label>
						<select
							id="contentType"
							value={contentType}
							onChange={(e) => setContentType(e.target.value)}
							className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
						>
							<option value="">Auto-classify (concept director decides)</option>
							{(() => {
								const selectedChannel = channels.find(
									(ch) => ch.id === channelId,
								);
								const enabledTypes = selectedChannel?.contentTypes ?? [
									"fictional_story",
									"psychology_concept_story",
									"true_case",
								];
								return enabledTypes.map((type) => (
									<option key={type} value={type}>
										{CONTENT_TYPE_LABELS[type as ContentType] ?? type}
									</option>
								));
							})()}
						</select>
						<p className="mt-1 text-xs text-muted-foreground">
							The concept director always runs to select characters and set
							creative direction. Selecting a type skips only the content-type
							classification portion.
						</p>
					</div>
					{error && (
						<div className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-400">
							{error}
						</div>
					)}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={handleCreate}
						disabled={creating || !channelId || !topic.trim()}
					>
						{creating ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Play className="mr-2 h-4 w-4" />
						)}
						Start Run
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
