export default async function SlotPage({ params }: { params: Promise<{ slotId: string }> }) {
  const { slotId } = await params;
  // TODO(fase-4): PixiJS canvas (add `pixi.js` dependency in that phase)
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Slot {slotId}</h1>
    </main>
  );
}
