import * as Tooltip from "@radix-ui/react-tooltip";
import type { ReactElement } from "react";

export function MapTooltip({ label, children }: { label: string; children: ReactElement }) {
  return <Tooltip.Provider delayDuration={1000} skipDelayDuration={0}>
    <Tooltip.Root disableHoverableContent>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tm-tooltip" side="top" sideOffset={8} collisionPadding={12}>
          {label}<Tooltip.Arrow className="tm-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  </Tooltip.Provider>;
}
