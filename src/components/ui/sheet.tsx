"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const SheetContext = React.createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
} | null>(null);

function Sheet({ open, onOpenChange, children }: SheetProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  return (
    <SheetContext.Provider value={{ open: isOpen, setOpen: setIsOpen }}>
      {children}
    </SheetContext.Provider>
  );
}

function SheetTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const ctx = React.useContext(SheetContext);
  if (!ctx) throw new Error("SheetTrigger must be inside Sheet");

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement, {
      onClick: () => ctx.setOpen(true),
    });
  }
  return <button onClick={() => ctx.setOpen(true)}>{children}</button>;
}

function SheetContent({
  children,
  className,
  side = "right",
}: {
  children: React.ReactNode;
  className?: string;
  side?: "left" | "right" | "top" | "bottom";
}) {
  const ctx = React.useContext(SheetContext);
  if (!ctx) throw new Error("SheetContent must be inside Sheet");
  if (!ctx.open) return null;

  const sideClasses = {
    left: "inset-y-0 left-0 h-full w-3/4 max-w-sm",
    right: "inset-y-0 right-0 h-full w-3/4 max-w-sm",
    top: "inset-x-0 top-0 h-auto w-full",
    bottom: "inset-x-0 bottom-0 h-auto w-full",
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={() => ctx.setOpen(false)} />
      <div className={cn("fixed z-50 bg-background p-6 shadow-lg", sideClasses[side], className)}>
        {children}
      </div>
    </>
  );
}

export { Sheet, SheetTrigger, SheetContent };