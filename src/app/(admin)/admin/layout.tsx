import type { Metadata } from "next";

import { Toaster } from "@/components/ui/sonner";
import { getSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/catalog";

import { AdminHeader } from "./admin-header";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const loggedIn = await getSession();
  const settings = loggedIn ? await getSettings() : null;

  return (
    <>
      {settings ? <AdminHeader storeName={settings.storeName} /> : null}
      <main className="mx-auto w-full max-w-5xl px-6 py-8">{children}</main>
      {/* No dark mode: pin the toasts to light instead of following the OS. */}
      <Toaster theme="light" />
    </>
  );
}
