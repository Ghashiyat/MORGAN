import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { createThread } from "@/lib/threads";
import { Composer } from "./composer";
import { pending, useMorgan } from "./context";
import { Orb } from "./orb";
import { StageFrame, Welcome } from "./chat-session";
import { MorganPet } from "./pet";

export function NewChat() {
  const m = useMorgan();
  const navigate = useNavigate();
  return (
    <StageFrame orb={<Orb state={m.activity} size={120} />}>
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4">
        <Welcome />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-4xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8">
        <MorganPet />
        <Composer
          draftKey="new"
          status="ready"
          onStop={() => {}}
          onReadLast={() => {}}
          onSend={(text, files) => {
            void (async () => {
              try {
                const id = await Promise.race([
                  createThread(m.userId),
                  new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
                ]);
                Object.assign(pending, { threadId: id, text, files });
                localStorage.removeItem("morgan:draft:new");
                navigate({ to: "/chat/$threadId", params: { threadId: id } });
              } catch {
                toast.error("Couldn't start a chat. Check your connection and try again.");
              }
            })();
            return true;
          }}
        />
      </div>
    </StageFrame>
  );
}
