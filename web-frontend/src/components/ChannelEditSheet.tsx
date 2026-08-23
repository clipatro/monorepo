/**
 * ChannelEditSheet — Isolated edit/create sheet for channels.
 *
 * Extracted from ChannelsPage to prevent the entire page from re-rendering
 * on every form field change. All form state (form, template overrides,
 * character lists, LLM config, collapsible sections) lives here.
 */

import { useState, useEffect, useCallback } from "react";
import {
	Plus,
	CheckCircle2,
	RotateCcw,
	ChevronDown,
	ChevronRight,
	Loader2,
	Users,
	X,
	Snowflake,
	Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
	api,
	type Channel,
	type CharacterReference,
	type CharacterWithChannels,
	type ProviderOptions,
	type LlmStepKey,
	type LlmStepConfig,
	type LlmConfig,
	type VideoTemplateSummary,
	type VideoTemplate,
	type ChannelTemplateOverrides,
} from "@/lib/api";
import { TemplateConfigSection } from "@/components/TemplateConfigSection";

// === Types ===

interface ChannelForm {
	name: string;
	niche: string;
	locale: string;
	targetDurationSeconds: number;
	sceneMin: number;
	sceneMax: number;
	imageProvider: string;
	ttsProvider: string;
	ttsVoiceId: string;
	aspectRatio: string;
	approvalEnabled: boolean;
	llmConfig: LlmConfig;
	imageModelCharacter: string | null;
	imageModelNonCharacter: string | null;
	researchEnabled: boolean;
	duplicateAdjudicationEnabled: boolean;
	videoGenerationEnabled: boolean;
	videoTemplateId: string;
}

const emptyForm: ChannelForm = {
	name: "",
	niche: "",
	locale: "en-US",
	targetDurationSeconds: 45,
	sceneMin: 4,
	sceneMax: 8,
	imageProvider: "fal",
	ttsProvider: "kokoro",
	ttsVoiceId: "af_heart",
	aspectRatio: "9:16",
	approvalEnabled: true,
	llmConfig: {},
	imageModelCharacter: null,
	imageModelNonCharacter: null,
	researchEnabled: true,
	duplicateAdjudicationEnabled: true,
	videoGenerationEnabled: false,
	videoTemplateId: "gameplay-with-image-scenes",
};

function avatarUrl(refs: CharacterReference[]): string | null {
	if (refs.length === 0) return null;
	const priority = ["front", "three-quarter", "full-body front", "side", "expression"];
	for (const role of priority) {
		const ref = refs.find((r) => r.role.toLowerCase() === role);
		if (ref) return api.referenceFileUrl(ref.id);
	}
	return api.referenceFileUrl(refs[0]!.id);
}

// === Character assignment row ===

function CharacterAssignmentRow({
	character,
	isActive,
	onToggleActive,
	onRemove,
}: {
	character: CharacterWithChannels;
	isActive: boolean;
	onToggleActive: (characterId: string, active: boolean) => void;
	onRemove: (characterId: string) => void;
}) {
	const [frozenVersionId, setFrozenVersionId] = useState<string | null>(null);
	const [avatar, setAvatar] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const data = await api.getCharacter(character.id);
				const frozen = data.versions.find((v) => v.status === "frozen") ?? data.versions[0];
				if (cancelled) return;
				setFrozenVersionId(frozen?.id ?? null);
				if (frozen) {
					const vDetail = await api.getCharacterVersion(frozen.id);
					if (cancelled) return;
					setAvatar(avatarUrl(vDetail.references));
				}
			} catch {
				// ignore
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => { cancelled = true; };
	}, [character.id]);

	return (
		<div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
			{avatar ? (
				<img src={avatar} alt={character.name} className="h-8 w-8 rounded-full object-cover border border-border shrink-0" loading="lazy" />
			) : (
				<div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center border border-border shrink-0">
					<Users className="h-3.5 w-3.5 text-muted-foreground" />
				</div>
			)}
			<div className="min-w-0 flex-1">
				<p className="text-xs font-medium truncate">{character.name}</p>
				<p className="text-[10px] text-muted-foreground truncate">{character.role}</p>
			</div>
			{frozenVersionId ? (
				isActive ? (
					<Badge className="text-[10px] bg-emerald-600/20 text-emerald-400 border-emerald-600/30 shrink-0">
						<CheckCircle2 className="mr-1 h-2.5 w-2.5" /> Active
					</Badge>
				) : (
					<Button type="button" variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => onToggleActive(character.id, true)} title="Set as active for this channel">
						<Circle className="mr-1 h-3 w-3" /> Set active
					</Button>
				)
			) : (
				<Badge variant="outline" className="text-xs text-muted-foreground shrink-0">
					<Snowflake className="mr-1 h-3 w-3" /> No frozen version
				</Badge>
			)}
			<Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onRemove(character.id)} title="Remove from channel">
				<X className="h-3.5 w-3.5 text-muted-foreground" />
			</Button>
		</div>
	);
}

