import { getStore } from "@netlify/blobs";

const H = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "cache-control": "no-store",
};
const OK = /^https:\/\/[^\s'"()<>\\]+$/;
const FILE = "/api/banner-img/";
const TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX = 4 * 1024 * 1024;
const txt = (m, status) => new Response(m, { status, headers: H });

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  const store = getStore("banners");
  const files = getStore("banner-files");
  const map = (await store.get("all", { type: "json" })) || {};

  // Public: lahat ng banner {discordId: url}
  if (req.method === "GET") return new Response(JSON.stringify(map), { headers: H });
  if (req.method !== "POST") return txt("Method not allowed", 405);

  // Verify kung sino talaga ang naka-login (Discord token)
  const me = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: req.headers.get("authorization") || "" },
  });
  if (!me.ok) return txt("Invalid Discord login", 401);
  const { id } = await me.json();

  // Member lang (ayon sa admin settings) o admin. Kung wala pang naka-assign, bukas muna.
  const mem = (await getStore("members").get("all", { type: "json" })) || {};
  const ids = new Set();
  Object.values(mem).forEach((g) => Object.values(g).forEach((x) => ids.add(x.id)));
  const admins = (process.env.ADMIN_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.size && !ids.has(id) && !admins.includes(id)) return txt("Hindi ka member ng STILL4", 403);

  const dropOld = async () => {
    const old = map[id];
    if (old && old.startsWith(FILE)) await files.delete(old.slice(FILE.length)).catch(() => {});
  };
  const ct = (req.headers.get("content-type") || "").split(";")[0].trim();

  // Upload ng mismong image file
  if (ct.startsWith("image/")) {
    if (!TYPES.includes(ct)) return txt("PNG / JPG / GIF / WEBP lang", 400);
    const buf = await req.arrayBuffer();
    if (buf.byteLength > MAX) return txt("Max 4MB lang", 413);
    const key = `${id}-${Date.now()}`;
    await files.set(key, buf, { metadata: { type: ct } });
    await dropOld();
    map[id] = FILE + key;
  } else {
    // Link o remove
    let body;
    try { body = await req.json(); } catch { return txt("Bad JSON", 400); }
    const url = String(body.banner || "").trim();
    if (url && !(OK.test(url) && url.length < 500)) return txt("Dapat https:// direct image link", 400);
    await dropOld();
    if (url) map[id] = url; else delete map[id];
  }
  // id galing sa token, kaya sarili lang niyang card ang mababago
  await store.setJSON("all", map);
  return new Response(JSON.stringify(map), { headers: H });
};

export const config = { path: "/api/banners" };
