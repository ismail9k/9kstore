import { getSettings } from "@/lib/catalog";

export default async function Home() {
  const settings = await getSettings();

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <h1 className="text-3xl font-bold">{settings.storeName}</h1>
    </main>
  );
}
