const UFS = {
  ac: "Acre", al: "Alagoas", ap: "Amapá", am: "Amazonas", ba: "Bahia", ce: "Ceará", df: "Distrito Federal",
  es: "Espírito Santo", go: "Goiás", ma: "Maranhão", mt: "Mato Grosso", ms: "Mato Grosso do Sul", mg: "Minas Gerais",
  pr: "Paraná", pb: "Paraíba", pa: "Pará", pe: "Pernambuco", pi: "Piauí", rj: "Rio de Janeiro", rn: "Rio Grande do Norte",
  rs: "Rio Grande do Sul", ro: "Rondônia", rr: "Roraima", sc: "Santa Catarina", se: "Sergipe", sp: "São Paulo", to: "Tocantins",
};
const CARGO = { 1: "Presidente", 3: "Governador", 5: "Senador", 6: "Deputado Federal", 7: "Deputado Estadual", 8: "Deputado Distrital" };
const cargosDe = (uf) => (uf === "br" ? ["1"] : uf === "df" ? ["1", "3", "5", "6", "8"] : ["1", "3", "5", "6", "7"]);
const FAV_PADRAO = [
  { id: "mg", nome: "Minas Gerais" },
  { id: "mg:47333", nome: "Juiz de Fora - MG" },
  { id: "mg:40878", nome: "Argirita - MG" },
];
const ABAS = [{ id: "inicio", nome: "Início" }, { id: "eleitos", nome: "Eleitos" }, { id: "explorar", nome: "Explorar" }, { id: "news", nome: "Notícias" }];
const DEPUTADOS = ["6", "7", "8"];
const RESUMO_MIN = 10; // deputados: um resumo a cada 10 minutos, em vez de aviso a cada mudança
const sa = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase(); // sem acento e minúsculo
const PASSO = 30;

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString("pt-BR");
const pct = (n) => Number(n).toFixed(2).replace(".", ",") + "%";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const ler = (k, pad) => { try { return JSON.parse(localStorage.getItem(k)) ?? pad; } catch { return pad; } };
const ufDe = (id) => id.split(":")[0];

// Nome curto para legenda: tira títulos (Professor, Dr., Juiz...) e fica com a primeira palavra.
const TITULOS = /^(prof\.?|professor|professora|dr\.?|dra\.?|escritor|juiz|juíz|cabo|sargento|sgt\.?|pastor|pastora|delegado|delegada|coronel|veterinário|capitão|major|doutor|doutora)$/i;
const primeiroNome = (n) => { const p = n.split(" ").filter(Boolean); while (p.length > 1 && TITULOS.test(p[0])) p.shift(); return p[0]; };

// Foto oficial do candidato (hospedada pelo TSE). Presidente fica na pasta "br"; os demais, na do estado.
const SEM_FOTO = "this.onerror=null;this.src='/icons/sem-foto.svg'";
const foto = (cargo, uf, sq, cls = "") =>
  `<img class="foto ${cls}" loading="lazy" alt="" onerror="${SEM_FOTO}" src="https://resultados.tse.jus.br/oficial/ele2026/${cargo === "1" ? "6257" : "6259"}/fotos/${cargo === "1" ? "br" : uf}/${sq}.jpeg">`;

let aba = "inicio", restante = 0, ultimaOk = null, buscando = false, limite = PASSO;
let favoritos = ler("favoritos2", FAV_PADRAO);
let avisos = ler("avisos", false);
let lideresAnt = ler("lideres2", {});
let painel = {};                      // painel[idLocal] = { nome, cargos: {1: {...}} }
let exp = ler("exp", { uf: "mg", mun: "", munNome: "", cargo: "6" });
let expDados = null, expErro = false, munCache = {};
let elei = ler("elei", { uf: "mg" }), eleiDados = null, eleiAbertos = new Set(["1", "3", "5"]);
let ultimoResumo = ler("ultimoResumo", 0), lideresResumo = ler("lideresResumo", {});

