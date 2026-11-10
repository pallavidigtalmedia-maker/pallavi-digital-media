
document.addEventListener("DOMContentLoaded", () => {

  // Scroll Animation
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("show");
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll(".reveal").forEach(el => {
    observer.observe(el);
  });

  // 3D Service Card Animation
  document.querySelectorAll(".pdm-card").forEach(card => {
    card.addEventListener("mousemove", e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;

      card.style.transform =
        `perspective(900px) rotateX(${(0.5-y)*15}deg) rotateY(${(x-0.5)*15}deg)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });
  });

  // Gold Particle Background
  const hero = document.querySelector(".pdm-hero");
  const box = document.querySelector(".pdm-particles");

  if (hero && box) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    box.appendChild(canvas);

    let particles = [];

    function resize() {
      canvas.width = hero.clientWidth;
      canvas.height = hero.clientHeight;

      const count = innerWidth < 600 ? 20 : 60;
      particles = Array.from({length: count}, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2 + 0.5,
        speed: Math.random() * 0.5 + 0.2
      }));
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        p.y -= p.speed;
        if (p.y < 0) {
          p.y = canvas.height;
          p.x = Math.random() * canvas.width;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "#eac45b";
        ctx.fill();
      });

      requestAnimationFrame(animate);
    }

    resize();
    animate();
    window.addEventListener("resize", resize);
  }
});
