import Link from "next/link";

import { Button } from "@/components/ui/button";

import { logout } from "./actions";

export function AdminHeader({ storeName }: { storeName: string }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-6 px-6 py-3">
        <Link href="/admin" className="font-semibold">
          {storeName}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/admin" className="hover:underline">
            Products
          </Link>
          <Link href="/admin/settings" className="hover:underline">
            Settings
          </Link>
        </nav>
        <form action={logout} className="ml-auto">
          <Button type="submit" variant="ghost">
            Log out
          </Button>
        </form>
      </div>
    </header>
  );
}
