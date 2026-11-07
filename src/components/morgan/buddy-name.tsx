import { useState } from "react";
import type { Json } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_BUDDY, buddyName } from "@/lib/morgan/areeba";

/** First-use popup that asks only for the mini bot's name (never the user's own name). */
export function BuddyNamePrompt({ personality, onSave }: { personality: Json; onSave: (p: Json) => void }) {
  const current = personality && typeof personality === "object" && !Array.isArray(personality) ? personality : {};
  const hasName = typeof (current as { buddy_name?: unknown }).buddy_name === "string";
  const [value, setValue] = useState("");
  const [done, setDone] = useState(false);
  if (hasName || done) return null;
  const save = (raw: string) => {
    setDone(true);
    onSave({ ...current, buddy_name: buddyName(raw) });
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) save(DEFAULT_BUDDY); }}>
      <DialogContent className="max-w-sm">
        <DialogTitle>What should we call your little side buddy? ✨</DialogTitle>
        <DialogDescription>Give it a cute name (this is just for the mini bot, not your real name).</DialogDescription>
        <form
          className="mt-2 flex flex-col gap-3"
          onSubmit={(e) => { e.preventDefault(); if (value.trim()) save(value); }}
        >
          <Input autoFocus maxLength={20} value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. Mochi, Pixel, Spark…" aria-label="Mini bot name" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => save(DEFAULT_BUDDY)}>Keep “{DEFAULT_BUDDY}”</Button>
            <Button type="submit" disabled={!value.trim()}>Save name</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
