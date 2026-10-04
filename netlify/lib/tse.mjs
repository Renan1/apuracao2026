// Funções compartilhadas para ler os arquivos JSON de resultados do TSE.
const RAIZ = "https://resultados.tse.jus.br/oficial/ele2026";
const UA = { "user-agent": "Mozilla/5.0 apuracao-2026" };

export const UFS = {
  ac: "Acre", al: "Alagoas", ap: "Amapá", am: "Amazonas", ba: "Bahia", ce: "Ceará", df: "Distrito Federal",
  es: "Espírito Santo", go: "Goiás", ma: "Maranhão", mt: "Mato Grosso", ms: "Mato Grosso do Sul", mg: "Minas Gerais",
  pr: "Paraná", pb: "Paraíba", pa: "Pará", pe: "Pernambuco", pi: "Piauí", rj: "Rio de Janeiro", rn: "Rio Grande do Norte",
  rs: "Rio Grande do Sul", ro: "Rondônia", rr: "Roraima", sc: "Santa Catarina", se: "Sergipe", sp: "São Paulo", to: "Tocantins",
};

// Presidente fica na eleição federal (6257); os demais cargos, na estadual (6259).
const eleDe = (cargo) => (String(cargo) === "1" ? "6257" : "6259");

export const num = (s) => Number(String(s ?? "0").replace(/\./g, "").replace(",", ".")) || 0;

export function cargosDe(uf) {
  if (uf === "br") return ["1"];
  return uf === "df" ? ["1", "3", "5", "6", "8"] : ["1", "3", "5", "6", "7"];
}

// local: "br" | "mg" | "mg:40878"  ->  { uf, mun }  (ou null se inválido)
export function lerLocal(id) {
  const m = /^([a-z]{2})(?::(\d{5}))?$/.exec(String(id || ""));
  if (!m) return null;
  const [, uf, mun] = m;
  if (uf !== "br" && !UFS[uf]) return null;
  if (uf === "br" && mun) return null;
  return { uf, mun: mun || "" };
}

export function urlArquivo({ uf, mun }, cargo) {
  const ele = eleDe(cargo);
  const area = uf === "br" ? "br" : `${uf}${mun}`;
  return `${RAIZ}/${ele}/dados/${uf}/${area}-c000${cargo}-e00${ele}-u.json`;
}

export async function buscarCargo(local, cargo) {
  const r = await fetch(urlArquivo(local, cargo), { headers: UA });
  if (!r.ok) throw new Error(`TSE ${r.status}`);
  const raw = await r.json();
  const carg = raw.carg?.[0];
  if (!carg) throw new Error("resposta inesperada");

  const candidatos = [];
  for (const agr of carg.agr || []) {
    for (const par of agr.par || []) {
      for (const c of par.cand || []) {
        candidatos.push({
          n: c.n,
          sq: c.sqcand,
          nome: c.nmu || c.nm,
          partido: par.sg,
          votos: num(c.vap),
          pct: num(c.pvap),
          eleito: c.e === "s" || /^eleito/i.test(c.st || ""),
          situacao: c.st || "",
          vice: (c.vs || []).map((v) => v.nmu).filter(Boolean),
        });
      }
    }
  }
  candidatos.sort((a, b) => b.votos - a.votos || a.nome.localeCompare(b.nome, "pt-BR"));

  const s = raw.s || {}, e = raw.e || {}, v = raw.v || {};
  const saida = {
    cargo: String(cargo),
    nomeCargo: carg.nmn,
    vagas: num(carg.nv),
    atualizadoEm: `${raw.dg || ""} ${raw.hg || ""}`.trim(),
    secoes: { total: num(s.ts), apuradas: num(s.st), pct: num(s.pst) },
    eleitorado: num(e.te),
    votosValidos: num(v.vv),
    brancos: num(v.vb),
    nulos: num(v.vn),
    candidatos,
  };
  return process.env.SIMULA ? simular(saida) : saida;
}

// Só para testes locais (SIMULA=1): inventa votos e troca o líder a cada 10 s.
function simular(d) {
  const fase = Math.floor(Date.now() / 10000) % 2;
  d.candidatos.slice(0, 40).forEach((c, i) => { c.votos = 1000 - i * 10; c.pct = Number(((c.votos / 20000) * 100).toFixed(2)); });
  if (fase && d.candidatos.length > 1) { d.candidatos[0].votos = 985; d.candidatos[1].votos = 1005; }
  d.candidatos.sort((a, b) => b.votos - a.votos);
  d.candidatos.forEach((c, i) => { c.eleito = d.vagas > 1 && i < Math.min(d.vagas, 12); c.situacao = c.eleito ? "Eleito por QP" : ""; });
  d.secoes.apuradas = Math.round(d.secoes.total * 0.3); d.secoes.pct = 30;
  d.votosValidos = 20000;
  return d;
}

// Lista de municípios (cache em memória por ~6 h)
let cacheMun = null, cacheMunEm = 0;
export async function municipios() {
  if (cacheMun && Date.now() - cacheMunEm < 6 * 3600e3) return cacheMun;
  const r = await fetch(`${RAIZ}/6259/config/mun-e006259-cm.json`, { headers: UA });
  if (!r.ok) throw new Error(`TSE ${r.status}`);
  const j = await r.json();
  cacheMun = {};
  for (const a of j.abr) cacheMun[a.cd] = a.mu.map((m) => ({ cd: m.cd, nome: m.nm, capital: m.c === "s" }));
  cacheMunEm = Date.now();
  return cacheMun;
}

const bonito = (s) =>
  s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/ (De|Da|Do|Das|Dos|E) /g, (x) => x.toLowerCase());

export async function nomeLocal({ uf, mun }) {
  if (uf === "br") return "Brasil";
  if (!mun) return UFS[uf];
  try {
    const m = (await municipios())[uf]?.find((x) => x.cd === mun);
    if (m) return `${bonito(m.nome)} - ${uf.toUpperCase()}`;
  } catch {}
  return `${mun} - ${uf.toUpperCase()}`;
}

export const resposta = (corpo, status = 200, cache = "public, max-age=10", cdn = "public, s-maxage=25, stale-while-revalidate=30") =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, ...(cdn ? { "netlify-cdn-cache-control": cdn } : {}) },
  });
