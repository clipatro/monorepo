import { useState, useEffect } from "react";
import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import {
	Film,
	Users,
	DollarSign,
	Workflow,
	BookOpen,
	Image as ImageIcon,
	Mic,
	Menu,
	FlaskConical,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { ChannelsPage } from "@/pages/ChannelsPage";
import { CharactersPage } from "@/pages/CharactersPage";
import { CostPage } from "@/pages/CostPage";
import { PipelinePage } from "@/pages/PipelinePage";
import { StoriesPage } from "@/pages/StoriesPage";
import { ImagesPage } from "@/pages/ImagesPage";
import { VoicePage } from "@/pages/VoicePage";

const navItems = [
	{ to: "/channels", label: "Channels", icon: Film },
	{ to: "/characters", label: "Characters", icon: Users },
	{ to: "/stories", label: "Stories", icon: BookOpen },
	{ to: "/images", label: "Images", icon: ImageIcon },
	{ to: "/voice", label: "Voice", icon: Mic },
	{ to: "/pipeline", label: "Pipeline", icon: Workflow },
	{ to: "/cost", label: "Cost", icon: DollarSign },
];

export default function App() {
	const [mobileNavOpen, setMobileNavOpen] = useState(false);
	const [dryRun, setDryRun] = useState(false);

	useEffect(() => {
		api
			.getDryRunStatus()
			.then((r) => setDryRun(r.dryRun))
			.catch(() => {});
	}, []);

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur">
				<div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6">
					<div className="flex items-center gap-2">
						<img src="/logo-white.png" alt="Clipatro" className="h-7 w-auto" />
					</div>
					<Separator orientation="vertical" className="hidden h-6 sm:block" />
					<div className="hidden text-muted-foreground text-xs sm:inline-flex">
						AUTOMATED VIDEO STORYTELLING
					</div>
					{dryRun && (
						<Badge
							variant="outline"
							className="hidden text-xs sm:inline-flex border-amber-500/50 text-amber-600 bg-amber-50 dark:bg-amber-950/30"
							title="DRY_RUN is active — all paid API calls return placeholder data (no cost)"
						>
							<FlaskConical className="mr-1 h-3 w-3" />
							Dry-Run
						</Badge>
					)}

					{/* Desktop nav */}
					<nav
						className="ml-auto hidden md:flex items-center gap-1"
						aria-label="Main navigation"
					>
						{navItems.map((item) => {
							const Icon = item.icon;
							return (
								<NavLink
									key={item.to}
									to={item.to}
									className={({ isActive }) =>
										cn(
											"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											isActive
												? "bg-secondary text-secondary-foreground"
												: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
										)
									}
								>
									<Icon className="h-4 w-4" aria-hidden="true" />
									{item.label}
								</NavLink>
							);
						})}
					</nav>

					{/* Mobile nav toggle */}
					<button
						onClick={() => setMobileNavOpen(!mobileNavOpen)}
						className="ml-auto inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						aria-label="Toggle navigation menu"
						aria-expanded={mobileNavOpen}
						aria-controls="mobile-nav"
					>
						<Menu className="h-5 w-5" aria-hidden="true" />
					</button>
				</div>

				{/* Mobile nav drawer */}
				{mobileNavOpen && (
					<nav
						id="mobile-nav"
						className="border-t bg-card md:hidden"
						aria-label="Mobile navigation"
					>
						<div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
							{navItems.map((item) => {
								const Icon = item.icon;
								return (
									<NavLink
										key={item.to}
										to={item.to}
										onClick={() => setMobileNavOpen(false)}
										className={({ isActive }) =>
											cn(
												"inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
												isActive
													? "bg-secondary text-secondary-foreground"
													: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
											)
										}
									>
										<Icon className="h-4 w-4" aria-hidden="true" />
										{item.label}
									</NavLink>
								);
							})}
						</div>
					</nav>
				)}
			</header>

			{/* Content */}
			<main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
				<Routes>
					<Route path="/channels" element={<ChannelsPage />} />
					<Route path="/characters" element={<CharactersPage />} />
					<Route path="/stories" element={<StoriesPage />} />
					<Route path="/images" element={<ImagesPage />} />
					<Route path="/voice" element={<VoicePage />} />
					<Route path="/pipeline" element={<PipelinePage />} />
					<Route path="/cost" element={<CostPage />} />
					<Route path="*" element={<Navigate to="/channels" replace />} />
				</Routes>
			</main>
		</div>
	);
}
