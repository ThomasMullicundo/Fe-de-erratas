(async function () {
  const config = window.FE_DE_RATAS_SUPABASE;
  const list = document.querySelector("[data-archive-list]");
  const count = document.querySelector("[data-archive-count]");

  function dateLabel(value) {
    return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
  }

  try {
    const fields = "title,excerpt,category,byline,slug,published_at";
    const response = await fetch(`${config.url}/rest/v1/articles?select=${fields}&status=eq.published&destination=eq.archive&order=published_at.desc`, {
      headers: { apikey: config.publishableKey }
    });
    if (!response.ok) throw new Error("No pudimos abrir el archivo.");
    const articles = await response.json();
    count.textContent = `${articles.length} ${articles.length === 1 ? "artículo" : "artículos"}`;
    list.replaceChildren();

    if (!articles.length) {
      const empty = document.createElement("p");
      empty.className = "archive-empty";
      empty.textContent = "Todavía no hay artículos publicados. La primera infección está en camino.";
      list.append(empty);
      return;
    }

    articles.forEach((article, index) => {
      const link = document.createElement("a");
      link.className = "article-row";
      link.href = `/articulo?slug=${encodeURIComponent(article.slug)}`;
      const number = document.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      const copy = document.createElement("div");
      const title = document.createElement("h2");
      title.textContent = article.title;
      const meta = document.createElement("small");
      meta.textContent = `${article.category} · ${article.byline} · ${dateLabel(article.published_at)}`;
      copy.append(title, meta);
      const excerpt = document.createElement("p");
      excerpt.textContent = article.excerpt || "Abrir artículo";
      const arrow = document.createElement("b");
      arrow.textContent = "→";
      link.append(number, copy, excerpt, arrow);
      list.append(link);
    });
  } catch (error) {
    count.textContent = "Archivo temporalmente cerrado";
    list.innerHTML = `<p class="archive-empty">${error.message}</p>`;
  }
})();
