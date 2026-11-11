import Link from "next/link";
import { StatusMark } from "@/components/StatusMark";

export default function Cancelled() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <StatusMark kind="cancelled" />
      <h1 className="display mt-6 text-4xl">Checkout cancelled.</h1>
      <p className="mt-3 text-lg text-muted">You weren&apos;t charged, and the merchant pays no ad fee.</p>
      <Link href="/" className="btn btn-quiet mt-8">Back to ADGENT</Link>
    </div>
  );
}
