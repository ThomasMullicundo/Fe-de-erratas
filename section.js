(async function () {
  const config = window.FE_DE_RATAS_SUPABASE;
  const list = document.querySelector("[data-section-list]");
  const category = list?.dataset.category;
  if (!list || !category) return;

  const labels = { relato: "relatos", cronica: "crónicas", poesia: "poemas" };
  const dateLabel = (value) => new Intl.DateTimeFormat("es-AR", {
    day: "2-digit", month: "short", year: "numeric"
  }).format(new Date(value));

  try {
    const fields = "title,excerpt,category,byline,slug,published_at";
    const query = `${config.url}/rest/v1/articles?select=${fields}&status=eq.published&destination=eq.section&category=eq.${encodeURIComponent(category)}&order=published_at.desc`;
    const response = await fetch(query, { headers: { apikey: config.publishableKey } });
    if (!response.ok) throw new Error("No pudimos abrir esta sección.");
    const articles = await response.json();
    list.replaceChildren();

    if (!articles.length) {
      const empty = document.createElement("p");
      empty.className = "archive-empty";
      empty.textContent = `Todavía no hay ${labels[category] || "artículos"} publicados.`;
      list.append(empty);
      return;
    }

    articles.forEach((article, index) => {
      const link = document.createElement("a");
      link.className = "article-row";
      link.href = `/articulo?slug=${encodeURIComponent(article.slug)}`;
      const number = document.createElement("span");
      number.textContent = `${String(index + 1).padStart(2, "0")} / ${dateLabel(article.published_at)}`;
      const title = document.createElement("h2");
      title.textContent = article.title;
      const meta = document.createElement("small");
      meta.textContent = `${article.byline}${article.excerpt ? ` · ${article.excerpt}` : ""}`;
      const arrow = document.createElement("b");
      arrow.textContent = "→";
      link.append(number, title, meta, arrow);
      list.append(link);
    });
  } catch (error) {
    const message = document.createElement("p");
    message.className = "archive-empty";
    message.textContent = error.message;
    list.replaceChildren(message);
  }
})();
