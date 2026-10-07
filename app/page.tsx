import { PomotatoTimer } from "@/components/PomotatoTimer";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-4 py-12 sm:px-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Pomotato</h1>
        <p className="mt-1 text-sm text-stone-600">A cozy focus timer.</p>
      </div>
      <PomotatoTimer />
    </main>
  );
}
