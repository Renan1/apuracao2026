// Versão Cloudflare: o Worker atende /api/* (mesmas funções do Netlify) e o resto vem dos arquivos de /public.
import resultados from "../netlify/functions/resultados.mjs";
import painel from "../netlify/functions/painel.mjs";
import municipios from "../netlify/functions/municipios.mjs";
import noticias from "../netlify/functions/noticias.mjs";
import desempenho from "../netlify/functions/desempenho.mjs";

const rotas = { "/api/desempenho": desempenho, "/api/resultados": resultados, "/api/painel": painel, "/api/municipios": municipios, "/api/noticias": noticias };
import { ttlSeg } from "../netlify/lib/tse.mjs";
const TTL_MS = () => ttlSeg() * 1000; // 10 min antes das 16:59 (sem votos ainda); 55 s depois
const memoria = new Map(); // cache em memória do Worker: evita recalcular (e gastar CPU) a cada visitante

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const fn = rotas[url.pathname];
    if (!fn) return env.ASSETS.fetch(req);
    if (req.method !== "GET") return new Response("método não permitido", { status: 405 });

    const chave = url.pathname + url.search;
    const agora = Date.now();
    const m = memoria.get(chave);
    if (m && agora - m.t < TTL_MS()) return resposta(m);

    // Cache da Cloudflare (funciona em domínios próprios; em *.workers.dev pode ser ignorado, sem problema)
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: "GET" });
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    } catch {}

    const res = await fn(req);
    const corpo = await res.text();
    const item = { t: agora, status: res.status, tipo: res.headers.get("content-type"), corpo };
    if (res.ok && res.headers.get("cache-control") !== "no-store") {
      memoria.set(chave, item);
      if (memoria.size > 200) memoria.delete(memoria.keys().next().value);
      const r = resposta(item);
      ctx.waitUntil(cache.put(cacheKey, r.clone()).catch(() => {}));
      return r;
    }
    return new Response(corpo, { status: res.status, headers: { "content-type": item.tipo, "cache-control": "no-store" } });
  },
};

const resposta = (m) =>
  new Response(m.corpo, { status: m.status, headers: { "content-type": m.tipo, "cache-control": `public, max-age=10, s-maxage=${ttlSeg()}` } });
