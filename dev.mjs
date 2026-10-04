// Servidor local simples (alternativa ao `netlify dev`):
//   node dev.mjs            -> http://localhost:8888 (dados reais do TSE)
//   SIMULA=1 node dev.mjs   -> inventa votos que trocam de líder a cada 10 s, para testar os avisos
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import resultados from "./netlify/functions/resultados.mjs"; import painel from "./netlify/functions/painel.mjs";
import municipios from "./netlify/functions/municipios.mjs"; import noticias from "./netlify/functions/noticias.mjs";
const rotas = { "/api/resultados": resultados, "/api/painel": painel, "/api/municipios": municipios, "/api/noticias": noticias };
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const fn = rotas[u.pathname];
  if (fn) {
    const r = await fn(new Request(u));
    res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(await r.text());
  }
  const f = path.join("public", u.pathname === "/" ? "index.html" : u.pathname);
  fs.readFile(f, (e, b) => e ? (res.writeHead(404), res.end("404")) : (res.writeHead(200, { "content-type": tipos[path.extname(f)] || "text/plain" }), res.end(b)));
}).listen(8888, () => console.log("http://localhost:8888" + (process.env.SIMULA ? " (SIMULAÇÃO)" : "")));
