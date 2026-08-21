import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BOT =
  /bot|crawl|spider|slurp|bingpreview|playwright|headless|lighthouse|preview-thumbnail/i;

function countryFrom(headers: Headers): string {
  const raw =
    headers.get("x-vercel-ip-country") ||
    headers.get("cf-ipcountry") ||
    headers.get("x-country-code") ||
    "";
  const c = raw.trim().toUpperCase().slice(0, 2);
  return /^[A-Z]{2}$/.test(c) ? c : "";
}

function referrerHost(raw: string): string {
  const t = raw.trim().slice(0, 300);
  if (!t) return "";
  try {
    const u = new URL(t);
    return u.hostname.replace(/^www\./, "").slice(0, 80);
  } catch {
    return "";
  }
}

function cleanPath(raw: string): string | null {
  if (!raw.startsWith("/") || raw.includes("://") || raw.includes("\\")) return null;
  const p = raw.split("?")[0]!.split("#")[0]!.slice(0, 120);
  if (p.startsWith("/__grok") || p.startsWith("/api") || p === "/visiteurs") return null;
  return p || "/";
}

export const pingVisit = createServerFn({ method: "POST" })
  .validator(
    z.object({
      path: z.string().max(200),
      referrer: z.string().max(400),
      session: z.string().max(64),
    }),
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const ua = req?.headers.get("user-agent") || "";
    if (BOT.test(ua)) return { ok: false as const };
    const path = cleanPath(data.path);
    const session = data.session.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    if (!path || session.length < 8) return { ok: false as const };
    const country = req ? countryFrom(req.headers) : "";
    let referrer = referrerHost(data.referrer);
    const host = req ? (req.headers.get("host") || "").replace(/^www\./, "") : "";
    if (referrer && host && (referrer === host || host.endsWith(referrer) || referrer.endsWith(host))) {
      referrer = "";
    }
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into visits (path, referrer, country, session)
      values (${path}, ${referrer}, ${country}, ${session})
    `;
    return { ok: true as const };
  });

export type VisitStats = {
  vues: number;
  sessions: number;
  vues7: number;
  vuesJour: number;
  jours: Array<{ jour: string; n: number }>;
  pages: Array<{ path: string; n: number }>;
  origines: Array<{ referrer: string; n: number }>;
  pays: Array<{ country: string; n: number }>;
};

export const visitStats = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const [tot] = await sql<{ vues: number; sessions: number }>`
    select count(*)::int as vues, count(distinct session)::int as sessions from visits
  `;
  const [w] = await sql<{ n: number }>`
    select count(*)::int as n from visits where created_at > now() - interval '7 days'
  `;
  const [d] = await sql<{ n: number }>`
    select count(*)::int as n from visits where created_at > now() - interval '1 day'
  `;
  const jours = await sql<{ jour: string; n: number }>`
    select to_char(created_at, 'YYYY-MM-DD') as jour, count(*)::int as n
    from visits
    where created_at > now() - interval '14 days'
    group by 1
    order by 1
  `;
  const pages = await sql<{ path: string; n: number }>`
    select path, count(*)::int as n from visits group by path order by n desc limit 8
  `;
  const origines = await sql<{ referrer: string; n: number }>`
    select referrer, count(*)::int as n from visits group by referrer order by n desc limit 8
  `;
  const pays = await sql<{ country: string; n: number }>`
    select country, count(*)::int as n from visits group by country order by n desc limit 8
  `;
  return {
    vues: tot?.vues ?? 0,
    sessions: tot?.sessions ?? 0,
    vues7: w?.n ?? 0,
    vuesJour: d?.n ?? 0,
    jours,
    pages,
    origines,
    pays,
  } satisfies VisitStats;
});
