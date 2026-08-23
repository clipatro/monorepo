import { useState, useEffect, useMemo } from "react";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type RunDetails, type RunApproval, type StoryCandidate } from "@/lib/api";
import { usePipelineStore } from "@/stores/pipeline-store";
import { ApprovalDialog } from "./ApprovalDialog";

interface StoryApprovalDialogProps {
  approval: RunApproval;
  run: RunDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StoryApprovalDialog({ approval, run, open, onOpenChange }: StoryApprovalDialogProps) {
  const submitApproval = usePipelineStore((s) => s.submitApproval);
  const [approving, setApproving] = useState(false);

  // Extract story candidates from the generate_candidates step
  const storyCandidates = useMemo(() => {
    const genStep = run.steps.find((s) => s.stepType === "generate_candidates");
    return (genStep?.resultData?.candidates as StoryCandidate[]) ?? [];
  }, [run]);

  // Extract duplicate detection results to show which candidate is "best"
  const dupResults = useMemo(() => {
    const dupStep = run.steps.find((s) => s.stepType === "duplicate_detection");
    return (
      (dupStep?.resultData?.results as Array<{
        candidateIndex: number;
        candidateTitle: string;
        classification: string;
        bestCandidate: boolean;
      }>) ?? []
    );
  }, [run]);

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Auto-select the best candidate when candidates become available
  useEffect(() => {
    if (storyCandidates.length > 0 && selectedIdx === null) {
      const best = dupResults.find((r) => r.bestCandidate);
      setSelectedIdx(best?.candidateIndex ?? 0);
    }
  }, [storyCandidates, dupResults, selectedIdx]);

  const handleApprove = async () => {
    setApproving(true);
    try {
      await submitApproval(approval.id, "approved", undefined);
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

  // No candidates → nothing to review in a dialog.
  // The header will render inline Approve/Reject buttons for this approval.
  if (storyCandidates.length === 0) {
    return null;
  }

  const selected = selectedIdx !== null ? storyCandidates[selectedIdx] : null;

  return (
    <ApprovalDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Review Story Candidates"
      description="Select a candidate to approve, or reject to cancel the run."
      approveLabel="Approve Selected"
      onApprove={handleApprove}
      onReject={handleReject}
      approving={approving}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        {/* Candidate selector tabs */}
        <div className="flex gap-1 flex-wrap">
          {storyCandidates.map((c, i) => {
            const dupInfo = dupResults.find((r) => r.candidateIndex === i);
            return (
              <button
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  selectedIdx === i
                    ? "border-primary bg-secondary text-foreground"
                    : "border-border bg-transparent text-muted-foreground hover:bg-accent",
                )}
              >
                {dupInfo?.bestCandidate && <span className="text-green-400 mr-1">★</span>}
                {c.title}
              </button>
            );
          })}
        </div>

        {/* Selected candidate details */}
        {selected && (
          <div className="rounded-md border border-border bg-card/50 p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold">{selected.title}</h3>
              {dupResults.find((r) => r.candidateIndex === selectedIdx)?.bestCandidate && (
                <Badge variant="outline" className="text-green-400 border-green-800">
                  <Star className="mr-1 h-3 w-3" />
                  Best Match
                </Badge>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Hook</span>
              <p className="text-sm italic">{selected.hook}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Premise</span>
              <p className="text-sm">{selected.premise}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Storyline</span>
              <p className="text-sm">{selected.storyline}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Content Type</span>
                <p className="text-foreground">{selected.contentType}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Emotional Arc</span>
                <p className="text-foreground">{selected.emotionalArc}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Core Idea</span>
                <p className="text-foreground">{selected.corePsychologicalIdea}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Character Role</span>
                <p className="text-foreground">{selected.mainCharacterRole}</p>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Key Events</span>
              <ul className="text-sm list-disc list-inside space-y-0.5">
                {selected.keyEvents.map((e, j) => (
                  <li key={j}>{e}</li>
                ))}
              </ul>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Twist / Resolution</span>
              <p className="text-sm">{selected.twistOrResolution}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Lesson / Takeaway</span>
              <p className="text-sm">{selected.lessonOrTakeaway}</p>
            </div>
          </div>
        )}
      </div>
    </ApprovalDialog>
  );
}
