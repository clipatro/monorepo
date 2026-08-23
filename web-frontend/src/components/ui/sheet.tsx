import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// === Sheet root with browser back-button support ===
//
// When the sheet opens, a history state is pushed so that pressing
// the browser back button (or mobile swipe-back) closes the sheet
// instead of navigating away. When the sheet closes via any means
// (back button, overlay click, ESC, X button), the extra history
// entry is popped if it hasn't been already.

interface SheetRootProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children?: React.ReactNode;
	modal?: boolean;
}

function SheetRoot({ open, onOpenChange, children, modal = false }: SheetRootProps) {
	// Track whether *we* pushed a history entry so we only pop our own.
	const pushedRef = React.useRef(false);

	React.useEffect(() => {
		if (open && !pushedRef.current) {
			window.history.pushState({ sheet: true }, "");
			pushedRef.current = true;
		}
	}, [open]);

	React.useEffect(() => {
		if (!open && pushedRef.current) {
			// If the back button was used, the popstate already fired and
			// history.back() would go one step too far. Only manually pop
			// if we still have our entry (i.e. the sheet was closed via
			// overlay/ESC/X, not via back button).
			if (window.history.state?.sheet) {
				window.history.back();
			}
			pushedRef.current = false;
		}
	}, [open]);

	React.useEffect(() => {
		const onPopState = () => {
			// Back button pressed while sheet is open → close it.
			// The pushedRef is cleared in the [open] effect above.
			if (pushedRef.current) {
				pushedRef.current = false;
				onOpenChange(false);
			}
		};
		window.addEventListener("popstate", onPopState);
		return () => window.removeEventListener("popstate", onPopState);
	}, [onOpenChange]);

	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={modal}>
			{children}
		</DialogPrimitive.Root>
	);
}

const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

// Plain overlay div — works with modal={false} (Radix's built-in Overlay
// only renders in modal mode). Wrapped in DialogPrimitive.Close so
// clicking it closes the sheet automatically.
const SheetOverlay = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Close asChild>
		<div
			ref={ref}
			className={cn(
				"fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
				className,
			)}
			{...props}
		/>
	</DialogPrimitive.Close>
));
SheetOverlay.displayName = "SheetOverlay";

interface SheetContentProps
	extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
	side?: "right" | "left";
	width?: string;
}

const SheetContent = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Content>,
	SheetContentProps
>(
	(
		{ className, children, side = "right", width = "max-w-2xl", ...props },
		ref,
	) => (
		<SheetPortal>
			<SheetOverlay />
			<DialogPrimitive.Content
				ref={ref}
				onPointerDownOutside={(e) => e.preventDefault()}
				className={cn(
					"fixed z-50 flex h-full flex-col gap-0 overflow-y-auto overflow-x-hidden border bg-background shadow-2xl themed-scroll",
					side === "right"
						? "inset-y-0 right-0 border-l sheet-content-right"
						: "inset-y-0 left-0 border-r sheet-content-left",
					width,
					"w-full",
					className,
				)}
				{...props}
			>
				{children}
			</DialogPrimitive.Content>
		</SheetPortal>
	),
);
SheetContent.displayName = DialogPrimitive.Content.displayName;

// Translucent header with close button — matches the main navbar style
const SheetHeader = ({
	className,
	children,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			className,
			"sticky top-0 z-10 flex w-[calc(100%+0.5rem)] shrink-0 flex-row items-start justify-between gap-4 border-b border-white/10 bg-black/70 pl-6 pr-8 py-4 backdrop-blur-2xl",
		)}
		{...props}
	>
		<div className="flex min-w-0 flex-1 flex-col space-y-1.5">
			{children}
		</div>
		<DialogPrimitive.Close className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-white/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
			<X className="h-4 w-4" />
			<span className="sr-only">Close</span>
		</DialogPrimitive.Close>
	</div>
);
SheetHeader.displayName = "SheetHeader";

// Translucent footer to match
const SheetFooter = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			"sticky bottom-0 z-10 flex w-[calc(100%+0.5rem)] shrink-0 flex-col-reverse gap-2 border-t border-white/10 bg-black/70 pl-6 pr-8 py-4 backdrop-blur-xl sm:flex-row sm:justify-end",
			className,
		)}
		{...props}
	/>
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Title
		ref={ref}
		className={cn(
			"text-lg font-semibold leading-tight tracking-tight",
			className,
		)}
		{...props}
	/>
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description
		ref={ref}
		className={cn("text-sm text-muted-foreground", className)}
		{...props}
	/>
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

const SheetBody = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		className={cn("px-6 py-4", className)}
		{...props}
	/>
));
SheetBody.displayName = "SheetBody";

export {
	SheetRoot as Sheet,
	SheetPortal,
	SheetOverlay,
	SheetTrigger,
	SheetClose,
	SheetContent,
	SheetHeader,
	SheetFooter,
	SheetTitle,
	SheetDescription,
	SheetBody,
};
