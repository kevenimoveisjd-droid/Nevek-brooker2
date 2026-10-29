// Gera o SEO do site: uma página por apartamento, uma por bairro, sitemap.xml e robots.txt.
// Uso:  node build-seo.mjs
// Os apartamentos são lidos do próprio index.html (a lista "const S=[ ... ]").
// O endereço do site vem da variável SITE_URL (ou do seo.config.json).
// O site só é liberado para o Google quando INDEXAR=1 (ou "indexar": true no seo.config.json).

import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const ARQ = path.join(RAIZ, process.argv[2] || "index.html");
const cfgArq = path.join(RAIZ, "seo.config.json");
const cfg = fs.existsSync(cfgArq) ? JSON.parse(fs.readFileSync(cfgArq, "utf8")) : {};

const SITE = String(process.env.SITE_URL || cfg.siteUrl || "https://neve-eta.vercel.app").replace(/\/+$/, "");
const INDEXAR = process.env.INDEXAR === "1" || (process.env.INDEXAR == null && cfg.indexar === true);
const NOME = cfg.nome || "Neve Broken";
const TEXTOS_BAIRRO = cfg.bairros || {};
const HOJE = new Date().toISOString().slice(0, 10);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const slug = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const corta = (s, n) => {
  s = String(s || "").replace(/\s+/g, " ").trim();
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
};
const json = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

// ---------- lê o index.html e a lista de apartamentos ----------
let html = fs.readFileSync(ARQ, "utf8");
const ini = html.indexOf("const S=[");
if (ini < 0) throw new Error("Não achei a lista de apartamentos (const S=[) no " + ARQ);
const fim = html.indexOf("\n];", ini);
const apts = JSON.parse(html.slice(ini + "const S=".length, fim + 2));

const urlApt = (a) => `/apartamento/${slug(a.title)}`;
const urlBairro = (r) => `/bairro/${slug(r)}`;
const abs = (p) => SITE + p;

const slugs = new Set();
for (const a of apts) {
  const s = slug(a.title);
  if (slugs.has(s)) throw new Error("Dois apartamentos com o mesmo nome: " + a.title);
  slugs.add(s);
}
const bairros = [...new Set(apts.map((a) => a.region).filter(Boolean))].sort((x, y) => x.localeCompare(y, "pt-BR"));

// ---------- trechos reaproveitáveis ----------
const ROBOTS = INDEXAR ? "index,follow,max-image-preview:large" : "noindex,nofollow";

function metaBasica({ titulo, descricao, url, imagem, homeTitle }) {
  return [
    `<meta name="robots" content="${ROBOTS}">`,
    `<meta name="description" content="${esc(descricao)}">`,
    `<meta name="home-title" content="${esc(homeTitle)}">`,
    `<link rel="canonical" href="${esc(abs(url))}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="pt_BR">`,
    `<meta property="og:site_name" content="${esc(NOME)}">`,
    `<meta property="og:title" content="${esc(titulo)}">`,
    `<meta property="og:description" content="${esc(descricao)}">`,
    `<meta property="og:url" content="${esc(abs(url))}">`,
    imagem ? `<meta property="og:image" content="${esc(imagem)}">` : "",
    `<meta name="twitter:card" content="${imagem ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${esc(titulo)}">`,
    `<meta name="twitter:description" content="${esc(descricao)}">`,
    imagem ? `<meta name="twitter:image" content="${esc(imagem)}">` : "",
  ].filter(Boolean).join("\n");
}

const breadcrumb = (itens) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: itens.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it[0], item: abs(it[1]) })),
});

const HOME_TITLE = `${NOME} · Apartamentos em São Paulo (Zona Leste, Tatuapé, Mooca e mais)`;
const HOME_DESC = corta(
  `Veja ${apts.length} empreendimentos em ${bairros.length} regiões de São Paulo, prontos para morar, em construção e lançamentos. Plantas, fotos e atendimento pelo WhatsApp.`,
  158
);

function trocaEntre(texto, nome, conteudo) {
  const a = `<!--${nome}:start-->`, b = `<!--${nome}:end-->`;
  const i = texto.indexOf(a), j = texto.indexOf(b);
  if (i < 0 || j < 0) throw new Error("Faltam os marcadores " + nome + " no index.html");
  return texto.slice(0, i + a.length) + "\n" + conteudo + "\n" + texto.slice(j);
}

