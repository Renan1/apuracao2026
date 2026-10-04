// Lista completa de candidatos de um cargo em um local.
// GET /api/resultados?local=mg:40878&cargo=6   (local: br | mg | mg:40878)
import { buscarCargo, lerLocal, cargosDe, resposta } from "../lib/tse.mjs";

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const local = lerLocal(q.get("local"));
  const cargo = q.get("cargo");
  if (!local) return resposta({ erro: "local inválido" }, 400, "no-store", null);
  if (!cargosDe(local.uf).includes(cargo)) return resposta({ erro: "cargo inválido para este local" }, 400, "no-store", null);
  try {
    return resposta(await buscarCargo(local, cargo));
  } catch {
    return resposta({ erro: "TSE ainda não publicou este arquivo" }, 502, "no-store", null);
  }
};

export const config = { path: "/api/resultados" };
