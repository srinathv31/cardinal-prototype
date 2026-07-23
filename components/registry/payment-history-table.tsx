// Registry renderer — pure presentation only (brief §5b). All values are
// preformatted strings computed server-side; this component renders them
// verbatim and computes nothing.

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { PaymentHistoryTableProps } from "@/lib/registry/schemas";

type Row = PaymentHistoryTableProps["rows"][number];

const statusBadge: Record<Row["status"], { label: string; className: string }> = {
  POSTED: {
    label: "Posted",
    className: "bg-secondary text-secondary-foreground",
  },
  LATE: {
    label: "Late",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  MISSED: {
    label: "Missed",
    className: "bg-destructive/15 text-destructive",
  },
  SCHEDULED: {
    label: "Scheduled",
    className: "border-border text-muted-foreground",
  },
};

const rowTint: Record<NonNullable<Row["flag"]>, string> = {
  "minimum-only": "bg-warning/5 hover:bg-warning/10",
  missed: "bg-destructive/10 hover:bg-destructive/15",
};

export function PaymentHistoryTable({ title, rows }: PaymentHistoryTableProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/5">
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Due date</TableHead>
            <TableHead>Amount due</TableHead>
            <TableHead>Minimum due</TableHead>
            <TableHead>Amount paid</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Channel</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const badge = statusBadge[row.status];
            return (
              <TableRow
                key={`${row.dueDate}-${index}`}
                className={cn(row.flag && rowTint[row.flag])}
              >
                <TableCell className="font-medium">{row.dueDate}</TableCell>
                <TableCell className="font-mono tabular-nums">
                  {row.amountDue}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {row.minimumDue}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {row.amountPaid}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn(badge.className, "h-6 text-sm")}>
                    {badge.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.channel}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