// blocos de links (ficam no fim da página, visíveis, para o Google seguir)
function blocoLinks() {
  return ""; // bloco de links no rodapé removido (visual)
  const porBairro = bairros
    .map((r) => {
      const lista = apts
        .filter((a) => a.region === r)
        .map((a) => `<a href="${urlApt(a)}">${esc(a.title)}</a>`)
        .join(" · ");
      return `<p style="margin:0 0 10px"><b><a href="${urlBairro(r)}">Apartamentos em ${esc(r)}</a></b><br>${lista}</p>`;
    })
    .join("\n");
  return `<nav id="seo-links" aria-label="Apartamentos por região" style="display:block;max-width:1100px;margin:30px auto 10px;padding:0 20px;font-size:.88rem;line-height:1.7;color:var(--mut)">
<h2 style="font-size:1rem;color:var(--ink);margin:0 0 10px">Apartamentos por região</h2>
${porBairro}
</nav>
<style>#seo-links{display:block!important}#seo-links a{color:inherit;text-decoration:none}#seo-links a:hover{color:var(--acc2);text-decoration:underline}</style>`;
}

// ---------- monta uma página a partir do index.html ----------
function montar({ titulo, head, top }) {
  let t = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(titulo)}</title>`);
  t = trocaEntre(t, "seo-head", head);
  t = trocaEntre(t, "seo-top", top);
  t = trocaEntre(t, "seo-links", blocoLinks());
  return t;
}

function escreve(rel, conteudo) {
  const f = path.join(RAIZ, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, conteudo);
}

// ---------- página inicial ----------
const homeLd = [
  {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: NOME,
    url: abs("/"),
    areaServed: { "@type": "City", name: "São Paulo" },
  },
  {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: apts.map((a, i) => ({ "@type": "ListItem", position: i + 1, url: abs(urlApt(a)), name: a.title })),
  },
];
const homeHead =
  metaBasica({ titulo: HOME_TITLE, descricao: HOME_DESC, url: "/", imagem: apts.find((a) => a.cover)?.cover, homeTitle: HOME_TITLE }) +
  "\n" + homeLd.map((o) => `<script type="application/ld+json">${json(o)}</script>`).join("\n");
const homeHtml = montar({ titulo: HOME_TITLE, head: homeHead, top: "" });
fs.writeFileSync(ARQ, homeHtml); // a própria home é atualizada no lugar

// ---------- uma página por apartamento ----------
function descApt(a) {
  const base = String(a.desc || "").split(/\n+/)[0];
  return corta(`${a.title} em ${a.region}: ${a.bedsTxt || ""}, ${a.area} m². ${base}`, 158);
}
for (const a of apts) {
  const url = urlApt(a);
  const titulo = corta(`${a.title} · ${a.bedsTxt || ""} em ${a.region} | ${NOME}`, 70);
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      name: a.title,
      description: String(a.desc || "").replace(/\s+/g, " ").trim(),
      url: abs(url),
      image: a.cover ? [a.cover] : undefined,
      about: {
        "@type": "ApartmentComplex",
        name: a.title,
        address: { "@type": "PostalAddress", addressLocality: "São Paulo", addressRegion: "SP", addressCountry: "BR" },
      },
    },
    breadcrumb([["Início", "/"], [`Apartamentos em ${a.region}`, urlBairro(a.region)], [a.title, url]]),
  ];
  const head =
    metaBasica({ titulo, descricao: descApt(a), url, imagem: a.cover, homeTitle: HOME_TITLE }) +
    "\n" + ld.map((o) => `<script type="application/ld+json">${json(o)}</script>`).join("\n") +
    "\n" + '<style id="seo-hide">#home{display:none}</style>';
  const paragrafos = String(a.desc || "").split(/\n+/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
  const top = `<div id="seo-static" style="max-width:900px;margin:0 auto;padding:90px 20px 40px;color:var(--ink)">
