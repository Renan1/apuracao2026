// Lê feeds RSS e devolve as últimas notícias sobre as eleições em Minas.
// GET /api/noticias

const FEEDS = [
  { fonte: "G1 Minas", url: "https://g1.globo.com/rss/g1/minas-gerais/" },
  {
    fonte: "Google Notícias",
    url: "https://news.google.com/rss/search?q=elei%C3%A7%C3%B5es+2026+apura%C3%A7%C3%A3o&hl=pt-BR&gl=BR&ceid=BR:pt-419",
  },
  {
    fonte: "Google Notícias",
    url: "https://news.google.com/rss/search?q=elei%C3%A7%C3%B5es+minas+gerais+juiz+de+fora&hl=pt-BR&gl=BR&ceid=BR:pt-419",
  },
];

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .trim();

const tag = (item, name) => {
  const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
};

async function lerFeed({ fonte, url }) {
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 apuracao-mg" } });
    if (!r.ok) return [];
    const xml = await r.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 25).map((m) => {
      const it = m[1];
      const data = new Date(tag(it, "pubDate"));
      return {
        titulo: tag(it, "title"),
        link: tag(it, "link"),
        fonte: tag(it, "source") || fonte,
        data: isNaN(data) ? null : data.toISOString(),
      };
    });
  } catch {
    return [];
  }
}

export default async () => {
  const todas = (await Promise.all(FEEDS.map(lerFeed))).flat().filter((n) => n.titulo && n.link);
  const vistos = new Set();
  const unicas = todas.filter((n) => !vistos.has(n.titulo) && vistos.add(n.titulo));
  unicas.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  return new Response(JSON.stringify(unicas.slice(0, 40)), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=180",
    },
  });
};

export const config = { path: "/api/noticias" };
