import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UseSquadResult } from "../useSquad";

interface ValidationPanelProps {
  squad: UseSquadResult;
}

/**
 * Live validation feedback: hard-rule violations (errors) and outstanding
 * requirements (todos). When the squad is complete and legal it shows an
 * all-clear.
 */
export function ValidationPanel({ squad }: ValidationPanelProps) {
  if (squad.isComplete) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/5 p-3 text-sm text-success">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Your squad is complete and follows every FPL rule.
      </div>
    );
  }

  if (squad.issues.length === 0) {
    return null;
  }

  const errors = squad.issues.filter((i) => i.level === "error");
  const todos = squad.issues.filter((i) => i.level === "todo");

  return (
    <ul className="space-y-1.5 text-sm">
      {errors.map((issue, i) => (
        <li
          key={`err-${i}`}
          className="flex items-center gap-2 text-destructive"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{issue.message}</span>
        </li>
      ))}
      {todos.map((issue, i) => (
        <li
          key={`todo-${i}`}
          className={cn("flex items-center gap-2 text-muted-foreground")}
        >
          <Circle className="h-3.5 w-3.5 shrink-0" />
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}
