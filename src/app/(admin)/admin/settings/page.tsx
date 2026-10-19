import { requireOwner } from "@/lib/auth/session";
import { getSettings } from "@/lib/catalog";

import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  await requireOwner();
  const settings = await getSettings();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsForm initial={settings} />
    </div>
  );
}
