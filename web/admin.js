const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const say = (t) => ($("msg").textContent = t || "");
const { SUPABASE_URL, SUPABASE_KEY } = window.APP_CONFIG;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const qrSvg = (txt) => { const q = qrcode(0, "M"); q.addData(txt); q.make(); return q.createSvgTag(4); };
const vid = () => $("venue").value;

async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (session && !session.user.is_anonymous) { $("login").classList.add("hidden"); $("panel").classList.remove("hidden"); loadVenues(); }
}
$("sendLink").onclick = async () => {
  const email = $("email").value.trim(); if (!email) return say("Informe o e-mail.");
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
  say(error ? error.message : "Link enviado. Abra o e-mail neste aparelho.");
};
$("out").onclick = async () => { await sb.auth.signOut(); location.reload(); };

async function loadVenues() {
  const { data: { user } } = await sb.auth.getUser();
  const { data } = await sb.from("venues").select("id,name").eq("owner", user.id).order("created_at");
  $("venue").innerHTML = (data || []).map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join("");
  $("venue").onchange = loadAll; loadAll();
}
async function loadAll() { if (!vid()) return; loadZones(); loadGroups(); loadFlow(); }

$("addVenue").onclick = async () => {
  const name = $("vname").value.trim(); if (!name) return;
  const { error } = await sb.from("venues").insert({ name }); if (error) return say(error.message);
  $("vname").value = ""; loadVenues();
};
$("addZone").onclick = async () => {
  const name = $("zname").value.trim(); if (!name || !vid()) return;
  const { error } = await sb.from("zones").insert({ venue_id: vid(), name, beacon_id: $("zbeacon").value.trim() || null });
  if (error) return say(error.message); $("zname").value = $("zbeacon").value = ""; loadZones();
};
async function loadZones() {
  const { data } = await sb.rpc("owner_zones", { vid: vid() });
  $("zones").innerHTML = (data || []).map((z) =>
    `<div class="row"><div><b>${esc(z.name)}</b><div class="mut">${esc(z.beacon_id || "sem beacon")}</div></div><div style="width:96px">${qrSvg(z.qr_code)}</div></div>`).join("")
    || '<p class="mut">Nenhuma zona.</p>';
}
$("addGroup").onclick = async () => {
  const gname = $("gname").value.trim(); if (!gname || !vid()) return;
  const { error } = await sb.rpc("create_group", { vid: vid(), gname }); if (error) return say(error.message);
  $("gname").value = ""; loadGroups();
};
async function loadGroups() {
  const { data } = await sb.from("groups").select("name,code").eq("venue_id", vid()).order("created_at", { ascending: false });
  $("groups").innerHTML = (data || []).map((g) => `<div class="row"><span>${esc(g.name)}</span><span class="badge">${esc(g.code)}</span></div>`).join("") || '<p class="mut">Nenhum grupo.</p>';
}
async function loadFlow() {
  const { data } = await sb.rpc("zone_counts", { vid: vid() });
  $("flow").innerHTML = (data && data.length) ? data.map((r) => `<div class="row"><span>${esc(r.zone_name)}</span><b>${r.people}</b></div>`).join("")
    : "Sem zonas com 3+ pessoas agora (proteção de anonimato).";
}
setInterval(() => vid() && loadFlow(), 30000);
init();
