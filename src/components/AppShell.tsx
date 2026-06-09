"use client";

import { SettingsProvider } from "@/lib/settings-context";
import type { ReactNode } from "react";

export default function AppShell({ children }: { children: ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>;
}
