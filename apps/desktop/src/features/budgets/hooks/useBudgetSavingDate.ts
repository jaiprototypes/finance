import { useEffect, useState } from "react";
import { BudgetTargetPace as TargetPace } from "../domain/BudgetTargetPace";

/** Share one calendar refresh across all target cells, including after sleep. */
export function useBudgetSavingDate(active = true): string {
  const [today, setToday] = useState(TargetPace.today);
  useEffect(() => {
    if (!active) return;
    const refresh = () => setToday(TargetPace.today());
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [active]);
  return today;
}

