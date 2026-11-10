
/* PALLAVI DIGITAL MEDIA 3D EFFECTS */

.pdm-hero {
  min-height: 600px;
  background: radial-gradient(circle, #30240b, #050505 75%);
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
  position: relative;
  overflow: hidden;
  perspective: 1000px;
  color: white;
  padding: 40px 15px;
}

.hero-content {
  position: relative;
  z-index: 2;
}

.pdm-logo {
  width: 150px;
  max-width: 45vw;
  animation: rotateLogo 5s infinite ease-in-out;
  filter: drop-shadow(0 0 20px gold);
}

@keyframes rotateLogo {
  50% {
    transform: rotateY(180deg) translateY(-12px);
  }
}

.pdm-title {
  color: #f8d46b;
  font-size: clamp(28px, 6vw, 60px);
  font-weight: 900;
  text-shadow: 3px 3px 0 #8b5d10, 0 0 25px gold;
  animation: glow 3s infinite alternate;
}

@keyframes glow {
  to {
    text-shadow: 0 0 35px gold;
  }
}

.pdm-particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

.pdm-particles canvas {
  width: 100%;
  height: 100%;
}

.pdm-card {
  background: linear-gradient(145deg, #252525, #080808);
  border: 1px solid #c59b36;
  border-radius: 18px;
  padding: 25px;
  color: white;
  transition: transform .25s, box-shadow .25s;
  transform-style: preserve-3d;
}

.pdm-card:hover {
  box-shadow: 0 15px 35px #c59b3655;
}

.reveal {
  opacity: 0;
  transform: translateY(35px);
  transition: .8s;
}

.reveal.show {
  opacity: 1;
  transform: translateY(0);
}

.pdm-btn {
  display: inline-block;
  background: linear-gradient(135deg, #ffe89a, #b88620);
  color: black;
  padding: 14px 25px;
  border-radius: 30px;
  text-decoration: none;
  font-weight: bold;
}

@media(max-width:600px) {
  .pdm-hero { min-height: 500px; }
  .pdm-card { padding: 18px; }
}
