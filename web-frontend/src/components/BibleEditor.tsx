/**
 * BibleEditor — Structured editor for CharacterBible fields.
 *
 * Replaces the raw JSON textarea with labeled inputs for physical traits,
 * personality/story fields, and a key-value editor for relationships.
 * Internally serializes to/from a JSON string so it's a drop-in replacement
 * for the old textarea-based editors.
 *
 * Also exports BibleDisplay — a read-only structured view of a bible.
 */

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// === Bible field definitions ===

interface FieldDef {
	key: string;
	label: string;
	placeholder?: string;
	type?: "text" | "textarea";
}

const PHYSICAL_FIELDS: FieldDef[] = [
	{ key: "name", label: "Name", placeholder: "e.g. NoahVale" },
	{ key: "age", label: "Age", placeholder: "e.g. 25-30" },
	{ key: "gender", label: "Gender", placeholder: "e.g. male" },
	{ key: "heritage", label: "Heritage", placeholder: "e.g. Mediterranean" },
	{ key: "ethnicity", label: "Ethnicity", placeholder: "e.g. Greek-American" },
	{ key: "skinTone", label: "Skin Tone", placeholder: "e.g. warm olive" },
	{ key: "faceShape", label: "Face Shape", placeholder: "e.g. oval" },
	{ key: "facialFeatures", label: "Facial Features", placeholder: "e.g. sharp jawline" },
	{ key: "eyeColor", label: "Eye Color", placeholder: "e.g. hazel-green" },
	{ key: "hairColor", label: "Hair Color", placeholder: "e.g. chestnut-brown" },
	{ key: "hairStyle", label: "Hair Style", placeholder: "e.g. short messy" },
	{ key: "facialHair", label: "Facial Hair", placeholder: "e.g. stubble" },
	{ key: "build", label: "Build", placeholder: "e.g. slim" },
	{ key: "height", label: "Height", placeholder: "e.g. 5'10\"" },
	{ key: "distinguishingFeatures", label: "Distinguishing Features", placeholder: "e.g. scar on left brow" },
	{ key: "wardrobe", label: "Wardrobe", placeholder: "e.g. dark casual, leather jacket" },
];

const PERSONALITY_FIELDS: FieldDef[] = [
	{ key: "personality", label: "Personality", placeholder: "e.g. introspective, dry humor, loyal", type: "textarea" },
	{ key: "background", label: "Background", placeholder: "e.g. grew up in a small coastal town...", type: "textarea" },
	{ key: "storyArc", label: "Story Arc", placeholder: "e.g. learns to trust again after betrayal", type: "textarea" },
	{ key: "speakingStyle", label: "Speaking Style", placeholder: "e.g. measured, uses metaphors, quiet voice", type: "textarea" },
	{ key: "role", label: "Role", placeholder: "e.g. protagonist" },
];

// === Helper: parse JSON safely ===

function parseBible(json: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(json);
		return typeof parsed === "object" && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
}

// === Collapsible section ===

