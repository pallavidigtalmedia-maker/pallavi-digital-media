
/* PALLAVI DIGITAL MEDIA - PREMIUM 3D JS */

document.addEventListener("DOMContentLoaded", function () {

  // Scroll Reveal Animation
  const observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("show");
        }
      });
    },
    { threshold: 0.15 }
  );

  document.querySelectorAll(".reveal").forEach(function (el) {
    observer.observe(el);
  });

  // 3D Service Card Animation
  document.querySelectorAll(".pdm-card").forEach(function (card) {

    card.addEventListener("mousemove", function (e) {
      const rect = card.getBoundingClientRect();

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const rotateX = ((y / rect.height) - 0.5) * -12;
      const rotateY = ((x / rect.width) - 0.5) * 12;

      card.style.transform =
        `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
    });

    card.addEventListener("mouseleave", function () {
      card.style.transform = "";
    });

  });

  // Floating 3D Background
  document.querySelectorAll(".pdm-hero").forEach(function (hero) {
    hero.addEventListener("mousemove", function (e) {
      const x = (e.clientX / window.innerWidth - 0.5) * 15;
      const y = (e.clientY / window.innerHeight - 0.5) * 15;

      const title = hero.querySelector(".pdm-title");

      if (title) {
        title.style.transform =
          `perspective(700px) rotateY(${x}deg) rotateX(${-y}deg)`;
      }
    });

    hero.addEventListener("mouseleave", function () {
      const title = hero.querySelector(".pdm-title");
      if (title) title.style.transform = "";
    });
  });

});
