"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** Opacity fade only (200 ms). Escape closes. The only surface with a shadow. */
export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-950/80 data-[state=open]:animate-[tl-fade_200ms_cubic-bezier(.2,.8,.2,1)]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[calc(100%-40px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-line bg-ink-900 p-6 shadow-[0_4px_16px_rgba(0,0,0,.5)] focus-visible:outline-none data-[state=open]:animate-[tl-fade_200ms_cubic-bezier(.2,.8,.2,1)]",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-[20px] font-medium", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("mt-2 text-[15px] text-mute", className)} {...props} />;
}
