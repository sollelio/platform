import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import FormEntryPage from "./pages/FormEntryPage";
import FormPage from "./pages/FormPage";
import LoginPage from "./pages/LoginPage";
import AdminPage from "./pages/AdminPage";
import ProtectedRoute from "./components/ProtectedRoute";
import BriefingPage from "./pages/BriefingPage";
import EventoPage from "./pages/EventoPage";
import MaintenancePage from "./pages/MaintenancePage";
import CaptacaoPage from "./pages/CaptacaoPage";
import EnvBanner from "./components/EnvBanner";
import AvisoDataDoEvento from "./components/admin/AvisoDataDoEvento";

// Lê as variáveis de ambiente
const isLocked = import.meta.env.VITE_SITE_LOCKED === "true";
const isDev = import.meta.env.VITE_APP_ENV === "development";

function App() {
  // Se o site estiver trancado, mostra SÓ a página de manutenção —
  // o formulário e o admin ficam completamente inacessíveis.
  if (isLocked) {
    return <MaintenancePage />;
  }

  return (
    <BrowserRouter>
      {/* Faixa de ambiente de teste (só aparece em desenvolvimento) */}
      {isDev && <EnvBanner />}
      <Routes>
        <Route path="/" element={<FormEntryPage />} />
        <Route path="/formulario" element={<FormPage />} />
        {/* Porta pública do funil: o formulário de captação de
            interessados (sem código de acesso, fricção zero) */}
        <Route path="/interesse" element={<CaptacaoPage />} />
        <Route path="/admin/login" element={<LoginPage />} />
        <Route
          path="/__preview_aviso"
          element={
            <div style={{ padding: "40px", maxWidth: "900px", margin: "0 auto", background: "#faf7f0", minHeight: "100vh" }}>
              <AvisoDataDoEvento />
            </div>
          }
        />
        <Route
          path="/admin"
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
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
