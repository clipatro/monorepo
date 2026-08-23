/**
 * MediaPlayer — Beautiful audio/video player built on Vidstack.
 *
 * Wraps @vidstack/react with the default dark-theme layout.
 * Use <AudioPlayer> for voiceovers, <VideoPlayer> for generated videos.
 * Both accept a `src` URL and optional className.
 */

import {
	MediaPlayer,
	MediaProvider,
	Track,
	type MediaPlayerInstance,
} from "@vidstack/react";
import {
	DefaultAudioLayout,
	DefaultVideoLayout,
	defaultLayoutIcons,
} from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/audio.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import { useRef } from "react";
import { cn } from "@/lib/utils";

// ─── Audio Player ───────────────────────────────────────────────────────────

export function AudioPlayer({
	src,
	className,
	preload = "metadata",
}: {
	src: string;
	className?: string;
	preload?: "none" | "metadata" | "auto";
}) {
	const ref = useRef<MediaPlayerInstance>(null);

	return (
		<div className="dark">
			<MediaPlayer
				ref={ref}
				src={src}
				load="visible"
				preload={preload}
				playsInline
				className={cn("w-full", className)}
			>
				<MediaProvider />
				<DefaultAudioLayout icons={defaultLayoutIcons} />
			</MediaPlayer>
		</div>
	);
}

// ─── Video Player ───────────────────────────────────────────────────────────

export function VideoPlayer({
	src,
	className,
	preload = "metadata",
	maxHeight,
}: {
	src: string;
	className?: string;
	preload?: "none" | "metadata" | "auto";
	maxHeight?: string;
}) {
	const ref = useRef<MediaPlayerInstance>(null);

	return (
		<div className={cn("dark", maxHeight && "overflow-hidden")} style={maxHeight ? { maxHeight } : undefined}>
			<MediaPlayer
				ref={ref}
				src={src}
				load="visible"
				preload={preload}
				playsInline
				className={cn(
					"w-full rounded-lg overflow-hidden bg-black",
					className,
				)}
			>
				<MediaProvider />
				<DefaultVideoLayout icons={defaultLayoutIcons} />
			</MediaPlayer>
		</div>
	);
}

export { MediaPlayer, MediaProvider, Track };