// ---------- atualização: a cada 60 segundos (economiza o limite de uso da hospedagem) ----------
const intervalo = () => 60;

// ---------- navegação ----------
$("tabs").innerHTML = ABAS.map((a) => `<button role="tab" data-id="${a.id}">${a.nome}</button>`).join("");
$("tabs").onclick = (e) => { const b = e.target.closest("button"); if (b) irPara(b.dataset.id); };
function irPara(id) {
  aba = id; limite = PASSO;
  document.querySelectorAll("#tabs button").forEach((x) => x.setAttribute("aria-selected", x.dataset.id === id));
  window.scrollTo(0, 0);
  if (id === "explorar") carregarExplorar();
  if (id === "eleitos") carregarEleitos();
  desenhar();
}

// ---------- busca de dados ----------
const api = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); };

async function atualizar() {
  if (buscando) return;
  buscando = true;
  const ids = ["br", ...favoritos.map((f) => f.id)];
  try {
    const j = await api(`/api/painel?locais=${encodeURIComponent(ids.join(","))}&top=12`);
    for (const l of j.locais) {
      const cargos = {};
      for (const c of l.cargos) if (!c.erro) { cargos[c.cargo] = c; verificarLideranca(l, c); }
      painel[l.id] = { nome: l.nome, cargos };
    }
    ultimaOk = new Date();
  } catch {}
  resumoDeputados();
  if (aba === "explorar") await carregarExplorar(true);
  if (aba === "eleitos") await carregarEleitos(true);
  buscando = false;
  restante = intervalo();
  desenhar();
}

async function carregarExplorar(silencioso) {
  const id = exp.mun ? `${exp.uf}:${exp.mun}` : exp.uf;
  const ok = cargosDe(exp.uf);
  if (!ok.includes(exp.cargo)) exp.cargo = ok[ok.length - 1] === "8" && exp.cargo === "7" ? "8" : ok.includes("6") ? "6" : "1";
  try {
    expDados = await api(`/api/resultados?local=${encodeURIComponent(id)}&cargo=${exp.cargo}`);
    expErro = false;
  } catch { expDados = null; expErro = true; }
  if (!silencioso) desenhar();
}

async function carregarMunicipios(uf) {
  if (uf === "br" || munCache[uf]) return;
  try { munCache[uf] = await api(`/api/municipios?uf=${uf}`); desenhar(); } catch {}
}

// ---------- liderança + avisos ----------
const lideres = (c) => c.top.slice(0, c.vagas <= 2 ? c.vagas : 1);
const idDe = (c) => `${c.n}|${c.nome}`;

function verificarLideranca(local, c) {
  const top = lideres(c);
  if (!top.length || top[0].votos <= 0) return; // apuração ainda não começou
  const chave = `${local.id}:${c.cargo}`;
  const novo = top.map(idDe), ant = lideresAnt[chave];
  lideresAnt[chave] = novo;
  guardar("lideres2", lideresAnt);
  if (DEPUTADOS.includes(c.cargo)) return; // deputados mudam muito: entram no resumo periódico
  if (!ant || ant.join() === novo.join()) return;
  const titulo = `🔔 ${CARGO[c.cargo]} · ${local.nome}`;
  const texto = top.length === 1
    ? `${top[0].nome} (${top[0].partido}) assumiu a liderança com ${fmt(top[0].votos)} votos, passando ${ant[0].split("|")[1]}.`
    : `Mudança entre os líderes: ${top.map((x) => `${x.nome} (${fmt(x.votos)})`).join(" e ")}.`;
  avisar(titulo, texto);
}

