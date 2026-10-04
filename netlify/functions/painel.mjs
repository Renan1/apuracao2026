// Resumo (primeiros colocados) de todos os cargos de vários locais, numa só chamada.
// GET /api/painel?locais=br,mg,mg:40878,mg:47333&top=3
import { buscarCargo, lerLocal, cargosDe, nomeLocal, resposta } from "../lib/tse.mjs";

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const ids = [...new Set((q.get("locais") || "br").split(","))].slice(0, 8);
  const top = Math.min(Math.max(Number(q.get("top")) || 3, 1), 10);

  const locais = await Promise.all(ids.map(async (id) => {
    const local = lerLocal(id);
    if (!local) return null;
    const cargos = await Promise.all(cargosDe(local.uf).map(async (c) => {
      try {
        const d = await buscarCargo(local, c);
        return { cargo: c, nome: d.nomeCargo, vagas: d.vagas, secoes: d.secoes, atualizadoEm: d.atualizadoEm, votosValidos: d.votosValidos, top: d.candidatos.slice(0, top) };
      } catch {
        return { cargo: c, erro: true };
      }
    }));
    return { id, nome: await nomeLocal(local), cargos };
  }));
  const ok = locais.filter(Boolean);
  // se algum cargo falhou, não guarda a resposta em cache (a próxima busca tenta de novo)
  const falhou = ok.some((l) => l.cargos.some((c) => c.erro));
  return falhou ? resposta({ locais: ok }, 200, "no-store", null) : resposta({ locais: ok });
};

export const config = { path: "/api/painel" };
