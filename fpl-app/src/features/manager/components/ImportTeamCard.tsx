import { useState } from "react";
import { CheckCircle2, Loader2, Search } from "lucide-react";
import { fetchManagerTeam } from "@/features/fpl";
import { useSquadStore } from "@/features/squad-builder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useManagerStore } from "../store";

/**
 * Connect a real FPL team by Manager ID. Validates the id against the live FPL
 * API, then imports the 15 players so the whole app (scout report, chips,
 * transfers, share card) reflects the user's actual team.
 */
export function ImportTeamCard() {
  const managerId = useManagerStore((s) => s.managerId);
  const managerName = useManagerStore((s) => s.managerName);
  const teamName = useManagerStore((s) => s.teamName);
  const connect = useManagerStore((s) => s.connect);
  const disconnect = useManagerStore((s) => s.disconnect);
  const setPlayers = useSquadStore((s) => s.setPlayers);
  const clearSquad = useSquadStore((s) => s.clear);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = Number(input.trim());
    if (!Number.isInteger(id) || id <= 0) {
      setError("Enter your numeric Manager ID (digits only).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const team = await fetchManagerTeam(id);
      setPlayers(team.playerIds);
      connect(team.entryId, team.managerName, team.teamName);
      setInput("");
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("saved a team")
          ? err.message
          : "Couldn't find that team. Double-check your Manager ID and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (managerId !== null) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-[hsl(var(--brand-green))]" />
          <span>
            Connected as <strong>{managerName}</strong>
            {teamName ? ` · ${teamName}` : ""} (ID {managerId}). Your real team
            syncs automatically.
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            disconnect();
            clearSquad();
          }}
        >
          Disconnect team
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Find your <strong>Manager ID</strong> in your team's URL on the FPL site:{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          fantasy.premierleague.com/entry/<b>1234567</b>/event/1
        </code>
      </p>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          inputMode="numeric"
          placeholder="e.g. 1234567"
          aria-label="FPL Manager ID"
          className="max-w-[12rem]"
        />
        <Button type="submit" disabled={busy || input.trim() === ""}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Import team
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
