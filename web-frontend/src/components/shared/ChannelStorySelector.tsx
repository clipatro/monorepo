/**
 * ChannelStorySelector — shared channel + story dropdown selector.
 * Used by StoriesPage, ImagesPage, and VoicePage.
 */

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Channel, Story } from "@/lib/api";

interface ChannelStorySelectorProps {
  channels: Channel[];
  stories: Story[];
  selectedChannel: string;
  selectedStoryId: string;
  onChannelChange: (id: string) => void;
  onStoryChange: (id: string) => void;
  storyLabel?: string;
  storyPlaceholder?: string;
}

export function ChannelStorySelector({
  channels,
  stories,
  selectedChannel,
  selectedStoryId,
  onChannelChange,
  onStoryChange,
  storyLabel = "Story",
  storyPlaceholder = "Select story...",
}: ChannelStorySelectorProps) {
  return (
    <div className="flex flex-wrap items-end gap-4 mb-6">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Channel</Label>
        <Select value={selectedChannel} onValueChange={onChannelChange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select channel..." />
          </SelectTrigger>
          <SelectContent>
            {channels.map((ch) => (
              <SelectItem key={ch.id} value={ch.id}>
                {ch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{storyLabel}</Label>
        <Select
          value={selectedStoryId}
          onValueChange={onStoryChange}
          disabled={stories.length === 0}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder={stories.length === 0 ? "No stories available" : storyPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {stories.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
