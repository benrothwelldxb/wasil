import { ArrowRight } from "lucide-react";
import { SectionCard } from "@/components/common";
import { useHorizonPlan } from "../useHorizonPlan";

const WINDOW_LABEL: Record<number, string> = {
  1: "This week",
  3: "Next 3",
  5: "Next 5",
  8: "Long term (8)",
};

/**
 * The best single transfer across every horizon side by side, so a short-term
 * punt is obvious next to a long-term hold.
 */
export function HorizonPlan() {
  const { squadReady, entries } = useHorizonPlan();
  if (!squadReady || entries.length === 0) return null;

  return (
    <SectionCard
      title="Best transfer by horizon"
      description="The same engine, run over each planning window — spot moves that only win this week."
      className="mt-6"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2 text-left font-semibold">Horizon</th>
              <th className="py-2 text-left font-semibold">Best move</th>
              <th className="py-2 text-right font-semibold">Gain</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ window, move }) => {
              const out = move?.out[0];
              const inc = move?.in[0];
              return (
                <tr key={window} className="border-t">
                  <td className="py-2.5 font-medium">{WINDOW_LABEL[window]}</td>
                  <td className="py-2.5">
                    {out && inc ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">
                          {out.player.webName}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{inc.player.webName}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        No move beats holding
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">
                    {move && move.net > 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        +{move.net.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