// A cada RESUMO_MIN minutos, um único aviso com o líder de cada cargo de deputado nos favoritos.
function resumoDeputados() {
  if (!avisos || Date.now() - ultimoResumo < RESUMO_MIN * 60e3) return;
  const linhas = [];
  for (const f of favoritos) {
    const partes = [];
    for (const cg of DEPUTADOS) {
      const c = painel[f.id]?.cargos[cg];
      const l = c?.top[0];
      if (!l || l.votos <= 0) continue;
      const mudou = lideresResumo[`${f.id}:${cg}`] && lideresResumo[`${f.id}:${cg}`] !== idDe(l);
      lideresResumo[`${f.id}:${cg}`] = idDe(l);
      partes.push(`${cg === "6" ? "Fed" : cg === "7" ? "Est" : "Dist"}: ${l.nome} (${fmt(l.votos)})${mudou ? " ↺" : ""}`);
    }
    if (partes.length) linhas.push(`${painel[f.id].nome} → ${partes.join(" · ")}`);
  }
  if (!linhas.length) return; // apuração ainda não começou
  ultimoResumo = Date.now();
  guardar("ultimoResumo", ultimoResumo); guardar("lideresResumo", lideresResumo);
  avisar("📊 Deputados · atualização", linhas.join("\n") + "\n↺ = mudou de líder desde o último resumo");
}

