(function () {
  const key = "fe-de-ratas-theme";
  const root = document.documentElement;
  const saved = localStorage.getItem(key);
  root.dataset.theme = saved === "light" ? "light" : "dark";

  function label(button) {
    const isDark = root.dataset.theme === "dark";
    button.textContent = isDark ? "☀ Modo claro" : "● Modo oscuro";
    button.setAttribute("aria-label", isDark ? "Activar tema claro" : "Activar tema oscuro");
  }

  window.addEventListener("DOMContentLoaded", () => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";
    label(button);
    button.addEventListener("click", () => {
      root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem(key, root.dataset.theme);
      label(button);
    });
    document.body.append(button);
  });
})();
