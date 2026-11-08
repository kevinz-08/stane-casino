import Link from 'next/link';

export default function LobbyPage() {
  // TODO(fase-3): live tables list
  // TODO(fase-4): slots catalogue
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-3xl font-bold">Lobby</h1>
      <p className="mt-2 text-sm opacity-70">Solo fichas virtuales. Sin dinero real.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/blackjack"
          className="rounded-xl bg-emerald-950/60 p-6 ring-1 ring-emerald-800/50 hover:ring-emerald-500"
        >
          <h2 className="text-xl font-semibold">Blackjack</h2>
          <p className="mt-1 text-sm opacity-70">6 mazos, 3:2, verificable ronda a ronda.</p>
        </Link>
        <Link
          href="/fairness"
          className="rounded-xl bg-white/5 p-6 ring-1 ring-white/10 hover:ring-white/30"
        >
          <h2 className="text-xl font-semibold">Juego justo</h2>
          <p className="mt-1 text-sm opacity-70">Tus seeds, rotación y verificador de rondas.</p>
        </Link>
      </div>
    </main>
  );
}