// === Main component ===

export interface ChannelEditSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Channel being edited, or null for create mode. */
	editingChannel: Channel | null;
	/** Provider options from /api/providers. */
	providers: ProviderOptions | null;
	/** Available video templates. */
	videoTemplates: VideoTemplateSummary[];
	/** Called after a channel is saved/created to refresh the list. */
	onSaved: () => Promise<void>;
	/** Active character info map (for displaying active characters in edit mode). */
	activeCharInfo: Record<string, { characters: Array<{ id: string; name: string }>; refs: CharacterReference[] }>;
}

export function ChannelEditSheet({
	open,
	onOpenChange,
	editingChannel,
	providers,
	videoTemplates,
	onSaved,
	activeCharInfo,
}: ChannelEditSheetProps) {
	const [form, setForm] = useState<ChannelForm>(emptyForm);
	const [saving, setSaving] = useState(false);
	const [llmSectionOpen, setLlmSectionOpen] = useState(false);
	const [charSectionOpen, setCharSectionOpen] = useState(false);

	// Template state
	const [selectedTemplateConfig, setSelectedTemplateConfig] = useState<VideoTemplate | null>(null);
	const [templateOverrides, setTemplateOverrides] = useState<ChannelTemplateOverrides>({});
	const [templateConfigSectionOpen, setTemplateConfigSectionOpen] = useState(true);

	// Character state
	const [allCharacters, setAllCharacters] = useState<CharacterWithChannels[]>([]);
	const [channelCharacters, setChannelCharacters] = useState<CharacterWithChannels[]>([]);
	const [addCharId, setAddCharId] = useState<string>("");

	// === Load data when sheet opens or editing channel changes ===
	useEffect(() => {
		if (!open) return;

		if (editingChannel) {
			// Edit mode
			const ch = editingChannel;
			setForm({
				name: ch.name,
				niche: ch.niche,
				locale: ch.locale,
				targetDurationSeconds: ch.targetDurationSeconds,
				sceneMin: ch.sceneMin,
				sceneMax: ch.sceneMax,
				imageProvider: ch.imageProvider,
				ttsProvider: ch.ttsProvider,
				ttsVoiceId: ch.ttsVoiceId,
				aspectRatio: ch.aspectRatio ?? "9:16",
				approvalEnabled: ch.approvalEnabled ?? true,
				llmConfig: ch.llmConfig ?? {},
				imageModelCharacter: ch.imageModelCharacter ?? null,
				imageModelNonCharacter: ch.imageModelNonCharacter ?? null,
				researchEnabled: ch.researchEnabled ?? true,
				duplicateAdjudicationEnabled: ch.duplicateAdjudicationEnabled ?? true,
				videoGenerationEnabled: ch.videoGenerationEnabled ?? false,
				videoTemplateId: ch.videoTemplate ?? "gameplay-with-image-scenes",
			});
			const hasCustomLlm = ch.llmConfig && Object.keys(ch.llmConfig).length > 0;
			setLlmSectionOpen(!!hasCustomLlm);
			setAddCharId("");
			setCharSectionOpen(false);
			setTemplateOverrides({});
			setSelectedTemplateConfig(null);
			setTemplateConfigSectionOpen(true);

			// Load template config + characters
			(async () => {
				let templateLoaded = false;
				try {
					const [allResult, chChars, tmplAssignment] = await Promise.all([
						api.listAllCharacters({ limit: 100 }),
						api.listCharacters(ch.id),
						api.getChannelTemplate(ch.id).catch(() => null),
					]);
					setAllCharacters(allResult.characters);
					const channelCharIds = new Set(chChars.map((c) => c.id));
					setChannelCharacters(allResult.characters.filter((c) => channelCharIds.has(c.id)));

					if (tmplAssignment) {
						setSelectedTemplateConfig({
							id: tmplAssignment.templateId,
							name: tmplAssignment.templateName,
							description: tmplAssignment.templateDescription,
							version: tmplAssignment.templateVersion,
							isSystem: tmplAssignment.templateIsSystem,
							createdAt: "",
							updatedAt: "",
							config: tmplAssignment.templateConfig,
						});
						setTemplateOverrides(tmplAssignment.overrides ?? {});
						templateLoaded = true;
					}
				} catch {
					setAllCharacters([]);
					setChannelCharacters([]);
				}
				if (!templateLoaded && ch.videoTemplate) {
					try {
						const tmpl = await api.getVideoTemplate(ch.videoTemplate);
						setSelectedTemplateConfig(tmpl);
					} catch { /* non-critical */ }
				}
			})();
		} else {
			// Create mode
			setForm({ ...emptyForm });
			setLlmSectionOpen(false);
			setChannelCharacters([]);
			setAddCharId("");
			setCharSectionOpen(false);
			setTemplateOverrides({});
			setTemplateConfigSectionOpen(true);
			api.getVideoTemplate("gameplay-with-image-scenes")
				.then(setSelectedTemplateConfig)
				.catch(() => setSelectedTemplateConfig(null));
		}
	}, []); // mount-only — component is remounted via key prop on each open

	// === Template selection handler ===
	const onTemplateChange = useCallback(async (templateId: string) => {
		setForm((f) => ({ ...f, videoTemplateId: templateId }));
		setTemplateOverrides({});
		setSelectedTemplateConfig(null);
		try {
			const tmpl = await api.getVideoTemplate(templateId);
			setSelectedTemplateConfig(tmpl);
		} catch {
			setSelectedTemplateConfig(null);
		}
	}, []);

	// === Character assignment handlers ===
	const handleAddCharacter = useCallback(async () => {
		if (!editingChannel || !addCharId) return;
		try {
			await api.addCharacterToChannel(editingChannel.id, addCharId);
			setAddCharId("");
			const chChars = await api.listCharacters(editingChannel.id);
			const channelCharIds = new Set(chChars.map((c) => c.id));
			setChannelCharacters(allCharacters.filter((c) => channelCharIds.has(c.id)));
			await onSaved();
		} catch { /* ignore */ }
	}, [editingChannel, addCharId, allCharacters, onSaved]);

	const handleRemoveCharacter = useCallback(async (characterId: string) => {
		if (!editingChannel) return;
		try {
			await api.removeCharacterFromChannel(editingChannel.id, characterId);
			const chChars = await api.listCharacters(editingChannel.id);
			const channelCharIds = new Set(chChars.map((c) => c.id));
			setChannelCharacters(allCharacters.filter((c) => channelCharIds.has(c.id)));
			await onSaved();
		} catch { /* ignore */ }
	}, [editingChannel, allCharacters, onSaved]);

	const handleToggleCharacterActive = useCallback(async (characterId: string, active: boolean) => {
		if (!editingChannel) return;
		try {
			await api.toggleChannelCharacter(editingChannel.id, characterId, active);
			await onSaved();
		} catch { /* ignore */ }
	}, [editingChannel, onSaved]);

	// === LLM step config helpers ===
	const setStepConfig = useCallback((stepKey: LlmStepKey, config: LlmStepConfig) => {
		setForm((f) => ({ ...f, llmConfig: { ...f.llmConfig, [stepKey]: config } }));
	}, []);

	const clearStepConfig = useCallback((stepKey: LlmStepKey) => {
		setForm((f) => {
			const next = { ...f.llmConfig };
			delete next[stepKey];
			return { ...f, llmConfig: next };
		});
	}, []);

	const clearAllStepConfigs = useCallback(() => {
		setForm((f) => ({ ...f, llmConfig: {} }));
	}, []);

	const customStepCount = Object.values(form.llmConfig).filter(
		(v) => v && (v.provider || v.model),
	).length;

	const modelsForProvider = useCallback((providerId: string) => {
		return providers?.llm.providers.find((p) => p.id === providerId)?.models ?? [];
	}, [providers]);

	const providersForStep = useCallback((stepKey: string) => {
		const allowed = providers?.llm.steps.find((s) => s.key === stepKey)?.allowedProviders ?? [];
		return (providers?.llm.providers ?? []).filter((p) => allowed.includes(p.id));
	}, [providers]);

	const onStepProviderChange = useCallback((stepKey: LlmStepKey, value: string) => {
		if (value === "__default__") {
			clearStepConfig(stepKey);
			return;
		}
		const existing = form.llmConfig[stepKey];
		setStepConfig(stepKey, { provider: value, model: null });
		if (existing?.model) {
			const models = modelsForProvider(value);
			if (models.some((m) => m.id === existing.model)) {
				setStepConfig(stepKey, { provider: value, model: existing.model });
			}
		}
	}, [form.llmConfig, clearStepConfig, setStepConfig, modelsForProvider]);

	const onStepModelChange = useCallback((stepKey: LlmStepKey, value: string) => {
		const existing = form.llmConfig[stepKey];
		setStepConfig(stepKey, {
			provider: existing?.provider ?? null,
			model: value === "__default__" ? null : value,
		});
	}, [form.llmConfig, setStepConfig]);

	const ttsVoices = providers?.tts.providers.find((p) => p.id === form.ttsProvider)?.models ?? [];

	const onTtsProviderChange = useCallback((v: string) => {
		setForm((f) => ({ ...f, ttsProvider: v, ttsVoiceId: "" }));
	}, []);

	// === Submit handler ===
	const handleSubmit = useCallback(async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		try {
			const cleanedLlmConfig: LlmConfig = {};
			for (const [key, val] of Object.entries(form.llmConfig)) {
				if (val && (val.provider || val.model)) {
					cleanedLlmConfig[key as LlmStepKey] = val;
				}
			}

			const cfg = selectedTemplateConfig?.config;
			const effImgProvider =
				templateOverrides.providers?.image?.defaultProvider ??
				cfg?.providers.image?.defaultProvider ??
				form.imageProvider;
			const effImgCharModel =
				templateOverrides.providers?.image?.characterModel ??
				cfg?.providers.image?.characterModel ?? null;
			const effImgNonCharModel =
				templateOverrides.providers?.image?.nonCharacterModel ??
				cfg?.providers.image?.nonCharacterModel ?? null;
			const effAspectRatio =
				templateOverrides.layout?.aspectRatio ??
				cfg?.layout.aspectRatio ??
				form.aspectRatio;

			const { videoTemplateId, ...restForm } = form;
			const payload = {
				...restForm,
				imageProvider: effImgProvider,
				imageModelCharacter: effImgCharModel,
				imageModelNonCharacter: effImgNonCharModel,
				aspectRatio: effAspectRatio,
				videoTemplate: videoTemplateId,
				llmConfig: Object.keys(cleanedLlmConfig).length > 0 ? cleanedLlmConfig : null,
			};
			let channelId: string;
			if (editingChannel) {
				await api.updateChannel(editingChannel.id, payload);
				channelId = editingChannel.id;
			} else {
				const created = await api.createChannel(payload);
				channelId = created.id;
			}
			try {
				await api.assignChannelTemplate(channelId, videoTemplateId, templateOverrides);
			} catch (tmplErr) {
				console.warn("Failed to assign video template:", tmplErr);
			}
			onOpenChange(false);
			await onSaved();
		} catch (err) {
			console.error("Failed to save channel:", err);
		} finally {
			setSaving(false);
		}
	}, [form, selectedTemplateConfig, templateOverrides, editingChannel, onOpenChange, onSaved]);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent width="max-w-4xl">
				<SheetHeader>
					<SheetTitle>
						{editingChannel ? "Edit Channel" : "Create Channel"}
					</SheetTitle>
					<SheetDescription>
						{editingChannel
							? "Update channel configuration."
							: "Set up a new YouTube channel with its own niche and providers."}
					</SheetDescription>
				</SheetHeader>
				<SheetBody>
					<form id="channel-form" onSubmit={handleSubmit} className="space-y-4">
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="name">Channel Name</Label>
								<Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Psychology Shorts" required />
							</div>
							<div className="space-y-2">
								<Label htmlFor="locale">Locale</Label>
								<Input id="locale" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })} placeholder="en-US" />
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="niche">Niche</Label>
							<Textarea id="niche" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="Interesting stories and human psychology" required />
						</div>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
							<div className="space-y-2">
								<Label htmlFor="duration">Target Duration (s)</Label>
								<Input id="duration" type="number" min={15} max={120} value={form.targetDurationSeconds} onChange={(e) => setForm({ ...form, targetDurationSeconds: Number(e.target.value) })} />
							</div>
							<div className="space-y-2">
								<Label htmlFor="sceneMin">Min Scenes</Label>
								<Input id="sceneMin" type="number" min={1} max={20} value={form.sceneMin} onChange={(e) => setForm({ ...form, sceneMin: Number(e.target.value) })} />
							</div>
							<div className="space-y-2">
								<Label htmlFor="sceneMax">Max Scenes</Label>
								<Input id="sceneMax" type="number" min={1} max={20} value={form.sceneMax} onChange={(e) => setForm({ ...form, sceneMax: Number(e.target.value) })} />
							</div>
						</div>

						<div className="flex items-center gap-3 rounded-md border p-3">
							<input id="approvalEnabled" type="checkbox" checked={form.approvalEnabled} onChange={(e) => setForm({ ...form, approvalEnabled: e.target.checked })} className="h-4 w-4 rounded border-border" />
							<div>
								<Label htmlFor="approvalEnabled" className="cursor-pointer">Require human approval</Label>
								<p className="text-xs text-muted-foreground">When off, the pipeline auto-approves without pausing.</p>
							</div>
						</div>

						<div className="flex items-center gap-3 rounded-md border p-3">
							<input id="researchEnabled" type="checkbox" checked={form.researchEnabled} onChange={(e) => setForm({ ...form, researchEnabled: e.target.checked })} className="h-4 w-4 rounded border-border" />
							<div>
								<Label htmlFor="researchEnabled" className="cursor-pointer">Enable research & grounding</Label>
								<p className="text-xs text-muted-foreground">When off, skips the research step (saves ~$0.09/run). Stories rely on the model's training data. Keep on for true-case or medical content.</p>
							</div>
						</div>

						<div className="flex items-center gap-3 rounded-md border p-3">
							<input id="duplicateAdjudicationEnabled" type="checkbox" checked={form.duplicateAdjudicationEnabled} onChange={(e) => setForm({ ...form, duplicateAdjudicationEnabled: e.target.checked })} className="h-4 w-4 rounded border-border" />
							<div>
								<Label htmlFor="duplicateAdjudicationEnabled" className="cursor-pointer">Enable Gemini duplicate adjudication</Label>
								<p className="text-xs text-muted-foreground">When off, borderline duplicates stay "borderline" without a paid LLM call (saves ~$0.02/run). The human at story approval judges them instead.</p>
							</div>
						</div>

						<div className="flex items-center gap-3 rounded-md border p-3">
							<input id="videoGenerationEnabled" type="checkbox" checked={form.videoGenerationEnabled} onChange={(e) => setForm({ ...form, videoGenerationEnabled: e.target.checked })} className="h-4 w-4 rounded border-border" />
							<div>
								<Label htmlFor="videoGenerationEnabled" className="cursor-pointer">Enable video generation</Label>
								<p className="text-xs text-muted-foreground">When on, the pipeline renders a 9:16 vertical MP4 from the final assets after package assembly. Adds ~60-90s of processing time per run.</p>
							</div>
						</div>

						{/* Video Template Selection + Template-Specific Config */}
						<div className="rounded-md border p-3 space-y-3">
							<div className="space-y-2">
								<Label htmlFor="videoTemplateId">Video template</Label>
								<Select value={form.videoTemplateId} onValueChange={onTemplateChange}>
									<SelectTrigger id="videoTemplateId">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{videoTemplates.length === 0 && (
											<SelectItem value="gameplay-with-image-scenes" disabled>Loading templates...</SelectItem>
										)}
										{videoTemplates.map((t) => (
											<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
										))}
									</SelectContent>
								</Select>
								{videoTemplates.find((t) => t.id === form.videoTemplateId) && (
									<p className="text-xs text-muted-foreground">
										{videoTemplates.find((t) => t.id === form.videoTemplateId)?.description}
									</p>
								)}
							</div>

							{selectedTemplateConfig && (
								<div className="space-y-2">
									<button type="button" onClick={() => setTemplateConfigSectionOpen((v) => !v)} className="flex w-full items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
										{templateConfigSectionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
										Template Configuration
									</button>
									{templateConfigSectionOpen && (
										<TemplateConfigSection
											templateConfig={selectedTemplateConfig.config}
											overrides={templateOverrides}
											onOverridesChange={setTemplateOverrides}
											providers={providers ?? undefined}
										/>
									)}
								</div>
							)}
						</div>

						{/* LLM Configuration */}
						<div className="rounded-lg border">
							<div
								role="button"
								tabIndex={0}
								onClick={() => setLlmSectionOpen((v) => !v)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										setLlmSectionOpen((v) => !v);
									}
								}}
								className="flex w-full items-center justify-between p-3 text-left cursor-pointer select-none"
							>
								<div className="flex items-center gap-2">
									{llmSectionOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
									<span className="text-sm font-medium">LLM Configuration</span>
									{customStepCount > 0 && (
										<Badge variant="secondary" className="text-[10px]">{customStepCount} customized</Badge>
									)}
								</div>
								{customStepCount > 0 && (
									<Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); clearAllStepConfigs(); }}>
										<RotateCcw className="mr-1 h-3 w-3" /> Reset all
									</Button>
								)}
							</div>
							{llmSectionOpen && (
								<div className="space-y-2 border-t px-3 pb-3 pt-2">
									<p className="text-xs text-muted-foreground">
										Configure which LLM provider and model to use for each pipeline step. Leave as "Use env default" to inherit from the env var.
									</p>
									{providers?.llm.steps.map((step) => {
										const stepCfg = form.llmConfig[step.key];
										const isCustomized = !!(stepCfg && (stepCfg.provider || stepCfg.model));
										const currentProvider = stepCfg?.provider ?? "__default__";
										const currentModel = stepCfg?.model ?? "__default__";
										const stepProviders = providersForStep(step.key);
										const providerModels = stepCfg?.provider ? modelsForProvider(stepCfg.provider) : [];
										const isLockedProvider = step.allowedProviders.length === 1;
										return (
											<div key={step.key} className={`rounded-md border p-2.5 ${isCustomized ? "border-primary/30 bg-primary/5" : "bg-card"}`}>
												<div className="mb-1.5 flex items-start justify-between gap-2">
													<div className="min-w-0">
														<span className="text-xs font-medium">{step.label}</span>
														<p className="text-[11px] text-muted-foreground line-clamp-1">{step.description}</p>
													</div>
													{isCustomized && (
														<Button type="button" variant="ghost" size="sm" className="h-5 shrink-0 text-[11px]" onClick={() => clearStepConfig(step.key)}>Reset</Button>
													)}
												</div>
												<div className="grid grid-cols-2 gap-2">
													<Select value={currentProvider} onValueChange={(v) => onStepProviderChange(step.key, v)} disabled={isLockedProvider}>
														<SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Use env default" /></SelectTrigger>
														<SelectContent>
															{!isLockedProvider && <SelectItem value="__default__">Use env default</SelectItem>}
															{stepProviders.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
														</SelectContent>
													</Select>
													<Select value={currentModel} onValueChange={(v) => onStepModelChange(step.key, v)} disabled={!stepCfg?.provider}>
														<SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Provider default" /></SelectTrigger>
														<SelectContent>
															<SelectItem value="__default__">Use provider default</SelectItem>
															{providerModels.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
														</SelectContent>
													</Select>
												</div>
											</div>
										);
									})}
								</div>
							)}
						</div>

						{/* TTS */}
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label>TTS Provider</Label>
								<Select value={form.ttsProvider} onValueChange={onTtsProviderChange}>
									<SelectTrigger><SelectValue /></SelectTrigger>
									<SelectContent>
										{providers?.tts.providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label>TTS Voice</Label>
								<Select value={form.ttsVoiceId} onValueChange={(v) => setForm({ ...form, ttsVoiceId: v })}>
									<SelectTrigger><SelectValue placeholder="Provider default" /></SelectTrigger>
									<SelectContent>
										{ttsVoices.length === 0 && <SelectItem value="" disabled>No voices listed</SelectItem>}
										{ttsVoices.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
									</SelectContent>
								</Select>
							</div>
						</div>

						{/* Character Assignment — only when editing */}
						{editingChannel && (
							<div className="rounded-lg border">
								<button type="button" onClick={() => setCharSectionOpen((v) => !v)} className="flex w-full items-center justify-between p-3 text-left">
									<div className="flex items-center gap-2">
										{charSectionOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
										<Users className="h-4 w-4 text-muted-foreground" />
										<span className="text-sm font-medium">Character Assignment</span>
										<Badge variant="secondary" className="text-[10px]">{channelCharacters.length}</Badge>
									</div>
								</button>
								{charSectionOpen && (
									<div className="space-y-3 border-t px-3 pb-3 pt-3">
										<p className="text-xs text-muted-foreground">
											Assign characters to this channel. Characters can be shared across channels. Set one as the active character for scene generation.
										</p>

										{editingChannel.activeCharacterIds.length > 0 ? (
											<div className="flex items-center gap-2 rounded-md bg-emerald-600/10 px-3 py-2">
												<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
												<span className="text-xs font-medium">
													Active: {activeCharInfo[editingChannel.id]?.characters.map((c) => c.name).join(", ") ?? "Unknown"}
												</span>
												<Badge className="ml-auto text-[10px] bg-emerald-600/20 text-emerald-400 border-emerald-600/30">
													{editingChannel.activeCharacterIds.length}
												</Badge>
											</div>
										) : (
											<div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
												<span className="text-xs text-muted-foreground">No active characters. Set a character as active below (requires a frozen version).</span>
											</div>
										)}

										{channelCharacters.length > 0 ? (
											<div className="space-y-1.5">
												{channelCharacters.map((char) => (
													<CharacterAssignmentRow
														key={char.id}
														character={char}
														isActive={editingChannel.activeCharacterIds.includes(char.id)}
														onToggleActive={handleToggleCharacterActive}
														onRemove={handleRemoveCharacter}
													/>
												))}
											</div>
										) : (
											<p className="text-xs text-muted-foreground rounded-md border border-dashed p-3 text-center">
												No characters assigned to this channel yet.
											</p>
										)}

										{allCharacters.length > channelCharacters.length && (
											<div className="flex items-end gap-2 pt-1">
												<div className="flex-1">
													<Label className="text-xs">Add existing character</Label>
													<Select value={addCharId} onValueChange={setAddCharId}>
														<SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select a character..." /></SelectTrigger>
														<SelectContent>
															{allCharacters.filter((c) => !channelCharacters.some((cc) => cc.id === c.id)).map((c) => (
																<SelectItem key={c.id} value={c.id}>{c.name} — {c.role}</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
												<Button type="button" size="sm" onClick={handleAddCharacter} disabled={!addCharId}>
													<Plus className="mr-1 h-3 w-3" /> Add
												</Button>
											</div>
										)}
									</div>
								)}
							</div>
						)}
					</form>
				</SheetBody>
				<SheetFooter>
					<Button type="submit" form="channel-form" disabled={saving}>
						{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
						{editingChannel ? "Save Changes" : "Create Channel"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
