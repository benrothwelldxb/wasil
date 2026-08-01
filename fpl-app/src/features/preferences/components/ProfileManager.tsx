import { useRef, useState } from "react";
import {
  Copy,
  Download,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NEUTRAL_PREFERENCES } from "../profiles";
import { usePreferenceStore } from "../preferenceStore";

/**
 * Profile CRUD + import/export. Built-in profiles are read-only (duplicate to
 * customise); custom profiles can be renamed, deleted, duplicated, and
 * exported. Import validates the file against the preference schema.
 */
export function ProfileManager() {
  const profiles = usePreferenceStore((s) => s.profiles);
  const activeProfileId = usePreferenceStore((s) => s.activeProfileId);
  const setActiveProfile = usePreferenceStore((s) => s.setActiveProfile);
  const createProfile = usePreferenceStore((s) => s.createProfile);
  const renameProfile = usePreferenceStore((s) => s.renameProfile);
  const deleteProfile = usePreferenceStore((s) => s.deleteProfile);
  const duplicateProfile = usePreferenceStore((s) => s.duplicateProfile);
  const exportProfile = usePreferenceStore((s) => s.exportProfile);
  const importProfile = usePreferenceStore((s) => s.importProfile);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleExport = (id: string, name: string) => {
    const json = exportProfile(id);
    if (!json) return;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.toLowerCase().replace(/\s+/g, "-")}.fpl-profile.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const result = importProfile(text);
    setMessage(
      result.ok ? "Profile imported." : `Import failed: ${result.error}`,
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => createProfile("New profile", NEUTRAL_PREFERENCES)}
        >
          <Plus className="h-4 w-4" />
          New profile
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Import
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {message && (
        <p className="text-xs text-muted-foreground">{message}</p>
      )}

      <ul className="space-y-2">
        {profiles.map((profile) => {
          const active = profile.id === activeProfileId;
          return (
            <li
              key={profile.id}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-lg border p-3",
                active && "border-primary ring-1 ring-primary",
              )}
            >
              <button
                type="button"
                onClick={() => setActiveProfile(profile.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{profile.name}</span>
                    {profile.builtIn && (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" />
                        Built-in
                      </Badge>
                    )}
                    {active && <Badge>Active</Badge>}
                  </div>
                </div>
              </button>

              <div className="flex items-center gap-1">
                {!profile.builtIn && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={`Rename ${profile.name}`}
                    onClick={() => {
                      const name = window.prompt("Rename profile", profile.name);
                      if (name) renameProfile(profile.id, name);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label={`Duplicate ${profile.name}`}
                  onClick={() => duplicateProfile(profile.id)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label={`Export ${profile.name}`}
                  onClick={() => handleExport(profile.id, profile.name)}
                >
                  <Download className="h-4 w-4" />
                </Button>
                {!profile.builtIn && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${profile.name}`}
                    onClick={() => {
                      if (window.confirm(`Delete "${profile.name}"?`)) {
                        deleteProfile(profile.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
