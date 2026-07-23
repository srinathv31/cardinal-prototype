// Registry renderer — pure presentation only (brief §5b). All values are
// preformatted strings computed server-side; this component renders them
// verbatim and computes nothing. Chrome matches payment-history-table.tsx.

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TransactionTableProps } from "@/lib/registry/schemas";

const CATEGORY_LABEL: Record<TransactionTableProps["rows"][number]["category"], string> = {
  GROCERY: "Grocery",
  DINING: "Dining",
  TRAVEL: "Travel",
  SUBSCRIPTION: "Subscription",
  UTILITIES: "Utilities",
  RETAIL: "Retail",
  FUEL: "Fuel",
  OTHER: "Other",
};

export function TransactionTable({ title, rows, footnote }: TransactionTableProps) {
  const showAccountColumn = rows.some((row) => row.accountLabel);

  return (
    <div className="rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/5">
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Posted</TableHead>
            <TableHead>Merchant</TableHead>
            <TableHead>Category</TableHead>
            {showAccountColumn ? <TableHead>Account</TableHead> : null}
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.postedDate}-${row.merchantName}-${index}`}>
              <TableCell className="font-medium">{row.postedDate}</TableCell>
              <TableCell>{row.merchantName}</TableCell>
              <TableCell>
                <Badge variant="outline">{CATEGORY_LABEL[row.category]}</Badge>
              </TableCell>
              {showAccountColumn ? (
                <TableCell className="text-muted-foreground">
                  {row.accountLabel ?? "—"}
                </TableCell>
              ) : null}
              <TableCell className="text-right font-mono tabular-nums">{row.amount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {footnote ? (
        <p className="mt-3 text-xs text-muted-foreground">{footnote}</p>
      ) : null}
    </div>
  );
}