function Section({
	title,
	defaultOpen = true,
	children,
}: {
	title: string;
	defaultOpen?: boolean;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="space-y-2">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
			>
				{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
				{title}
			</button>
			{open && <div className="space-y-3 pl-1">{children}</div>}
		</div>
	);
}

// === Key-value editor for relationships ===

function RelationshipsEditor({
	value,
	onChange,
}: {
	value: Record<string, string>;
	onChange: (v: Record<string, string>) => void;
}) {
	const entries = Object.entries(value);

	function addEntry() {
		onChange({ ...value, "": "" });
	}

	function updateKey(oldKey: string, newKey: string) {
		const next = { ...value };
		const v = next[oldKey];
		delete next[oldKey];
		next[newKey] = v ?? "";
		onChange(next);
	}

	function updateValue(key: string, val: string) {
		onChange({ ...value, [key]: val });
	}

	function removeEntry(key: string) {
		const next = { ...value };
		delete next[key];
		onChange(next);
	}

	return (
		<div className="space-y-2">
			{entries.length === 0 && (
				<p className="text-xs text-muted-foreground italic">
					No relationships defined yet.
				</p>
			)}
			{entries.map(([k, v], i) => (
				<div key={i} className="flex items-center gap-2">
					<Input
						value={k}
						onChange={(e) => updateKey(k, e.target.value)}
						placeholder="Character name"
						className="flex-1 text-xs h-8"
					/>
					<Input
						value={v}
						onChange={(e) => updateValue(k, e.target.value)}
						placeholder="Relationship (e.g. mentor, rival)"
						className="flex-1 text-xs h-8"
					/>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-8 w-8 p-0 shrink-0"
						onClick={() => removeEntry(k)}
					>
						<Trash2 className="h-3 w-3" />
					</Button>
				</div>
			))}
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="h-7 text-xs"
				onClick={addEntry}
			>
				<Plus className="mr-1 h-3 w-3" /> Add Relationship
			</Button>
		</div>
	);
}

// === Main BibleEditor component ===

export interface BibleEditorProps {
	/** JSON string of the bible — same format the old textarea used. */
	value: string;
	/** Called with updated JSON string on every change. */
	onChange: (json: string) => void;
	/** Compact mode — fewer fields visible, smaller spacing. */
	compact?: boolean;
}

export function BibleEditor({ value, onChange, compact = false }: BibleEditorProps) {
	const [bible, setBible] = useState<Record<string, unknown>>(() => parseBible(value));

	// Sync internal state when the external value changes (e.g. dialog open)
	useEffect(() => {
		setBible(parseBible(value));
	}, [value]);

	const updateBible = useCallback(
		(next: Record<string, unknown>) => {
			setBible(next);
			onChange(JSON.stringify(next, null, 2));
		},
		[onChange],
	);

	function setField(key: string, fieldValue: string) {
		const next = { ...bible };
		if (fieldValue.trim() === "") {
			delete next[key];
		} else {
			next[key] = fieldValue;
		}
		updateBible(next);
	}

	function setRelationships(rel: Record<string, string>) {
		// Filter out empty keys
		const cleaned: Record<string, string> = {};
		for (const [k, v] of Object.entries(rel)) {
			if (k.trim()) cleaned[k.trim()] = v;
		}
		if (Object.keys(cleaned).length === 0) {
			const next = { ...bible };
			delete next.relationships;
			updateBible(next);
		} else {
			updateBible({ ...bible, relationships: cleaned });
		}
	}

	const relationships =
		typeof bible.relationships === "object" && bible.relationships !== null
			? (bible.relationships as Record<string, string>)
			: {};

	const immutableTraits = Array.isArray(bible.immutableTraits)
		? (bible.immutableTraits as string[])
		: [];

	function setImmutableTraits(traits: string[]) {
		if (traits.length === 0) {
			const next = { ...bible };
			delete next.immutableTraits;
			updateBible(next);
		} else {
			updateBible({ ...bible, immutableTraits: traits });
		}
	}

	return (
		<div className={cn("space-y-4", compact && "space-y-3")}>
			{/* Physical appearance */}
			<Section title="Physical Appearance">
				<div className="grid grid-cols-2 gap-2">
					{PHYSICAL_FIELDS.map((f) => (
						<div key={f.key} className="space-y-0.5">
							<Label className="text-[10px] text-muted-foreground">
								{f.label}
							</Label>
							<Input
								value={(bible[f.key] as string) ?? ""}
								onChange={(e) => setField(f.key, e.target.value)}
								placeholder={f.placeholder}
								className="h-8 text-xs"
							/>
						</div>
					))}
				</div>
			</Section>

			<Separator />

			{/* Personality & Story */}
			<Section title="Personality & Story">
				<div className="space-y-2">
					{PERSONALITY_FIELDS.map((f) => (
						<div key={f.key} className="space-y-0.5">
							<Label className="text-[10px] text-muted-foreground">
								{f.label}
							</Label>
							{f.type === "textarea" ? (
								<Textarea
									value={(bible[f.key] as string) ?? ""}
									onChange={(e) => setField(f.key, e.target.value)}
									placeholder={f.placeholder}
									className="text-xs min-h-[60px]"
									rows={2}
								/>
							) : (
								<Input
									value={(bible[f.key] as string) ?? ""}
									onChange={(e) => setField(f.key, e.target.value)}
									placeholder={f.placeholder}
									className="h-8 text-xs"
								/>
							)}
						</div>
					))}
				</div>
			</Section>

			<Separator />

			{/* Relationships */}
			<Section title="Relationships" defaultOpen={false}>
				<RelationshipsEditor
					value={relationships}
					onChange={setRelationships}
				/>
			</Section>

			<Separator />

			{/* Immutable traits */}
			<Section title="Immutable Traits" defaultOpen={false}>
				<div className="space-y-2">
					<p className="text-[10px] text-muted-foreground">
						Traits that must never change across versions (e.g. eye color, scar).
					</p>
					<div className="flex flex-wrap gap-1.5">
						{immutableTraits.map((t, i) => (
							<Badge
								key={i}
								variant="outline"
								className="text-[10px] gap-1 pr-1"
							>
								{t}
								<button
									type="button"
									onClick={() =>
										setImmutableTraits(immutableTraits.filter((_, j) => j !== i))
									}
									className="hover:text-destructive"
								>
									<Trash2 className="h-2.5 w-2.5" />
								</button>
							</Badge>
						))}
					</div>
					<ImmutableTraitInput onAdd={(t) => setImmutableTraits([...immutableTraits, t])} />
				</div>
			</Section>
		</div>
	);
}

function ImmutableTraitInput({ onAdd }: { onAdd: (trait: string) => void }) {
	const [value, setValue] = useState("");
	return (
		<div className="flex items-center gap-2">
			<Input
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && value.trim()) {
						e.preventDefault();
						onAdd(value.trim());
						setValue("");
					}
				}}
				placeholder="Add trait + Enter"
				className="h-8 text-xs flex-1"
			/>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="h-8 text-xs"
				onClick={() => {
					if (value.trim()) {
						onAdd(value.trim());
						setValue("");
					}
				}}
			>
				<Plus className="mr-1 h-3 w-3" /> Add
			</Button>
		</div>
	);
}

