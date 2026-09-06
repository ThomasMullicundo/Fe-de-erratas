(async function () {
  const config = window.FE_DE_RATAS_SUPABASE;
  const articleView = document.querySelector("[data-public-article]");
  const loading = document.querySelector("[data-article-loading]");
  const slug = new URLSearchParams(window.location.search).get("slug");

  function fail(message) {
    loading.innerHTML = `<strong>${message}</strong><a href="/archivo">Volver al archivo →</a>`;
  }

  if (!slug) return fail("No encontramos la dirección de este artículo.");

  try {
    const fields = "title,excerpt,content,category,byline,destination,slug,published_at";
    const response = await fetch(`${config.url}/rest/v1/articles?select=${fields}&status=eq.published&slug=eq.${encodeURIComponent(slug)}&limit=1`, {
      headers: { apikey: config.publishableKey }
    });
    if (!response.ok) throw new Error("El archivo no respondió.");
    const [article] = await response.json();
    if (!article) return fail("Este artículo no existe o ya no está publicado.");

    const words = article.content.trim() ? article.content.trim().split(/\s+/).length : 0;
    document.title = `${article.title} — Fe de ratas`;
    document.querySelector('meta[name="description"]').content = article.excerpt || `Leé ${article.title} en Fe de ratas.`;
    document.querySelector("[data-article-category]").textContent = article.destination === "archive" ? `Archivo · ${article.category}` : article.category;
    document.querySelector("[data-article-title]").textContent = article.title;
    document.querySelector("[data-article-excerpt]").textContent = article.excerpt;
    document.querySelector("[data-article-byline]").textContent = `Por ${article.byline}`;
    const date = document.querySelector("[data-article-date]");
    date.dateTime = article.published_at;
    date.textContent = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(article.published_at));
    document.querySelector("[data-article-reading]").textContent = `${Math.max(1, Math.ceil(words / 220))} min de lectura`;
    document.querySelector("[data-article-content]").innerHTML = window.FE_DE_RATAS_RENDER_MARKDOWN(article.content);
    loading.hidden = true;
    articleView.hidden = false;
  } catch (error) {
    fail(error.message);
  }
})();
