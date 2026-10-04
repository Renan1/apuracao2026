# Apuração 2026 — como publicar (GitHub + Netlify)

Por que os dois? O GitHub guarda o código. O TSE bloqueia consultas feitas direto do navegador de outro site,
então o site precisa de pequenas funções no servidor (`netlify/functions`) para buscar os dados.
GitHub Pages só serve páginas estáticas e não roda essas funções; o Netlify (plano grátis) roda.

## Passo a passo
1. Coloque esta pasta no seu repositório do GitHub (commit + push).
2. Entre em https://app.netlify.com (pode entrar com a conta do GitHub).
3. **Add new site → Import an existing project → GitHub** e escolha o repositório.
4. Não mude nada: o `netlify.toml` já informa a pasta do site (`public`) e a das funções.
5. Clique em **Deploy**. Em ~1 minuto o site fica no ar em `https://nome-do-site.netlify.app`.
   (Em *Site configuration → Change site name* você escolhe o endereço.)
6. A partir daí, todo push no GitHub atualiza o site sozinho.

## Instalar no celular (ícone na tela inicial)
- **Android (Chrome):** menu ⋮ → *Instalar app*.
- **iPhone (Safari):** compartilhar → *Adicionar à Tela de Início*.

## Como usar
- **Início:** Presidente no Brasil + seus favoritos (padrão: Minas Gerais, Juiz de Fora e Argirita) com o líder de cada cargo.
- **Explorar:** escolha Brasil ou um estado, depois a cidade (digite o nome) e o cargo. A estrela adiciona aos favoritos.
- **Eleitos:** lista de quem o TSE já marcou como eleito em cada cargo (Presidente, Governador, Senador, Deputados), por estado, com a bancada por partido.
- **Avisos 🔔:** avisa na hora quando muda o líder de Presidente, Governador ou Senador (Brasil e favoritos).
  Para deputados, manda um resumo a cada 10 minutos (`RESUMO_MIN` em `public/app.js`). Funciona com o site aberto.
- Atualização: a cada 60 s antes das 17h (Brasília) e a cada 30 s depois.

## Testar no computador
- `node dev.mjs` → http://localhost:8888 (dados reais do TSE)
- `SIMULA=1 node dev.mjs` → inventa votos e troca o líder a cada 10 s (PowerShell: `$env:SIMULA=1; node dev.mjs`)

## Onde ajustar
- `netlify/lib/tse.mjs` → endereços e leitura dos arquivos do TSE.
- `public/app.js` → favoritos padrão (`FAV_PADRAO`) e intervalo (`intervalo()`).
- `netlify/functions/noticias.mjs` → fontes de notícias (feeds RSS).
