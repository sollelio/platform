import { useRotas } from "../../lib/rotasAdmin";

// ============================================================
// LigacaoFormularioPublico — o atalho «Preencher formulário público»
// no «Novo pedido» (Início e Funil).
//
// Abre o /interesse da casa num separador novo: a MESMA porta que a
// cliente vê, com a sessão da Nádia intacta (o localStorage é o mesmo).
// O `?entrada=interna` é só uma declaração de por onde se entrou — o
// servidor ignora-o sem sessão, e quem preencheu vem sempre da sessão
// (migração 110). Sem casa na rota não há para onde apontar: não se
// desenha.
// ============================================================
export default function LigacaoFormularioPublico() {
  const { casa } = useRotas();
  if (!casa) return null;
  return (
    <a
      href={`/interesse/${encodeURIComponent(casa)}?entrada=interna`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: "var(--gold-dark)",
        fontWeight: 600,
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      Preencher formulário público ↗
    </a>
  );
}
