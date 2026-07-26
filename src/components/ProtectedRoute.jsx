import { Navigate, useLocation } from "react-router-dom";
import { useSessao } from "../lib/sessao";

// ============================================================
// ProtectedRoute — a porta do lado de dentro.
//
// Quem chega sem sessão vai ao login, mas leva o sítio onde ia à
// boleia: abrir um link directo para um evento e aterrar no painel
// depois de entrar é perder o link — e o link era o motivo de tudo.
// ============================================================

export default function ProtectedRoute({ children }) {
  const sessao = useSessao();
  const localizacao = useLocation();

  // Ainda a verificar sessão
  if (sessao === undefined) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--cream)" }}
      >
        <p className="text-sm" style={{ color: "var(--gray-mid)" }}>
          A verificar sessão...
        </p>
      </div>
    );
  }

  // Sem sessão → login, com o destino no bolso. `replace` para o botão
  // "voltar" do browser não cair outra vez nesta porta fechada.
  if (!sessao)
    return (
      <Navigate to="/admin/login" state={{ from: localizacao }} replace />
    );

  // Com sessão → mostra o conteúdo protegido
  return children;
}
