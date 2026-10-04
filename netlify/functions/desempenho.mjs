// Desempenho de candidatos favoritos em cada local (posição, votos e %).
// GET /api/desempenho?locais=br,mg,mg:47333&cands=1~280002551975~br,6~130002541997~mg
//   cada candidato: cargo~sqcand~uf   (Presidente usa uf "br" e vale em todos os locais)
import { buscarCargo, lerLocal, cargosDe, resposta } from "../lib/tse.mjs";

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const ids = [...new Set((q.get("locais") || "br").split(","))].slice(0, 8);
  const cands = (q.get("cands") || "").split(",").filter(Boolean).slice(0, 12)
    .map((s) => { const [cargo, sq, uf] = s.split("~"); return { cargo, sq, uf }; })
    .filter((c) => /^[1-8]$/.test(c.cargo) && /^\d{6,15}$/.test(c.sq) && (c.uf === "br" || /^[a-z]{2}$/.test(c.uf)));

  // pares (local, cargo) que realmente interessam, buscados uma única vez cada
  const pares = new Map();
  for (const id of ids) {
    const local = lerLocal(id);
    if (!local) continue;
    for (const c of cands) {
      if (!cargosDe(local.uf).includes(c.cargo)) continue;
      if (c.cargo !== "1" && c.uf !== local.uf) continue; // deputado/governador/senador só vale no próprio estado
      const k = `${id}|${c.cargo}`;
      if (!pares.has(k)) pares.set(k, { id, local, cargo: c.cargo, sqs: new Set() });
      pares.get(k).sqs.add(c.sq);
    }
  }

  const itens = {};
  let falhou = false;
  await Promise.all([...pares.values()].map(async ({ id, local, cargo, sqs }) => {
    try {
      const d = await buscarCargo(local, cargo);
      d.candidatos.forEach((c, i) => {
        if (!sqs.has(c.sq)) return;
        (itens[c.sq] ||= {})[id] = { votos: c.votos, pct: c.pct, pos: i + 1, de: d.candidatos.length, apurado: d.secoes.pct, eleito: c.eleito };
      });
    } catch { falhou = true; }
  }));

  return falhou ? resposta({ itens }, 200, "no-store", null) : resposta({ itens });
};

export const config = { path: "/api/desempenho" };
