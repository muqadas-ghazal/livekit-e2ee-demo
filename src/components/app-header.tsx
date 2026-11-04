"use client";

import { ShieldCheck } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";

export function AppHeader() {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">Vonage custom E2EE POC</p>
          <p className="text-xs text-muted-foreground">Encoded-frame feasibility tests</p>
        </div>
      </div>
      <ThemeToggle />
    </header>
  );
}
