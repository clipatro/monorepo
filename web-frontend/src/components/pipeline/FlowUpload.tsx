/**
 * FlowUpload — D021: Upload dialog for Google Flow video clips and images.
 *
 * Shows compiled Flow prompts for each scene with copy buttons,
 * an upload dropzone per scene (mp4/png/jpg), and a drag-to-reorder
 * clip list for arranging the final video order.
 *
 * For auto mode: also shows which scenes were auto-generated and
 * allows re-upload of failed scenes.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GripVertical, ArrowUp, ArrowDown, Copy, Check, Upload, Film, Image as ImageIcon, Loader2 } from "lucide-react";
import { api, type RunDetails, type RunApproval } from "@/lib/api";
import { usePipelineStore } from "@/stores/pipeline-store";
import { ApprovalDialog } from "./ApprovalDialog";

interface FlowPrompt {
  sceneId: string;
  order: number;
  prompt: string;
  mediaType: string;
  expectedFilename: string;
  isCharacterScene: boolean;
  characterNames: string[];
}

interface UploadedAsset {
  sceneId: string;
  assetId: string;
  fileName: string;
  mediaType: string;
}

interface FlowUploadDialogProps {
  approval: RunApproval;
  run: RunDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FlowUploadDialog({
  approval,
  run,
  open,
  onOpenChange,
}: FlowUploadDialogProps) {
  const submitApproval = usePipelineStore((s) => s.submitApproval);
  const [prompts, setPrompts] = useState<FlowPrompt[]>([]);
  const [uploadedAssets, setUploadedAssets] = useState<Map<string, UploadedAsset>>(new Map());
  const [clipOrder, setClipOrder] = useState<number[]>([]);
  const [approving, setApproving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [copiedSceneId, setCopiedSceneId] = useState<string | null>(null);

  // Extract storyId from the scene_plan step result
  const storyId = useMemo(() => {
    const scenePlanStep = run.steps.find((s) => s.stepType === "scene_plan");
    return (scenePlanStep?.resultData?.storyId as string) ?? null;
  }, [run]);

  // Check if this is auto mode (flow_generation step exists and completed)
  const isAutoMode = useMemo(() => {
    const flowGenStep = run.steps.find((s) => s.stepType === "flow_generation");
    return flowGenStep?.status === "completed";
  }, [run]);

  // Get auto-generation results (if auto mode)
  const autoGenResults = useMemo(() => {
    const flowGenStep = run.steps.find((s) => s.stepType === "flow_generation");
    return flowGenStep?.resultData as {
      results?: Array<{
        sceneId: string;
        order: number;
        mediaType: string;
        status: "generated" | "failed";
        assetId?: string;
        error?: string;
      }>;
      generated?: number;
      failed?: number;
    } | null;
  }, [run]);

  // Fetch Flow prompts from the flow_prompt_compilation step result
  useEffect(() => {
    if (storyId) {
      setLoading(true);
      api
        .getFlowScenePrompts(storyId)
        .then((result) => {
          setPrompts(result.prompts);
          // Initialize clip order as scene order
          setClipOrder(result.prompts.map((p) => p.order));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [storyId]);

  const handleCopyPrompt = useCallback(async (sceneId: string, prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedSceneId(sceneId);
      setTimeout(() => setCopiedSceneId(null), 2000);
    } catch {
      // Clipboard not available
    }
  }, []);

  const handleFileUpload = useCallback(async (sceneId: string, mediaType: string, file: File) => {
    setUploading(sceneId);
    try {
      const result = await api.uploadFlowClip(sceneId, run.id, file, mediaType);
      setUploadedAssets((prev) => {
        const next = new Map(prev);
        next.set(sceneId, {
          sceneId,
          assetId: result.assetId,
          fileName: file.name,
          mediaType: result.mediaType,
        });
        return next;
      });
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(null);
    }
  }, [run.id]);

  const handleApprove = async () => {
    setApproving(true);
    try {
      const uploadedAssetIds = Array.from(uploadedAssets.values()).map((a) => a.assetId);
      await submitApproval(approval.id, "approved", undefined, {
        clipOrder,
        uploadedAssetIds,
      });
      onOpenChange(false);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    setApproving(true);
    try {
      await submitApproval(approval.id, "rejected");
      onOpenChange(false);
    } finally {
      setApproving(false);
    }
  };

  const moveClip = (fromIndex: number, toIndex: number) => {
    setClipOrder((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item!);
      return next;
    });
  };

  return (
    <ApprovalDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Flow Upload & Arrange"
      description={
        loading
          ? "Loading Flow prompts..."
          : isAutoMode
            ? `${prompts.length} scenes — ${autoGenResults?.generated ?? 0} auto-generated, ${autoGenResults?.failed ?? 0} failed. Upload fallbacks for failed scenes and arrange clip order.`
            : `${prompts.length} scenes — copy prompts to Google Flow, generate, download, and upload the results.`
      }
      approveLabel="Approve & Continue"
      onApprove={handleApprove}
      rejectLabel="Reject"
      onReject={handleReject}
      approving={approving}
      approveDisabled={uploadedAssets.size === 0 && !isAutoMode}
    >
      <div className="space-y-4">
        {/* Auto generation results banner (auto mode only) */}
        {isAutoMode && (
          <div className="rounded-md border border-border bg-card/50 p-3 text-sm space-y-1">
            <p className="font-medium text-foreground">Auto Generation Results</p>
            <p className="text-muted-foreground">
              {autoGenResults?.generated ?? 0} scenes were auto-generated via CDP.
              {autoGenResults?.failed ? ` ${autoGenResults.failed} failed — upload manually below.` : ""}
            </p>
          </div>
        )}

        {/* Scene prompts + upload zones */}
        {prompts.map((prompt) => {
          const autoResult = autoGenResults?.results?.find((r) => r.sceneId === prompt.sceneId);
          const uploaded = uploadedAssets.get(prompt.sceneId);
          const isUploading = uploading === prompt.sceneId;

          return (
            <div key={prompt.sceneId} className="rounded-md border border-border bg-card/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">Scene {prompt.order}</Badge>
                  <Badge variant="secondary" className="text-xs">
                    {prompt.mediaType === "video-clip" ? (
                      <><Film className="mr-1 h-3 w-3" />4s Video</>
                    ) : (
                      <><ImageIcon className="mr-1 h-3 w-3" />Image</>
                    )}
                  </Badge>
                  {prompt.isCharacterScene && prompt.characterNames.length > 0 && (
                    <Badge variant="outline" className="text-xs">{prompt.characterNames.join(", ")}</Badge>
                  )}
                  {autoResult?.status === "generated" && (
                    <Badge variant="outline" className="text-xs text-green-400 border-green-800">Auto-Generated</Badge>
                  )}
                  {autoResult?.status === "failed" && (
                    <Badge variant="outline" className="text-xs text-red-400 border-red-800">Auto-Failed</Badge>
                  )}
                  {uploaded && (
                    <Badge variant="outline" className="text-xs text-green-400 border-green-800">Uploaded</Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCopyPrompt(prompt.sceneId, prompt.prompt)}
                  className="h-7 px-2 text-xs shrink-0"
                >
                  {copiedSceneId === prompt.sceneId ? (
                    <><Check className="mr-1 h-3 w-3" />Copied</>
                  ) : (
                    <><Copy className="mr-1 h-3 w-3" />Copy</>
                  )}
                </Button>
              </div>

              {/* Prompt text */}
              <Textarea
                value={prompt.prompt}
                readOnly
                className="text-xs min-h-[50px] resize-none bg-muted/30 border-border"
              />

              {/* Upload zone */}
              {(!autoResult || autoResult.status === "failed") && (
                <div className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-border bg-muted/20 hover:bg-muted/40 transition-colors px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground">
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : uploaded ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    <span className="truncate">
                      {isUploading ? "Uploading..." : uploaded ? uploaded.fileName : `Upload ${prompt.mediaType === "video-clip" ? "MP4" : "PNG/JPG"}`}
                    </span>
                    <input
                      type="file"
                      accept={prompt.mediaType === "video-clip" ? "video/mp4" : "image/png,image/jpeg"}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(prompt.sceneId, prompt.mediaType, file);
                      }}
                      disabled={isUploading}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </div>
          );
        })}

        {/* Clip arrangement */}
        {prompts.length > 1 && (
          <div className="rounded-md border border-border bg-card/50 p-4 space-y-2">
            <p className="font-medium text-sm text-foreground">Clip Arrangement</p>
            <p className="text-xs text-muted-foreground">Use arrows to reorder clips in the final video</p>
            <div className="space-y-1">
              {clipOrder.map((order, index) => {
                const prompt = prompts.find((p) => p.order === order);
                if (!prompt) return null;
                return (
                  <div
                    key={prompt.sceneId}
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-2"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                    <span className="text-xs text-muted-foreground w-5 tabular-nums">{index + 1}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">Scene {prompt.order}</Badge>
                    <span className="text-xs flex-1 truncate text-muted-foreground">
                      {prompt.prompt.slice(0, 60)}...
                    </span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        disabled={index === 0}
                        onClick={() => moveClip(index, index - 1)}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        disabled={index === clipOrder.length - 1}
                        onClick={() => moveClip(index, index + 1)}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ApprovalDialog>
  );
}