function avisar(titulo, texto) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<b>${esc(titulo)}</b>${esc(texto)}`;
  $("toasts").appendChild(t);
  while ($("toasts").children.length > 3) $("toasts").firstChild.remove();
  setTimeout(() => t.remove(), 12000);
  t.onclick = () => t.remove();
  if (!avisos) return;
  try { navigator.vibrate?.([200, 100, 200]); } catch {}
  bipe();
  if ("Notification" in window && Notification.permission === "granted") {
    const op = { body: texto, icon: "/icons/icon-192.png", badge: "/icons/favicon-32.png", tag: titulo };
    navigator.serviceWorker?.ready.then((reg) => reg.showNotification(titulo, op)).catch(() => { try { new Notification(titulo, op); } catch {} });
  }
}

let audio;
function bipe() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    [880, 1175].forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = f; o.connect(g); g.connect(audio.destination);
      const t0 = audio.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.2, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
      o.start(t0); o.stop(t0 + 0.17);
    });
  } catch {}
}

function pintarSino() {
  const b = $("avisos");
  b.setAttribute("aria-pressed", avisos);
  b.firstChild.textContent = avisos ? "🔔" : "🔕";
  b.lastChild.textContent = avisos ? "Avisos ligados" : "Avisos";
}
$("avisos").onclick = async () => {
  if (avisos) { avisos = false; guardar("avisos", false); return pintarSino(); }
  let perm = "default";
  if ("Notification" in window) perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  avisos = true; guardar("avisos", true); pintarSino(); bipe();
  avisar("Avisos ligados", perm === "granted"
    ? "Você será avisado sempre que mudar a liderança nos seus favoritos e na Presidência. Mantenha esta página aberta."
    : "Notificações do sistema estão bloqueadas, mas você verá os avisos na tela, com som e vibração. Mantenha esta página aberta.");
};

// ---------- favoritos ----------
const idExp = () => (exp.mun ? `${exp.uf}:${exp.mun}` : exp.uf);
const nomeExp = () => (exp.uf === "br" ? "Brasil" : exp.mun ? `${exp.munNome} - ${exp.uf.toUpperCase()}` : UFS[exp.uf]);
function alternarFavorito(id, nome) {
  favoritos = favoritos.some((f) => f.id === id) ? favoritos.filter((f) => f.id !== id) : [...favoritos, { id, nome }];
  guardar("favoritos2", favoritos);
  desenhar();
  atualizar();
}

// ---------- desenho ----------
const barra = (p) => `<div class="bar"><i style="width:${p}%"></i></div>`;

function linhasTop(c, n, uf) {
  const maior = c.top[0]?.votos || 1;
  return c.top.slice(0, n).map((x, i) => `
    <div class="cand compacto${x.eleito ? " eleito" : ""}${i === 0 && x.votos > 0 ? " lider1" : ""}">
      <i class="fill" style="width:${Math.round((x.votos / maior) * 100)}%"></i>
      ${foto(c.cargo, uf, x.sq)}
      <div><div class="nome">${esc(x.nome)}${x.eleito ? '<span class="tag">ELEITO</span>' : ""}</div><div class="sub"><b>${esc(x.n)}</b> · ${esc(x.partido)}</div></div>
      <div class="votos">${pct(x.pct)}<small>${fmt(x.votos)} votos</small></div>
    </div>`).join("");
}

function inicio() {
  const br = painel.br?.cargos[1];
  let h = `<h2 class="sec">🇧🇷 Presidente · Brasil</h2>`;
  if (br) {
    h += `<div class="box">
      <div class="meta"><span><b>${String(br.secoes.pct).replace(".", ",")}%</b> das seções apuradas</span><span>${fmt(br.secoes.apuradas)} de ${fmt(br.secoes.total)}</span></div>
      ${barra(br.secoes.pct)}
      ${br.top[0]?.votos > 0 ? "" : '<div class="aviso">A apuração ainda não começou. Os candidatos aparecem abaixo.</div>'}
    </div>${linhasTop(br, 12, "br")}`;
  } else h += '<div class="msg">Carregando…</div>';

  h += `<h2 class="sec">⭐ Favoritos <small>quem está na frente em cada lugar</small></h2>`;
  if (!favoritos.length) h += '<div class="msg">Nenhum favorito. Use a aba <b>Explorar</b> e toque em ☆ para adicionar.</div>';

  // comparação rápida de presidente
  const comp = favoritos.map((f) => ({ f, c: painel[f.id]?.cargos[1] })).filter((x) => x.c);
  if (comp.length) {
    h += `<div class="box comp"><div class="cg">Presidente · comparação</div>${comp.map(({ f, c }) => {
      const l = c.top[0], tem = l?.votos > 0;
      return `<div class="l"><span class="lugar">${esc(painel[f.id].nome || f.nome)}</span><span class="quem">${tem ? `<b>${esc(l.nome)}</b> ${pct(l.pct)}` : "—"}</span></div>`;
    }).join("")}</div>`;
  }

  for (const f of favoritos) {
    const p = painel[f.id];
    h += `<div class="fav"><div class="fh"><h3>${esc(p?.nome || f.nome)}</h3>
      <span class="ap">${p?.cargos[1] ? String(p.cargos[1].secoes.pct).replace(".", ",") + "% apurado" : ""}</span>
      <button class="x" data-rm="${esc(f.id)}" title="Remover dos favoritos">✕</button></div>`;
    if (!p) h += '<div class="msg">Carregando…</div>';
    else for (const cg of cargosDe(ufDe(f.id))) {
      const c = p.cargos[cg];
      if (!c) { h += `<div class="lr off"><div class="lc">${CARGO[cg]}</div><div class="lq">indisponível</div></div>`; continue; }
      const tops = lideres(c), tem = tops[0]?.votos > 0, seg = c.top[tops.length];
      h += `<button class="lr" data-go="${esc(f.id)}|${cg}">
        <div class="lc">${CARGO[cg]}<span>${String(c.secoes.pct).replace(".", ",")}% das seções apuradas</span></div>
        ${tem ? tops.map((x) => `<div class="lq">${foto(cg, ufDe(f.id), x.sq, "peq")}<span class="nm">${esc(x.nome)} <em>${esc(x.partido)}</em></span><span class="vt">${pct(x.pct)}<small>${fmt(x.votos)} votos</small></span></div>`).join("") +
          (seg ? `<div class="seg">2º: ${esc(seg.nome)} · ${fmt(seg.votos)}</div>` : "")
          : DEPUTADOS.includes(cg) ? `<div class="lq sem">aguardando apuração</div>`
          : `<div class="lq sem">aguardando apuração</div><div class="pre">${c.top.slice(0, 6).map((x) => `<span>${foto(cg, ufDe(f.id), x.sq, "peq")}${esc(primeiroNome(x.nome))}</span>`).join("")}</div>`}
      </button>`;
    }
    h += `</div>`;
  }
  $("view").innerHTML = h;
}

function explorar() {
  const cargos = cargosDe(exp.uf);
  const mun = munCache[exp.uf] || [];
  const capital = mun.find((m) => m.capital);
  const fav = favoritos.some((f) => f.id === idExp());
  let h = `<div class="box filtros">
    <label>Estado
      <select id="fUf"><option value="br"${exp.uf === "br" ? " selected" : ""}>🇧🇷 Brasil (Presidente)</option>
      ${Object.entries(UFS).map(([k, v]) => `<option value="${k}"${exp.uf === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
    ${exp.uf !== "br" ? `<label>Cidade
      <input id="fMun" list="lMun" placeholder="Todo o estado — ou digite uma cidade" value="${esc(exp.munNome)}" autocomplete="off">
      <datalist id="lMun">${mun.map((m) => `<option value="${esc(titulo(m.nome))}"></option>`).join("")}</datalist></label>
      <div class="chips"><button data-chip="" class="${!exp.mun ? "on" : ""}">Todo o estado</button>
      ${capital ? `<button data-chip="${capital.cd}" class="${exp.mun === capital.cd ? "on" : ""}">${esc(titulo(capital.nome))} (capital)</button>` : ""}</div>` : ""}
    <label>Cargo
      <select id="fCargo">${cargos.map((c) => `<option value="${c}"${exp.cargo === c ? " selected" : ""}>${CARGO[c]}</option>`).join("")}</select></label>
    <button id="fav" class="favbtn${fav ? " on" : ""}">${fav ? "★ Nos favoritos" : "☆ Adicionar aos favoritos"}: ${esc(nomeExp())}</button>
  </div>`;

  const d = expDados;
  if (expErro) h += '<div class="msg warn">Os resultados ainda não estão disponíveis no TSE para esta consulta. Tentando de novo automaticamente…</div>';
  else if (!d) h += '<div class="msg">Carregando…</div>';
  else {
    const s = d.secoes;
    h += `<div class="box">
      <div class="meta"><span><b>${esc(d.nomeCargo)}</b> · ${d.vagas} ${d.vagas > 1 ? "vagas" : "vaga"}</span><span>${esc(d.atualizadoEm)}</span></div>
      ${barra(s.pct)}
      <div class="meta"><span><b>${String(s.pct).replace(".", ",")}%</b> das seções apuradas</span><span>${fmt(s.apuradas)} de ${fmt(s.total)}</span></div>
      <div class="stats"><div><b>${fmt(d.votosValidos)}</b>válidos</div><div><b>${fmt(d.brancos)}</b>brancos</div><div><b>${fmt(d.nulos)}</b>nulos</div></div>
    </div>
    <input type="search" id="busca" placeholder="🔎  Buscar nome, número ou partido" value="${esc(buscaTxt)}">`;
    h += '<div id="rank"></div>';
  }
  $("view").innerHTML = h;
  if (d) rank();
}

let buscaTxt = "";
function rank() {
  const d = expDados, t = sa(buscaTxt.trim());
  const maior = d.candidatos[0]?.votos || 1;
  const lista = d.candidatos.map((c, i) => ({ ...c, pos: i + 1 }))
    .filter((c) => !t || sa(c.nome).includes(t) || String(c.n).startsWith(t) || sa(c.partido).includes(t));
  $("rank").innerHTML = lista.slice(0, limite).map((c) => `
    <div class="cand${c.eleito ? " eleito" : ""}${c.pos === 1 && c.votos > 0 ? " lider1" : ""}">
      <i class="fill" style="width:${Math.round((c.votos / maior) * 100)}%"></i>
      ${foto(exp.cargo, exp.uf, c.sq)}
      <div><div class="nome">${esc(c.nome)}${c.eleito ? '<span class="tag">ELEITO</span>' : ""}</div>
      <div class="sub"><b>${esc(c.n)}</b> · ${esc(c.partido)}${c.vice.length ? " · Vice/Supl.: " + esc(c.vice.join(", ")) : ""}</div></div>
      <div class="votos">${pct(c.pct)}<small>${fmt(c.votos)} votos</small></div>
    </div>`).join("") || '<div class="msg">Nenhum candidato encontrado.</div>';
  if (lista.length > limite) $("rank").innerHTML += `<button class="mais" id="mais">Ver mais (${lista.length - limite})</button>`;
}

const titulo = (s) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/ (De|Da|Do|Das|Dos|E) /g, (x) => x.toLowerCase());

