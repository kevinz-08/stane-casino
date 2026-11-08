export default async function TablePage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  // TODO(fase-3): real-time table over Socket.IO
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Table {tableId}</h1>
    </main>
  );
}
