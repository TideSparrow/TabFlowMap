import { useEffect, useState } from "react";

type InteractionMode = "select" | "pan";
const opposite = (mode: InteractionMode): InteractionMode => mode === "select" ? "pan" : "select";

export function useMapInteraction() {
  const [mode, setMode] = useState<InteractionMode>("pan");
  const [spaceHeld, setSpaceHeld] = useState(false);
  useEffect(() => {
    function release() { setSpaceHeld(false); }
    function keyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [role='menu']"))) return;
      event.preventDefault();
      setSpaceHeld(true);
    }
    function keyUp(event: KeyboardEvent) {
      if (event.code === "Space") release();
    }
    function visibilityChanged() { if (document.hidden) release(); }
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, []);
  return { interactionMode: spaceHeld ? opposite(mode) : mode, toggleInteractionMode: () => setMode(opposite) };
}
