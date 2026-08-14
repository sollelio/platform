import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour.css";

// Configuração partilhada por todas as tours da app — visual, textos
// dos botões, etc. Cada chamada pode ainda passar os seus próprios
// "steps" e sobrepor o que precisar.
const OPCOES_BASE = {
  showProgress: true,
  smoothScroll: true,
  animate: true,
  overlayColor: "#1A1A1A",
  overlayOpacity: 0.65,
  stagePadding: 6,
  stageRadius: 10,
  popoverClass: "dlm-tour-popover",
  progressText: "{{current}} de {{total}}",
  nextBtnText: "Seguinte →",
  prevBtnText: "← Anterior",
  doneBtnText: "Concluir ✓",
};

// Inicia uma tour com os passos dados, e marca-a como "já vista" (por
// este browser) quando termina ou é fechada — para não voltar a
// aparecer sozinha. "tourKey" identifica a tour (ex: "admin", "form").
export function iniciarTour(tourKey, steps, opcoesExtra = {}) {
  const driverObj = driver({
    ...OPCOES_BASE,
    steps,
    onDestroyed: (...args) => {
      marcarTourVista(tourKey);
      if (opcoesExtra.onDestroyed) opcoesExtra.onDestroyed(...args);
    },
    ...opcoesExtra,
  });
  driverObj.drive();
  return driverObj;
}

export function tourJaVista(tourKey) {
  return localStorage.getItem(`dlm_tour_${tourKey}`) === "vista";
}

function marcarTourVista(tourKey) {
  localStorage.setItem(`dlm_tour_${tourKey}`, "vista");
}