import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { analytics } from "../lib/analytics";

// ============================================================
// RastreioDeRota — diz à analytics por onde a navegação vai.
//
// Não captura nada sozinho (as visitas de página são do SDK, com os
// endereços limpos): serve para o SDK só arrancar na primeira
// superfície medida e para a gravação de sessão parar se a navegação
// sair para uma página por token. Não desenha nada.
// ============================================================
export default function RastreioDeRota() {
  const { pathname } = useLocation();
  useEffect(() => {
    analytics.rota(pathname);
  }, [pathname]);
  return null;
}
