const CONSENT_VERSION = "2026-11-v1";
const $ = (id) => document.getElementById(id);
const show = (...ids) => ids.forEach((i) => $(i).classList.remove("hidden"));
const hide = (...ids) => ids.forEach((i) => $(i).classList.add("hidden"));
const say = (t) => ($("msg").textContent = t || "");
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const { SUPABASE_URL, SUPABASE_KEY } = window.APP_CONFIG;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let groupId = null, zones = [], channel = null;

async function init() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  let { data: { session } } = await sb.auth.getSession();
  if (!session) {
    const r = await sb.auth.signInAnonymously(); // ative "Anonymous sign-ins" no Supabase
    if (r.error) return say("Erro de login: " + r.error.message);
  }
  const { data } = await sb.from("consents").select("id").is("revoked_at", null).limit(1);
  if (data && data.length) enter(); else { hide("home", "share", "people", "privacy"); show("consent"); }
}

$("accept").onclick = async () => {
  const { error } = await sb.rpc("give_consent", { v: CONSENT_VERSION });
  if (error) return say(error.message);
  hide("consent"); enter();
};

async function enter() {
  hide("consent"); show("home", "privacy");
  const saved = localStorage.getItem("groupId");
  if (saved) await loadGroup(saved);
}

$("join").onclick = async () => {
  const name = $("name").value.trim(), code = $("code").value.trim();
  if (!name || !code) return say("Informe nome e código.");
  const { data, error } = await sb.rpc("join_group", { c: code, name });
  if (error) return say(error.message);
  localStorage.setItem("groupId", data); say("");
  await loadGroup(data);
};

async function loadGroup(id) {
  const { data: g } = await sb.from("groups").select("id,name,venue_id").eq("id", id).maybeSingle();
  if (!g) { localStorage.removeItem("groupId"); return; }
  groupId = g.id;
  $("groupInfo").textContent = "Grupo atual: " + g.name;
  const z = await sb.from("zones").select("id,name,beacon_id").eq("venue_id", g.venue_id).order("name");
  zones = z.data || [];
  $("zone").innerHTML = zones.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("");
  show("share", "people");
  await refresh();
  if (channel) sb.removeChannel(channel);
  channel = sb.channel("p-" + groupId)
    .on("postgres_changes", { event: "*", schema: "public", table: "presence", filter: `group_id=eq.${groupId}` }, refresh)
    .subscribe();
  setInterval(refresh, 60000); // atualiza expirados
}

async function refresh() {
  if (!groupId) return;
  const [m, p] = await Promise.all([
    sb.from("group_members").select("user_id,display_name").eq("group_id", groupId),
    sb.from("presence").select("user_id,zone_id,updated_at").eq("group_id", groupId),
  ]);
  const pres = Object.fromEntries((p.data || []).map((r) => [r.user_id, r]));
  const zn = Object.fromEntries(zones.map((z) => [z.id, z.name]));
  $("list").innerHTML = (m.data || []).map((u) => {
    const r = pres[u.user_id];
    const where = r ? `<span class="badge">${esc(zn[r.zone_id] || "?")}</span>` : `<span class="mut">não compartilhando</span>`;
    return `<div class="row"><span>${esc(u.display_name)}</span>${where}</div>`;
  }).join("") || '<p class="mut">Ninguém ainda.</p>';
}

async function share(zoneId) {
  const { error } = await sb.rpc("share_position", { gid: groupId, zid: zoneId, minutes: +$("dur").value });
  $("status").textContent = error ? error.message : "Compartilhando com o grupo. Toque em “Parar” quando quiser.";
}
$("send").onclick = () => share($("zone").value);
$("stop").onclick = async () => { await sb.rpc("stop_sharing"); $("status").textContent = "Compartilhamento parado."; refresh(); };

// Bluetooth: o NAVEGADOR mostra um seletor e você escolhe o beacon do LOCAL. Nada é varrido em segundo plano, nem de pessoas.
$("ble").onclick = async () => {
  if (!navigator.bluetooth) return ($("status").textContent = "Seu navegador não suporta Bluetooth Web. Escolha a zona manualmente.");
  try {
    const d = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
    const z = zones.find((x) => x.beacon_id && x.beacon_id === d.name);
    if (!z) return ($("status").textContent = "Esse dispositivo não é um beacon deste local.");
    $("zone").value = z.id; share(z.id);
  } catch { $("status").textContent = "Detecção cancelada."; }
};

$("revoke").onclick = async () => {
  await sb.rpc("revoke_consent"); localStorage.removeItem("groupId");
  hide("home", "share", "people", "privacy"); show("consent"); say("Consentimento revogado e localização removida.");
};
$("wipe").onclick = async () => {
  if (!confirm("Apagar seus dados e sair dos grupos?")) return;
  const { error } = await sb.rpc("delete_my_data");
  if (error) return say(error.message);
  localStorage.clear(); await sb.auth.signOut(); location.reload();
};
init();
