// Municípios de um estado, para a busca de cidades.  GET /api/municipios?uf=mg
import { municipios, UFS, resposta } from "../lib/tse.mjs";

export default async (req) => {
  const uf = new URL(req.url).searchParams.get("uf") || "";
  if (!UFS[uf]) return resposta({ erro: "uf inválida" }, 400, "no-store", null);
  try {
    return resposta((await municipios())[uf], 200, "public, max-age=3600", "public, s-maxage=21600");
  } catch {
    return resposta({ erro: "indisponível" }, 502, "no-store", null);
  }
};

export const config = { path: "/api/municipios" };
