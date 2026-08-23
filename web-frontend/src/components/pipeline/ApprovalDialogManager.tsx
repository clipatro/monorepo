/**
 * ApprovalDialogManager — renders the appropriate approval dialog
 * ONLY when the user explicitly clicks to open one.
 *
 * No auto-popup. The user sees pending approvals as actionable buttons
 * in the run header (rendered by PipelinePage). Clicking a reviewable
 * approval (story/script/image) sets `activeApprovalId` in the store,
 * which causes this component to render the dialog.
 *
 * Approvals without review content (budget) are
 * handled inline in the header — they never reach this manager.
 */

import { usePipelineStore } from "@/stores/pipeline-store";
import { StoryApprovalDialog } from "./StoryApproval";
import { ScriptApprovalDialog } from "./ScriptApproval";
import { ImageApprovalDialog } from "./ImageApproval";

/**
 * Classify an approval as "reviewable" (has content to show in a dialog)
 * vs "simple" (just approve/reject inline, no dialog needed).
 */
export function isReviewableApproval(
  approvalType: string,
  stepType: string | undefined,
): boolean {
  // story_approval has candidates to review
  if (approvalType === "story" && stepType === "story_approval") return true;
  // script_approval has scenes to review
  if (approvalType === "script") return true;
  // image_review has images to review
  if (approvalType === "image") return true;
  // budget has no review content
  return false;
}

/** Human-readable label for an approval, shown on the header button */
export function approvalLabel(
  approvalType: string,
  stepType: string | undefined,
): string {
  if (approvalType === "story" && stepType === "story_approval") return "Review Story";
  if (approvalType === "script") return "Review Script";
  if (approvalType === "image") return "Review Images";
  if (approvalType === "budget") return "Budget Approval";
  return `${approvalType} Approval`;
}

export function ApprovalDialogManager() {
  const selectedRun = usePipelineStore((s) => s.selectedRun);
  const activeApprovalId = usePipelineStore((s) => s.activeApprovalId);
  const setActiveApprovalId = usePipelineStore((s) => s.setActiveApprovalId);

  // If the active approval was decided (no longer pending), close the dialog.
  // This is NOT an auto-open — it just cleans up state when an approval
  // is resolved while the dialog is open.
  if (!selectedRun || !activeApprovalId) return null;

  const approval = selectedRun.approvals.find((a) => a.id === activeApprovalId);
  if (!approval || approval.status !== "pending") {
    // Approval was decided — clear active state so dialog closes
    // Use a microtask to avoid setState during render
    queueMicrotask(() => setActiveApprovalId(null));
    return null;
  }

  const step = selectedRun.steps.find((s) => s.id === approval.stepId);
  const stepType = step?.stepType;

  // Only render dialog for reviewable approvals
  if (!isReviewableApproval(approval.approvalType, stepType)) return null;

  const onOpenChange = (v: boolean) => {
    if (!v) setActiveApprovalId(null);
  };

  if (approval.approvalType === "story" && stepType === "story_approval") {
    return (
      <StoryApprovalDialog
        approval={approval}
        run={selectedRun}
        open={true}
        onOpenChange={onOpenChange}
      />
    );
  }

  if (approval.approvalType === "script") {
    return (
      <ScriptApprovalDialog
        approval={approval}
        run={selectedRun}
        open={true}
        onOpenChange={onOpenChange}
      />
    );
  }

  if (approval.approvalType === "image") {
    return (
      <ImageApprovalDialog
        approval={approval}
        run={selectedRun}
        open={true}
        onOpenChange={onOpenChange}
      />
    );
  }

  return null;
}