// === BibleDisplay — read-only structured view ===

const ALL_DISPLAY_FIELDS: Array<{ key: string; label: string; group: "physical" | "personality" }> = [
	...PHYSICAL_FIELDS.map((f) => ({ key: f.key, label: f.label, group: "physical" as const })),
	...PERSONALITY_FIELDS.map((f) => ({ key: f.key, label: f.label, group: "personality" as const })),
];

export function BibleDisplay({ bible }: { bible: Record<string, unknown> }) {
	const physical = ALL_DISPLAY_FIELDS.filter((f) => f.group === "physical" && bible[f.key]);
	const personality = ALL_DISPLAY_FIELDS.filter((f) => f.group === "personality" && bible[f.key]);
	const relationships =
		typeof bible.relationships === "object" && bible.relationships !== null
			? Object.entries(bible.relationships as Record<string, string>)
			: [];
	const immutableTraits = Array.isArray(bible.immutableTraits) ? (bible.immutableTraits as string[]) : [];

	if (physical.length === 0 && personality.length === 0 && relationships.length === 0 && immutableTraits.length === 0) {
		return (
			<p className="mt-1 text-xs text-muted-foreground italic">
				No bible fields defined.
			</p>
		);
	}

	return (
		<div className="mt-1 space-y-3 rounded-md bg-muted p-3 text-xs max-h-60 overflow-y-auto themed-scroll">
			{physical.length > 0 && (
				<div>
					<p className="font-medium text-muted-foreground mb-1">Physical</p>
					<div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
						{physical.map((f) => (
							<div key={f.key} className="flex gap-1">
								<span className="text-muted-foreground/60">{f.label}:</span>
								<span className="truncate">{String(bible[f.key])}</span>
							</div>
						))}
					</div>
				</div>
			)}
			{personality.length > 0 && (
				<div>
					<p className="font-medium text-muted-foreground mb-1">Personality & Story</p>
					<div className="space-y-1">
						{personality.map((f) => (
							<div key={f.key}>
								<span className="text-muted-foreground/60">{f.label}:</span>
								<p className="mt-0.5">{String(bible[f.key])}</p>
							</div>
						))}
					</div>
				</div>
			)}
			{relationships.length > 0 && (
				<div>
					<p className="font-medium text-muted-foreground mb-1">Relationships</p>
					<div className="space-y-0.5">
						{relationships.map(([k, v]) => (
							<div key={k} className="flex gap-1">
								<span className="text-muted-foreground/60">{k}:</span>
								<span>{v}</span>
							</div>
						))}
					</div>
				</div>
			)}
			{immutableTraits.length > 0 && (
				<div>
					<p className="font-medium text-muted-foreground mb-1">Immutable Traits</p>
					<div className="flex flex-wrap gap-1">
						{immutableTraits.map((t, i) => (
							<Badge key={i} variant="outline" className="text-[10px]">
								{t}
							</Badge>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
