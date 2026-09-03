const carousel = document.querySelector("[data-carousel]");

if (carousel) {
  const slides = [...carousel.querySelectorAll("[data-slide]")];
  const dots = [...carousel.querySelectorAll("[data-dot]")];
  const current = carousel.querySelector("[data-current]");
  let active = 0;
  let timer;

  const show = (index) => {
    active = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => slide.classList.toggle("is-active", i === active));
    dots.forEach((dot, i) => dot.classList.toggle("is-active", i === active));
    current.textContent = String(active + 1).padStart(2, "0");
  };

  const restart = () => {
    clearInterval(timer);
    timer = setInterval(() => show(active + 1), 6500);
  };

  carousel.querySelector("[data-prev]").addEventListener("click", () => { show(active - 1); restart(); });
  carousel.querySelector("[data-next]").addEventListener("click", () => { show(active + 1); restart(); });
  dots.forEach((dot, i) => dot.addEventListener("click", () => { show(i); restart(); }));
  carousel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") show(active - 1);
    if (event.key === "ArrowRight") show(active + 1);
  });
  carousel.addEventListener("mouseenter", () => clearInterval(timer));
  carousel.addEventListener("mouseleave", restart);
  restart();
}
