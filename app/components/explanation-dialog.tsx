import type { ReactNode, RefObject } from "react";
import { Icon } from "./icon";

type ExplanationDialogProps = {
  id: string;
  title: string;
  open: boolean;
  onClose: () => void;
  dialogRef: RefObject<HTMLDivElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
};

export function ExplanationDialog({
  id,
  title,
  open,
  onClose,
  dialogRef,
  closeButtonRef,
  children,
}: ExplanationDialogProps) {
  if (!open) return null;

  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-6 text-slate-200 shadow-2xl shadow-black/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Sahkohetki</p>
            <h2 id={titleId} className="mt-2 text-2xl font-semibold text-white">
              {title}
            </h2>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-slate-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            aria-label="Sulje selite"
            onClick={onClose}
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div id={descriptionId} className="mt-6 space-y-4 text-sm leading-7 text-slate-300">
          {children}
        </div>
      </div>
    </div>
  );
}