async function noticias() {
  $("view").innerHTML = '<div class="msg">Carregando…</div>';
  try {
    const n = await api("/api/noticias");
    if (aba !== "news") return;
    $("view").innerHTML = '<div class="news">' + (n.map((x) => `
      <a href="${esc(x.link)}" target="_blank" rel="noopener"><b>${esc(x.titulo)}</b>
      <span>${esc(x.fonte)}${x.data ? " · " + new Date(x.data).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</span></a>`).join("") || '<div class="msg">Sem notícias no momento.</div>') + "</div>";
  } catch { $("view").innerHTML = '<div class="msg warn">Não foi possível carregar as notícias.</div>'; }
}

// ---------- aba Eleitos: quem o TSE já marcou como eleito, em todos os cargos ----------
async function carregarEleitos(silencioso) {
  const pedidos = [["1", "br"], ...cargosDe(elei.uf).filter((c) => c !== "1").map((c) => [c, elei.uf])];
  const res = await Promise.allSettled(pedidos.map(([c, loc]) => api(`/api/resultados?local=${loc}&cargo=${c}`)));
  const novo = {};
  res.forEach((r, i) => { novo[pedidos[i][0]] = r.status === "fulfilled" ? r.value : null; });
  eleiDados = novo;
  if (!silencioso) desenhar();
}

