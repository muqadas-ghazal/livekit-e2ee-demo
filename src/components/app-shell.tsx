"use client";

import { AppHeader } from "@/components/app-header";
import { ThemeProvider } from "@/components/theme-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AppHeader />
      {children}
    </ThemeProvider>
  );
}
