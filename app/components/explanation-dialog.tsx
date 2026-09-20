import { useRef, type ReactNode, type RefObject } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ExplanationDialogProps = {
  id: string;
  title: string;
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  dialogRef?: RefObject<HTMLDivElement | null>;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  closeButtonLabel?: string;
  children: ReactNode;
};

export function ExplanationDialog({
  id,
  title,
  open,
  onOpenChange,
  onClose,
  closeButtonLabel = "Sulje selite",
  children,
}: ExplanationDialogProps) {
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const handleOpenChange = (nextOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(nextOpen);
      return;
    }

    if (!nextOpen) onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        id={id}
        showCloseButton={false}
        initialFocus={closeButtonRef}
        finalFocus
        className="max-h-[90vh] max-w-2xl overflow-y-auto p-6 sm:p-8"
      >
        <DialogHeader>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Sähköhetki
          </p>
          <DialogTitle id={titleId} className="mt-2 text-2xl">
            {title}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription
          id={descriptionId}
          render={<div />}
          className="mt-6 flex flex-col gap-4 text-sm leading-7"
        >
          {children}
        </DialogDescription>
        <DialogClose
          ref={closeButtonRef}
          render={
            <Button
              variant="ghost"
              size="icon-lg"
              className="absolute top-2 right-2"
              aria-label={closeButtonLabel}
            />
          }
        >
          <XIcon aria-hidden="true" />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
