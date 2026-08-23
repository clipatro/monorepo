/**
 * CostPage — Budget and usage dashboards.
 *
 * Shows:
 * - Budget limits (per-run, per-day, global) with usage vs budget bars
 * - Total cost summary (paid, free, by provider, by model, by capability)
 * - Recent cost entries table with server-side pagination, search, and filters
 * - Per-run cost breakdown
 *
 * Aligned with the app's dark theme: PageHeader, StatCard, Tabs, SearchInput,
 * Select filters, Pagination, EmptyState, LoadingState.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
	DollarSign,
	RefreshCw,
	TrendingDown,
	Zap,
	Gift,
	AlertCircle,
	Activity,
	Cpu,
	Boxes,
	Hash,
	Receipt,
	Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from "@/components/ui/table";
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
	type CostSummary,
	type CostBudget,
	type CostEntry,
} from "@/lib/api";
import {
	PageHeader,
	LoadingState,
	StatCard,
} from "@/components/shared/PageLayout";

const PAGE_SIZE = 25;

export function CostPage() {
	const [summary, setSummary] = useState<CostSummary | null>(null);
	const [budget, setBudget] = useState<CostBudget | null>(null);
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [s, b] = await Promise.all([
				api.getCostSummary(),
				api.getCostBudget(),
			]);
			setSummary(s);
			setBudget(b);
		} catch (err) {
			console.error(err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const maxRunCost = useMemo(
		() =>
			summary
				? Math.max(...Object.values(summary.byRun).map((r) => r.cost), 0)
				: 0,
		[summary],
	);

	return (
		<div className="space-y-6">
			<PageHeader
				icon={DollarSign}
				title="Cost Tracking"
				subtitle="Every paid provider call is logged and budget-guarded"
				actions={
					<Button
						variant="outline"
						size="icon"
						onClick={load}
						disabled={loading}
						aria-label="Refresh"
					>
						<RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
					</Button>
				}
			/>

			{loading && !summary ? (
				<LoadingState message="Loading cost data..." />
			) : summary && budget ? (
				<>
					{/* Budget cards */}
					<div className="grid gap-4 md:grid-cols-3">
						<BudgetCard
							label="Per-Run Budget"
							spent={maxRunCost}
							limit={budget.perRun}
							icon={DollarSign}
						/>
						<BudgetCard
							label="Per-Day Budget"
							spent={summary.totalCost}
							limit={budget.perDay}
							icon={TrendingDown}
						/>
						<BudgetCard
							label="Global Budget"
							spent={summary.totalCost}
							limit={budget.global}
							icon={AlertCircle}
						/>
					</div>

					{/* Summary stat cards */}
					<div className="grid gap-3 grid-cols-2 md:grid-cols-4">
						<StatCard
							label="Total Cost"
							value={`$${summary.totalCost.toFixed(6)}`}
							icon={DollarSign}
							accent="default"
						/>
						<StatCard
							label="Paid Cost"
							value={`$${summary.totalPaidCost.toFixed(6)}`}
							icon={Zap}
							accent="amber"
						/>
						<StatCard
							label="Paid Calls"
							value={summary.totalPaidCalls}
							icon={Activity}
							accent="blue"
						/>
						<StatCard
							label="Free Calls"
							value={summary.totalFreeCalls}
							icon={Gift}
							accent="green"
						/>
					</div>

					{/* Breakdown tables in tabs */}
					<BreakdownTabs summary={summary} />

					{/* Server-side paginated entries table */}
					<EntriesTable />
				</>
			) : (
				<EmptyState
					icon={DollarSign}
					title="No cost data available"
					description="Cost entries will appear here once provider calls are made."
				/>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Budget card with usage bar
// ---------------------------------------------------------------------------

function BudgetCard({
	label,
	spent,
	limit,
	icon: Icon,
}: {
	label: string;
	spent: number;
	limit: number;
	icon: React.ComponentType<{ className?: string }>;
}) {
	const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
	const isWarning = pct > 80;
	const isCritical = pct > 95;

	return (
		<Card className="rounded-xl">
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<CardTitle className="text-sm font-medium text-muted-foreground">
						{label}
					</CardTitle>
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
						<Icon className="h-4 w-4" />
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex items-baseline justify-between">
					<span className="text-2xl font-bold tracking-tight">
						${spent.toFixed(4)}
					</span>
					<span className="text-sm text-muted-foreground">
						/ ${limit.toFixed(2)}
					</span>
				</div>
				<div className="h-2 bg-muted rounded-full overflow-hidden">
					<div
						className={cn(
							"h-full rounded-full transition-all duration-300",
							isCritical
								? "bg-red-500"
								: isWarning
									? "bg-amber-500"
									: "bg-emerald-500",
						)}
						style={{ width: `${pct}%` }}
					/>
				</div>
				<p
					className={cn(
						"text-xs",
						isCritical
							? "text-red-400"
							: isWarning
								? "text-amber-400"
								: "text-muted-foreground",
					)}
				>
					{pct.toFixed(1)}% used
					{isCritical && " — budget nearly exhausted"}
				</p>
			</CardContent>
		</Card>
	);
}

// ---------------------------------------------------------------------------
// Breakdown tables — tabbed to keep the page compact
// ---------------------------------------------------------------------------

function BreakdownTabs({ summary }: { summary: CostSummary }) {
	const tabs = [
		{
			key: "provider",
			label: "Provider",
			icon: Cpu,
			data: summary.byProvider,
		},
		{
			key: "model",
			label: "Model",
			icon: Boxes,
			data: summary.byModel,
		},
		{
			key: "capability",
			label: "Capability",
			icon: Activity,
			data: summary.byCapability,
		},
		{
			key: "run",
			label: "Run",
			icon: Hash,
			data: summary.byRun,
		},
	] as const;

	return (
		<Tabs defaultValue="provider">
			<TabsList>
				{tabs.map((t) => (
					<TabsTrigger key={t.key} value={t.key} className="gap-1.5">
						<t.icon className="h-3.5 w-3.5" />
						{t.label}
						<Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">
							{Object.keys(t.data).length}
						</Badge>
					</TabsTrigger>
				))}
			</TabsList>

			{tabs.map((t) => (
				<TabsContent key={t.key} value={t.key}>
					<BreakdownCard
						title={t.label}
						data={t.data}
						isRun={t.key === "run"}
					/>
				</TabsContent>
			))}
		</Tabs>
	);
}

function BreakdownCard({
	title,
	data,
	isRun,
}: {
	title: string;
	data: Record<string, { cost: number; calls: number }>;
	isRun?: boolean;
}) {
	const entries = useMemo(
		() => Object.entries(data).sort((a, b) => b[1].cost - a[1].cost),
		[data],
	);
	const maxCost = entries.length > 0 ? entries[0]![1].cost : 0;

	return (
		<Card className="rounded-xl">
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Cost by {title}</CardTitle>
			</CardHeader>
			<CardContent>
				{entries.length === 0 ? (
					<EmptyState
						icon={Receipt}
						title={`No ${title.toLowerCase()} calls yet`}
						description="Breakdown will appear once provider calls are logged."
						className="py-10"
					/>
				) : (
					<div className="rounded-lg border overflow-hidden">
						<Table>
							<TableHeader>
								<TableRow className="bg-muted/40 hover:bg-muted/40">
									<TableHead>{title}</TableHead>
									<TableHead className="w-[100px]">Calls</TableHead>
									<TableHead className="w-[160px]">Share</TableHead>
									<TableHead className="text-right w-[120px]">Cost</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{entries.map(([key, d]) => {
									const sharePct = maxCost > 0 ? (d.cost / maxCost) * 100 : 0;
									return (
										<TableRow key={key}>
											<TableCell
												className={cn(
													"font-medium",
													isRun && "font-mono text-xs",
												)}
											>
												{isRun ? `${key.slice(0, 12)}...` : key}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{d.calls}
											</TableCell>
											<TableCell>
												<div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
													<div
														className="h-full bg-primary/60 rounded-full"
														style={{ width: `${sharePct}%` }}
													/>
												</div>
											</TableCell>
											<TableCell className="text-right font-mono text-xs">
												${d.cost.toFixed(6)}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

// ---------------------------------------------------------------------------
// Entries table — server-side pagination, search, and filters
// ---------------------------------------------------------------------------

function EntriesTable() {
	const { page, pageSize, search, setPage, setSearch, resetPage } =
		usePagination(PAGE_SIZE);
	const debouncedSearch = useDebouncedValue(search, 350);

	const [entries, setEntries] = useState<CostEntry[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(false);

	// Faceted filter options (loaded once)
	const [capabilities, setCapabilities] = useState<string[]>([]);
	const [providers, setProviders] = useState<string[]>([]);
	const [capability, setCapability] = useState<string>("all");
	const [provider, setProvider] = useState<string>("all");
	const [costType, setCostType] = useState<string>("all");

	// Load filter options once
	useEffect(() => {
		Promise.all([
			api.getCostFilterValues("capability"),
			api.getCostFilterValues("provider"),
		])
			.then(([caps, provs]) => {
				setCapabilities(caps);
				setProviders(provs);
			})
			.catch(console.error);
	}, []);

	// Reset to page 1 when search or filters change
	useEffect(() => {
		resetPage();
	}, [debouncedSearch, capability, provider, costType, resetPage]);

	// Load entries (server-side pagination + search + filters)
	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		api
			.getCostEntriesPaginated({
				search: debouncedSearch || undefined,
				capability: capability !== "all" ? capability : undefined,
				provider: provider !== "all" ? provider : undefined,
				isFree:
					costType === "free" ? true : costType === "paid" ? false : undefined,
				limit: pageSize,
				offset: (page - 1) * pageSize,
			})
			.then((res) => {
				if (cancelled) return;
				setEntries(res.entries);
				setTotal(res.total);
			})
			.catch((err) => {
				console.error("Failed to load cost entries:", err);
				if (!cancelled) {
					setEntries([]);
					setTotal(0);
				}
			})
			.finally(() => !cancelled && setLoading(false));
		return () => {
			cancelled = true;
		};
	}, [debouncedSearch, capability, provider, costType, page, pageSize]);

	const hasFilters =
		!!debouncedSearch ||
		capability !== "all" ||
		provider !== "all" ||
		costType !== "all";

	return (
		<Card className="rounded-xl">
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between gap-4">
					<CardTitle className="text-base flex items-center gap-2">
						<Receipt className="h-4 w-4 text-muted-foreground" />
						Cost Entries
						<Badge variant="secondary" className="text-[10px]">
							{total} total
						</Badge>
					</CardTitle>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Toolbar: search + filters */}
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Search capability, provider, model, run ID..."
						className="flex-1 min-w-[200px]"
					/>
					<div className="flex items-center gap-2">
						<Filter className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
						<Select value={capability} onValueChange={setCapability}>
							<SelectTrigger className="w-[150px]">
								<SelectValue placeholder="Capability" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All capabilities</SelectItem>
								{capabilities.length
									? capabilities.map((c) => (
											<SelectItem key={c} value={c}>
												{c}
											</SelectItem>
										))
									: null}
							</SelectContent>
						</Select>
						<Select value={provider} onValueChange={setProvider}>
							<SelectTrigger className="w-[140px]">
								<SelectValue placeholder="Provider" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All providers</SelectItem>
								{providers.length
									? providers.map((p) => (
											<SelectItem key={p} value={p}>
												{p}
											</SelectItem>
										))
									: null}
							</SelectContent>
						</Select>
						<Select value={costType} onValueChange={setCostType}>
							<SelectTrigger className="w-[120px]">
								<SelectValue placeholder="Cost type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All calls</SelectItem>
								<SelectItem value="paid">Paid only</SelectItem>
								<SelectItem value="free">Free only</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>

				{/* Table */}
				{loading ? (
					<LoadingState message="Loading entries..." />
				) : entries.length === 0 ? (
					<EmptyState
						icon={Receipt}
						title={
							hasFilters
								? "No entries match your filters"
								: "No cost entries yet"
						}
						description={
							hasFilters
								? "Try adjusting your search or filters."
								: "Entries will appear here once provider calls are made."
						}
					/>
				) : (
					<>
						<div className="rounded-lg border overflow-hidden">
							<Table>
								<TableHeader>
									<TableRow className="bg-muted/40 hover:bg-muted/40">
										<TableHead className="w-[160px]">Time</TableHead>
										<TableHead>Capability</TableHead>
										<TableHead>Provider / Model</TableHead>
										<TableHead className="w-[120px]">Tokens</TableHead>
										<TableHead className="text-right w-[110px]">Cost</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{entries.map((e) => (
										<TableRow key={e.id}>
											<TableCell className="text-xs text-muted-foreground whitespace-nowrap">
												{new Date(e.timestamp).toLocaleString(undefined, {
													month: "short",
													day: "numeric",
													hour: "2-digit",
													minute: "2-digit",
												})}
											</TableCell>
											<TableCell>
												<Badge
													variant="secondary"
													className="text-[10px] gap-1"
												>
													{e.capability}
												</Badge>
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-1.5">
													<Badge variant="outline" className="text-[10px]">
														{e.provider}
													</Badge>
													<span className="font-mono text-xs text-muted-foreground">
														{e.model}
													</span>
												</div>
											</TableCell>
											<TableCell className="text-xs text-muted-foreground">
												{e.inputTokens > 0 || e.outputTokens > 0
													? `${e.inputTokens}in/${e.outputTokens}out`
													: e.imageCount > 0
														? `${e.imageCount} img`
														: "—"}
											</TableCell>
											<TableCell className="text-right">
												{e.isFree ? (
													<Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
														FREE
													</Badge>
												) : (
													<span className="font-mono text-xs">
														${e.totalCost.toFixed(6)}
													</span>
												)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>

						<Pagination
							page={page}
							pageSize={pageSize}
							total={total}
							onPageChange={setPage}
						/>
					</>
				)}
			</CardContent>
		</Card>
	);
}
