// ============================================================
// casaContexto.js — o ESTADO da identidade, ao lado da identidade.
//
// O `useCasa()` responde «quem é a casa». A 108 trouxe uma segunda
// pergunta, que ele não sabe responder: «e o endereço, é mesmo dela?»
// — porque `suspensa` traz identidade na mesma (o ecrã que explica
// precisa de dizer de quem é a casa que parou), e `desconhecida` traz
// a mesma ausência que uma rede em baixo traria.
//
// Ficheiro `.js` à parte, e não mais uma exportação no CasaProvider.jsx,
// pela regra da casa: ficheiro com componentes só exporta componentes
// (react-refresh/only-export-components). É o padrão do
// portal/base.js e do faseConfig.js.
//
// Quem PÕE o valor é o CasaProvider; quem o lê é a porta do backoffice
// (PortaDaCasa). Ninguém mais precisa dele — um ecrã de dentro só
// corre quando a resposta já foi «conhecida».
// ============================================================

import { createContext, useContext } from "react";

// `null` não é um estado: é «ainda não respondeu». A distinção importa
// tanto como as outras — desenhar «este endereço não é seu» enquanto a
// pergunta ainda vai a caminho seria acusar antes de ouvir.
export const EstadoDaCasaContext = createContext(null);

export const useEstadoDaCasa = () => useContext(EstadoDaCasaContext);