function eleitos() {
  let h = `<div class="box filtros"><label>Estado
    <select id="fEleiUf">${Object.entries(UFS).map(([k, v]) => `<option value="${k}"${elei.uf === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
    <div class="meta">Lista oficial do TSE: só entra quem o TSE já marcou como eleito. Atualiza sozinha conforme a apuração.</div></div>`;
  if (!eleiDados) return ($("view").innerHTML = h + '<div class="msg">Carregando…</div>');

  for (const cg of cargosDe(elei.uf)) {
    const d = eleiDados[cg], uf = cg === "1" ? "br" : elei.uf;
    const titulo_ = `${CARGO[cg]}${cg === "1" ? " · Brasil" : ""}`;
    if (!d) { h += `<details class="sec-el"><summary>${titulo_} <span class="ct">indisponível</span></summary></details>`; continue; }
    const eleitosL = d.candidatos.filter((c) => c.eleito);
    const aberto = eleiAbertos.has(cg) ? " open" : "";
    let corpo;
    if (eleitosL.length) {
      corpo = eleitosL.map((c) => `
        <div class="cand eleito compacto">
          ${foto(cg, uf, c.sq)}
          <div><div class="nome">${esc(c.nome)}<span class="tag">${esc((c.situacao || "ELEITO").toUpperCase())}</span></div><div class="sub"><b>${esc(c.n)}</b> · ${esc(c.partido)}</div></div>
          <div class="votos">${pct(c.pct)}<small>${fmt(c.votos)} votos</small></div>
        </div>`).join("");
      if (DEPUTADOS.includes(cg)) {
        const por = {};
        for (const c of eleitosL) por[c.partido] = (por[c.partido] || 0) + 1;
        corpo = `<div class="chips banc">${Object.entries(por).sort((a, b) => b[1] - a[1]).map(([p, n]) => `<span>${esc(p)} <b>${n}</b></span>`).join("")}</div>` + corpo;
      }
    } else {
      const l = d.candidatos[0];
      corpo = l && l.votos > 0 && !DEPUTADOS.includes(cg)
        ? `<div class="msg">Nenhum eleito definido ainda.<br>Na frente: <b>${esc(l.nome)}</b> (${esc(l.partido)}) · ${pct(l.pct)} · ${fmt(l.votos)} votos</div>`
        : `<div class="msg">Nenhum eleito definido ainda.</div>`;
    }
    h += `<details class="sec-el" data-c="${cg}"${aberto}><summary>${titulo_}
      <span class="ct">${eleitosL.length} de ${d.vagas} · ${String(d.secoes.pct).replace(".", ",")}% apurado</span></summary>${corpo}</details>`;
  }
  $("view").innerHTML = h;
}

function desenhar() {
  const foco = document.activeElement?.id;
  if (aba === "inicio") inicio();
  else if (aba === "eleitos") eleitos();
  else if (aba === "explorar") { explorar(); if (foco === "busca" || foco === "fMun") { const e = $(foco); e?.focus(); try { e.setSelectionRange(e.value.length, e.value.length); } catch {} } }
  else if (aba === "news" && !$("view").querySelector(".news")) noticias();
}

// ---------- eventos ----------
$("view").addEventListener("click", (e) => {
  const rm = e.target.closest("[data-rm]");
  if (rm) { alternarFavorito(rm.dataset.rm); return; }
  const go = e.target.closest("[data-go]");
  if (go) {
    const [id, cargo] = go.dataset.go.split("|"), [uf, mun] = id.split(":");
    const m = (painel[id]?.nome || "").replace(/ - [A-Z]{2}$/, "");
    exp = { uf, mun: mun || "", munNome: mun ? m : "", cargo };
    guardar("exp", exp); expDados = null; irPara("explorar"); carregarMunicipios(uf); return;
  }
  const chip = e.target.closest("[data-chip]");
  if (chip) {
    const m = (munCache[exp.uf] || []).find((x) => x.cd === chip.dataset.chip);
    exp.mun = chip.dataset.chip; exp.munNome = m ? titulo(m.nome) : ""; guardar("exp", exp); expDados = null; limite = PASSO; carregarExplorar(); desenhar(); return;
  }
  if (e.target.id === "fav") return alternarFavorito(idExp(), nomeExp());
  if (e.target.id === "mais") { limite += PASSO; rank(); }
});

$("view").addEventListener("change", (e) => {
  if (e.target.id === "fUf") {
    exp = { uf: e.target.value, mun: "", munNome: "", cargo: e.target.value === "br" ? "1" : exp.cargo }; guardar("exp", exp);
    expDados = null; limite = PASSO; carregarMunicipios(exp.uf); carregarExplorar(); desenhar();
  } else if (e.target.id === "fEleiUf") {
    elei.uf = e.target.value; guardar("elei", elei); eleiDados = null; carregarEleitos(); desenhar();
  } else if (e.target.id === "fCargo") {
    exp.cargo = e.target.value; guardar("exp", exp); expDados = null; limite = PASSO; carregarExplorar(); desenhar();
  } else if (e.target.id === "fMun") {
    const v = sa(e.target.value.trim());
    const m = (munCache[exp.uf] || []).find((x) => sa(x.nome) === v);
    if (m) exp.mun = m.cd, exp.munNome = titulo(m.nome);
    else if (!v) exp.mun = "", exp.munNome = "";
    else return;
    guardar("exp", exp); expDados = null; limite = PASSO; carregarExplorar(); desenhar();
  }
});

$("view").addEventListener("toggle", (e) => {
  const c = e.target.dataset?.c;
  if (c) e.target.open ? eleiAbertos.add(c) : eleiAbertos.delete(c);
}, true);

$("view").addEventListener("input", (e) => {
  if (e.target.id === "busca") { buscaTxt = e.target.value; limite = PASSO; rank(); }
});

// ---------- relógio ----------
setInterval(() => {
  restante = Math.max(0, restante - 1);
  $("status").innerHTML = ultimaOk
    ? `<b>●</b> Atualizado às ${ultimaOk.toLocaleTimeString("pt-BR")} · próxima em ${restante}s`
    : "Conectando ao TSE…";
  if (restante === 0 && !buscando) atualizar();
}, 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) atualizar(); });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
pintarSino();
irPara("inicio");
carregarMunicipios(exp.uf);
atualizar();
