import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { pingVisit } from "@/lib/visits";

const SID = "simula.sid";
function sessionId() {
  try {
    let id = sessionStorage.getItem(SID);
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
      sessionStorage.setItem(SID, id);
    }
    return id;
  } catch {
    return "";
  }
}
export function VisitsBeacon() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const last = useRef("");
  useEffect(() => {
    if (!pathname || last.current === pathname) return;
    last.current = pathname;
    const sid = sessionId();
    if (!sid) return;
    void pingVisit({
      data: {
        path: pathname,
        referrer: typeof document !== "undefined" ? document.referrer : "",
        session: sid,
      },
    }).catch(() => {});
  }, [pathname]);
  return null;
}
