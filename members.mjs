import { getStore } from "@netlify/blobs";

const H = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "cache-control": "no-store",
};
const GROUPS = { lead: 1, yearner: 8, loners: 8, missers: 8 };
const txt = (m, status) => new Response(m, { status, headers: H });
const admins = () => (process.env.ADMIN_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

async function whoami(req) {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const r = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: auth } });
  return r.ok ? (await r.json()).id : null;
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  const store = getStore("members");
  const map = (await store.get("all", { type: "json" })) || {};
  const id = await whoami(req);
  const isAdmin = !!id && admins().includes(id);

  // Public: assignments {group:{slot:{id,role}}} + kung admin ba ang naka-login
  if (req.method === "GET") return new Response(JSON.stringify({ map, admin: isAdmin }), { headers: H });
  if (req.method !== "POST") return txt("Method not allowed", 405);
  if (!id) return txt("Invalid Discord login", 401);
  if (!isAdmin) return txt("Admin lang ang pwede dito (ADMIN_IDS)", 403);

  let b;
  try { b = await req.json(); } catch { return txt("Bad JSON", 400); }
  const max = GROUPS[b.group];
  const slot = Number(b.slot);
  if (!max || !Number.isInteger(slot) || slot < 1 || slot > max) return txt("Maling group o slot", 400);
  const mid = String(b.id || "").trim();
  if (mid && !/^\d{15,25}$/.test(mid)) return txt("Maling Discord ID", 400);
  const role = String(b.role || "").replace(/[<>"'`\\]/g, "").trim().slice(0, 24);

  if (mid) {
    // kung nasa ibang slot na ang ID na ito, ililipat
    for (const g of Object.keys(map)) for (const s of Object.keys(map[g])) if (map[g][s].id === mid) delete map[g][s];
    (map[b.group] ||= {})[slot] = { id: mid, role };
  } else if (map[b.group]) {
    delete map[b.group][slot];
  }
  await store.setJSON("all", map);
  return new Response(JSON.stringify({ map, admin: true }), { headers: H });
};

export const config = { path: "/api/members" };