<p><a href="/">Início</a> › <a href="${urlBairro(a.region)}">${esc(a.region)}</a></p>
<h1>${esc(a.title)}</h1>
<p>${esc(a.region)}${a.status ? " · " + esc(a.status) : ""} · ${esc(a.bedsTxt || "")} · ${esc(a.area)} m²</p>
${paragrafos}
</div>`;
  escreve(`apartamento/${slug(a.title)}/index.html`, montar({ titulo, head, top }));
}

// ---------- uma página por bairro ----------
const CSS_BAIRRO = `*{box-sizing:border-box}body{margin:0;background:#070b14;color:#f2f6ff;font:16px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0)}
a{color:inherit}.w{max-width:1100px;margin:0 auto;padding:0 20px}
header{border-bottom:1px solid rgba(255,255,255,.09);padding:16px 0}header a{font-weight:600;text-decoration:none}
h1{font-size:clamp(1.8rem,5vw,2.8rem);line-height:1.15;margin:34px 0 10px}p.i{color:#8b97b0;max-width:760px;margin:0 0 26px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:18px;margin-bottom:40px}
.c{display:block;text-decoration:none;background:#0f1626;border:1px solid rgba(255,255,255,.09);border-radius:20px;overflow:hidden}
.c img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#16203a}.c div{padding:14px 16px}
.c h2{font-size:1.1rem;margin:0 0 4px}.c span{color:#8b97b0;font-size:.9rem}
.o{display:inline-block;margin:0 0 40px;padding:12px 22px;border-radius:999px;background:linear-gradient(135deg,#a8dcff,#5b8cff);color:#04101f;font-weight:600;text-decoration:none}
footer{border-top:1px solid rgba(255,255,255,.09);padding:20px 0;color:#8b97b0;font-size:.85rem}nav.l{font-size:.9rem;color:#8b97b0;margin-bottom:30px}nav.l a{margin-right:12px}`;

for (const r of bairros) {
  const lista = apts.filter((a) => a.region === r);
  const url = urlBairro(r);
  const prontos = lista.filter((a) => /pronto/i.test(a.status || "")).length;
  const obra = lista.filter((a) => /constru|lan[cç]amento/i.test(a.status || "")).length;
  const intro =
    (TEXTOS_BAIRRO[slug(r)] && TEXTOS_BAIRRO[slug(r)].intro) ||
    `Veja ${lista.length === 1 ? "o empreendimento" : "os " + lista.length + " empreendimentos"} que temos em ${r}, São Paulo` +
      (prontos && obra ? `: ${prontos} pronto${prontos > 1 ? "s" : ""} para morar e ${obra} em construção ou lançamento.` : ".") +
      " Toque em um deles para ver fotos, plantas e condições, ou chame a gente no WhatsApp.";
  const titulo = corta(`Apartamentos em ${r}, São Paulo | ${NOME}`, 70);
  const desc = corta(`Apartamentos em ${r}: ${lista.map((a) => a.title).join(", ")}. Veja fotos, plantas e fale com a gente.`, 158);
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Apartamentos em ${r}`,
      url: abs(url),
      mainEntity: { "@type": "ItemList", itemListElement: lista.map((a, i) => ({ "@type": "ListItem", position: i + 1, url: abs(urlApt(a)), name: a.title })) },
    },
    breadcrumb([["Início", "/"], [`Apartamentos em ${r}`, url]]),
  ];
  const cards = lista
    .map(
      (a) => `<a class="c" href="${urlApt(a)}">${a.cover ? `<img src="${esc(a.cover)}" alt="${esc(a.title)} em ${esc(r)}" loading="lazy" referrerpolicy="no-referrer">` : ""}<div><h2>${esc(a.title)}</h2><span>${esc(a.status || "")}${a.status ? " · " : ""}${esc(a.bedsTxt || "")} · ${esc(a.area)} m²</span></div></a>`
    )
    .join("\n");
  const outros = bairros.filter((x) => x !== r).map((x) => `<a href="${urlBairro(x)}">${esc(x)}</a>`).join("");
  const pagina = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titulo)}</title>
${metaBasica({ titulo, descricao: desc, url, imagem: lista.find((a) => a.cover)?.cover, homeTitle: HOME_TITLE })}
${ld.map((o) => `<script type="application/ld+json">${json(o)}</script>`).join("\n")}
<style>${CSS_BAIRRO}</style></head><body>
<header><div class="w"><a href="/">❄ ${esc(NOME)}</a></div></header>
<main class="w"><h1>Apartamentos em ${esc(r)}, São Paulo</h1><p class="i">${esc(intro)}</p>
<div class="g">
${cards}
</div>
<a class="o" href="/#contato">Falar com a gente</a>
<nav class="l" aria-label="Outras regiões"><b>Outras regiões:</b><br>${outros}</nav></main>
<footer><div class="w">© 2026 ${esc(NOME)} · Todos os direitos reservados</div></footer></body></html>`;
  escreve(`bairro/${slug(r)}/index.html`, pagina);
}

// ---------- sitemap e robots ----------
const urls = ["/", ...bairros.map(urlBairro), ...apts.map(urlApt)];
escreve(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `<url><loc>${esc(abs(u))}</loc><lastmod>${HOJE}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`
);
escreve(
  "robots.txt",
  INDEXAR
    ? `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${abs("/sitemap.xml")}\n`
    : `# Site em teste: não indexar ainda.\nUser-agent: *\nDisallow: /\n`
);

console.log(`SEO gerado para ${SITE}`);
console.log(`- ${apts.length} apartamentos, ${bairros.length} bairros, ${urls.length} endereços no sitemap`);
console.log(INDEXAR ? "- Google LIBERADO (indexar ligado)" : "- Google BLOQUEADO (noindex) até ligar INDEXAR=1");
