/**
 * ApprovalDialog — reusable dialog wrapper for all approval types.
 *
 * Provides consistent dialog chrome (header, title, description, scrollable
 * body, footer with Approve/Reject buttons) so each approval component only
 * needs to implement its review content.
 *
 * Usage:
 *   <ApprovalDialog
 *     open={open}
 *     onOpenChange={onOpenChange}
 *     title="Review Story"
 *     description="Select a candidate to approve"
 *     approveLabel="Approve Selected"
 *     onApprove={handleApprove}
 *     onReject={handleReject}
 *     approving={loading}
 *   >
 *     {children}  // review content
 *   </ApprovalDialog>
 */

import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";

interface ApprovalDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	/** Custom approve button label */
	approveLabel?: string;
	/** Custom reject button label */
	rejectLabel?: string;
	/** Hide the reject button (e.g. for informational dialogs) */
	hideReject?: boolean;
	/** Called when the user clicks Approve */
	onApprove: () => void | Promise<void>;
	/** Called when the user clicks Reject */
	onReject?: () => void | Promise<void>;
	/** Shows a spinner on the approve button and disables both */
	approving?: boolean;
	/** Disable the approve button (e.g. when no selection made yet) */
	approveDisabled?: boolean;
	/** Dialog max width class */
	maxWidth?: string;
	children: React.ReactNode;
}

export function ApprovalDialog({
	open,
	onOpenChange,
	title,
	description,
	approveLabel = "Approve",
	rejectLabel = "Reject",
	hideReject = false,
	onApprove,
	onReject,
	approving = false,
	approveDisabled = false,
	maxWidth = "max-w-4xl",
	children,
}: ApprovalDialogProps) {
	return (
		<Dialog open={open} onOpenChange={(v) => !approving && onOpenChange(v)}>
			<DialogContent className={`${maxWidth} max-h-[85vh] flex flex-col`}>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description && <DialogDescription>{description}</DialogDescription>}
				</DialogHeader>

				{/* Scrollable review content */}
				<div className="flex-1 overflow-y-auto pr-1 -mr-1">{children}</div>

				{/* Footer with action buttons */}
				<DialogFooter className="border-t pt-4 mt-2">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={approving}
					>
						Cancel
					</Button>
					{!hideReject && onReject && (
						<Button
							variant="destructive"
							onClick={onReject}
							disabled={approving}
						>
							<XCircle className="mr-1.5 h-4 w-4" />
							{rejectLabel}
						</Button>
					)}
					<Button onClick={onApprove} disabled={approving || approveDisabled}>
						{approving ? (
							<Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
						) : (
							<CheckCircle2 className="mr-1.5 h-4 w-4" />
						)}
						{approveLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
