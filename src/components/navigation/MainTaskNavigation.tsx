import { t } from "../../i18n";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { TaskNavigationButton } from "./TaskNavigationButton";
import { MainTaskMenu } from "./MainTaskMenu";
import type { MapLayoutDirection } from "../../core/view-options";
import type { mainTaskNavigation } from "./main-tasks";
import type { ReactNode } from "react";
import "./styles.css";
type Props = {
    model: ReturnType<typeof mainTaskNavigation>;
    direction: MapLayoutDirection;
    disabled: boolean;
    onNavigate: (id: string) => void;
    children?: ReactNode;
};
export function MainTaskNavigation({ model, direction, disabled, onNavigate, children }: Props) {
    const { roots, index, previous, next } = model;
    if (!roots.length)
        return <>{children}</>;
    const Previous = direction === "vertical" ? ChevronLeft : ChevronUp;
    const Next = direction === "vertical" ? ChevronRight : ChevronDown;
    const unavailable = disabled || roots.length < 2;
    const status = <MainTaskMenu roots={roots} index={index} disabled={disabled} onNavigate={onNavigate}/>;
    return <nav className={`tm-main-tasks tm-main-tasks-${direction}`} aria-label={t("m212")}>
    {direction === "vertical" ? <div className="tm-main-task-header">{status}{children}</div> : <>{status}{children}</>}
    <TaskNavigationButton label={t("m207")} tip={previous ? t("m208", previous.title) : t("m209")} className="tm-main-task-previous" disabled={unavailable} onNavigate={() => previous && onNavigate(previous.id)}><Previous size={28}/></TaskNavigationButton>
    <TaskNavigationButton label={t("m210")} tip={next ? t("m211", next.title) : t("m209")} className="tm-main-task-next" disabled={unavailable} onNavigate={() => next && onNavigate(next.id)}><Next size={28}/></TaskNavigationButton>
  </nav>;
}
