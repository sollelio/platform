import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { MotionConfig } from "framer-motion";
import FormEntryPage from "./pages/FormEntryPage";
import FormPage from "./pages/FormPage";
import LoginPage from "./pages/LoginPage";
import AdminPage from "./pages/AdminPage";
import ProtectedRoute from "./components/ProtectedRoute";
import BriefingPage from "./pages/BriefingPage";
import ContribuirPage from "./pages/ContribuirPage";
import PortalPage from "./pages/PortalPage";
import ComunicadoPage from "./pages/ComunicadoPage";
import EventoPage from "./pages/EventoPage";
import MaintenancePage from "./pages/MaintenancePage";
import CaptacaoPage from "./pages/CaptacaoPage";
import EnvBanner from "./components/EnvBanner";
import AvisoDataDoEvento from "./components/admin/AvisoDataDoEvento";

// Lê as variáveis de ambiente
const isLocked = import.meta.env.VITE_SITE_LOCKED === "true";
// Lista explícita, e não `!== "production"`: se PROD um dia se esquecer da
// variável, a cliente NÃO pode ver uma moldura vermelha. O ambiente de
// ensaio da casa chama-se «test» — era «development» aqui e a faixa nunca
// aparecia onde fazia falta.
const isTest = ["development", "test"].includes(import.meta.env.VITE_APP_ENV);

// ============================================================
// ⚠ CORRECÇÃO DE BUG — independente do routing, assinalada à parte
// para poder ser revista isolada da mudança estrutural.
//
// O antes: <Route path="*" element={<Navigate to="/" />} />.
// Dois defeitos num só. (1) DESTINO: "/" é o FORMULÁRIO PÚBLICO, o
// ecrã onde o cliente introduz o código de acesso — um URL de
// backoffice mal escrito despejava a Nádia autenticada lá, sem aviso
// e sem caminho de volta. (2) SEM `replace`: o URL mau ficava no
// histórico, por isso carregar em «voltar» levava outra vez ao URL
// mau, que redireccionava outra vez — uma armadilha sem saída.
//
// Passa a decidir pelo prefixo (quem estava no backoffice volta ao
// backoffice) e a substituir sempre a entrada do histórico.
// ============================================================
function DestinoDesconhecido() {
  const { pathname } = useLocation();
  const vinhaDoBackoffice =
    pathname.startsWith("/admin") || pathname.startsWith("/evento");
  return <Navigate to={vinhaDoBackoffice ? "/admin/inicio" : "/"} replace />;
}

function App() {
  // Se o site estiver trancado, mostra SÓ a página de manutenção —
  // o formulário e o admin ficam completamente inacessíveis.
  if (isLocked) {
    return <MaintenancePage />;
  }

  return (
    <BrowserRouter>
      {/* prefers-reduced-motion respeitado por TODAS as animações
          framer-motion de uma vez — a regra da identidade §3 deixa de
          depender de cada componente se lembrar dela. */}
      <MotionConfig reducedMotion="user">
      {/* Faixa de ambiente (só em desenvolvimento e em TEST) */}
      {isTest && <EnvBanner />}
      <Routes>
        <Route path="/" element={<FormEntryPage />} />
        <Route path="/formulario" element={<FormPage />} />
        {/* Porta pública do funil: o formulário de captação de
            interessados (sem código de acesso, fricção zero) */}
        <Route path="/interesse" element={<CaptacaoPage />} />
        {/* O login é rota IRMÃ, nunca filha da protegida: uma rota de
            login atrás da porta que ela própria abre dá um ciclo
            infinito de redireccionamento a quem tem a sessão expirada.
            Segmento estático, portanto ganha sempre a /admin/:separador
            no ranking do react-router. */}
        <Route path="/admin/login" element={<LoginPage />} />
        <Route
          path="/__preview_aviso"
          element={
            <div style={{ padding: "40px", maxWidth: "900px", margin: "0 auto", background: "#faf7f0", minHeight: "100vh" }}>
              <AvisoDataDoEvento />
            </div>
          }
        />
        {/* /admin nu não é ecrã nenhum — é o atalho para o Início.
            Replace de propósito: não deve ficar no histórico. */}
        <Route path="/admin" element={<Navigate to="/admin/inicio" replace />} />
        {/* O backoffice inteiro numa SÓ rota, com o separador no URL.
            É deliberado que seja uma e não dez irmãs: trocar de
            separador muda o PARÂMETRO, não a rota, por isso a
            AdminPage nunca desmonta e tudo o que vive nela sobrevive
            à navegação — as quatro queries de arranque, o canal
            realtime, o drawer aberto, o painel «Novo Formulário» meio
            preenchido. Dez rotas irmãs remontavam-na a cada clique.
            :p1 e :p2 ficam declarados desde já para os níveis que vêm
            a seguir (/admin/contactos/:clienteId,
            /admin/documentos/:id/:tipo, /admin/logistica/:vista)
            entrarem sem mexer outra vez na árvore. */}
        <Route
          path="/admin/:separador/:p1?/:p2?"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        {/* A casa própria do evento. A aba vai no URL para cada área
            ter link directo e posição de scroll própria. */}
        <Route
          path="/evento/:id/:aba?"
          element={
            <ProtectedRoute>
              <EventoPage />
            </ProtectedRoute>
          }
        />
        <Route path="/briefing/:id" element={<BriefingPage />} />
        {/* A página pública da contribuição coletiva — por token
            aleatório e revogável, leitura via RPC (034), sem login. */}
        <Route path="/contribuir/:token" element={<ContribuirPage />} />
        {/* O Portal do Cliente — leitura via RPC (049, afinada pela 051
            e 052), sem login, por token opaco e revogável.
            «acompanhar» e não «portal»: portal é a palavra que usamos
            entre nós, e a cortina fala à cliente em «o acompanhamento».
            Não ficou slug antigo a redirecionar porque nenhuma ligação
            tinha sido partilhada quando o nome mudou.
            🔴 O token NÃO deriva do id do evento: são 24 bytes
            aleatórios, e a projecção da RPC não devolve o id. É a regra
            que a migração 049 existe para respeitar — um id que escape
            expõe o registo completo por outro RPC anónimo. */}
        <Route path="/acompanhar/:token/:vista?/:sub?" element={<PortalPage />} />
        {/* A folha de um comunicado — pública e REENCAMINHÁVEL, ao
            contrário do portal, que é pessoal. Leitura pela RPC
            dlm_comunicado_ver (079), concedida só ao anon; retirada,
            expirada e inexistente dão a mesma cortina, de propósito. */}
        <Route path="/comunicado/:token" element={<ComunicadoPage />} />
        <Route path="*" element={<DestinoDesconhecido />} />
      </Routes>
      </MotionConfig>
    </BrowserRouter>
  );
}

export default App;
