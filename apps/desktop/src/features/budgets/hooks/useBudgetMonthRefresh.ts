import { useEffect, useRef } from "react";
import { currentMonthLabel } from "../../../shared/financeUi";

/** Refresh a changed calendar month, including when a sleeping window becomes active. */
export function useBudgetMonthRefresh(options: {
  month?: string;
  busy: boolean;
  onRefresh: () => Promise<void>;
}) {
  const latest = useRef(options);
  const check = useRef<() => void>(() => {});
  latest.current = options;

  useEffect(() => {
    let running = false;
    let active = true;
    check.current = () => {
      const state = latest.current;
      if (running || state.busy || !state.month || document.hidden || state.month === currentMonthLabel()) return;
      running = true;
      // The workspace reports failures; the next timer or focus retries without overlapping requests.
      void Promise.resolve().then(() => active ? state.onRefresh() : undefined)
        .catch(() => {}).finally(() => { running = false; });
    };
    const onWake = () => check.current();
    const timer = window.setInterval(onWake, 60_000);
    window.addEventListener("focus", onWake);
    window.addEventListener("pageshow", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("pageshow", onWake);
      document.removeEventListener("visibilitychange", onWake);
      check.current = () => {};
    };
  }, []);

  useEffect(() => { check.current(); }, [options.month, options.busy]);
}
