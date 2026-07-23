// P0 definition-of-done check: Marcus Webb's payment history pulled through
// the SOE adapter and rendered as plain JSON. Temporary page — delete once P1
// renders real evidence components.

import { getPayments } from "@/lib/soe";

export default async function ScratchPage() {
  const payments = await getPayments("acct-marcus");
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">
        Scratch — Marcus Webb payment history via lib/soe
      </h1>
      <pre className="overflow-x-auto rounded-lg border bg-card p-4 font-mono text-xs leading-relaxed">
        {JSON.stringify(payments, null, 2)}
      </pre>
    </div>
  );
}
