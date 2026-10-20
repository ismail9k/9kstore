import type { Metadata } from "next";

import "@/app/globals.css";

import { Toaster } from "@/components/ui/sonner";
import { getSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/catalog";

import { AdminHeader } from "./admin-header";

export const metadata: Metadata = {
  title: "9k Store",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const loggedIn = await getSession();
  const settings = loggedIn ? await getSettings() : null;

  return (
    <html lang="en" dir="ltr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {settings ? <AdminHeader storeName={settings.storeName} /> : null}
        <main className="mx-auto w-full max-w-5xl px-6 py-8">{children}</main>
        {/* No dark mode: pin the toasts to light instead of following the OS. */}
        <Toaster theme="light" />
      </body>
    </html>
  );
}
