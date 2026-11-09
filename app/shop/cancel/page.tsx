import Link from "next/link";

export default function Cancelled() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
      <div className="text-5xl">👋</div>
      <h1 className="mt-4 text-2xl font-semibold">Checkout cancelled</h1>
      <p className="mt-2 text-muted">You weren&apos;t charged, and the merchant pays no ad fee.</p>
      <Link href="/" className="btn btn-ghost mt-6">Back home</Link>
    </div>
  );
}
