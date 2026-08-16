import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { destinoDepoisDoLogin, useSessao } from "../lib/sessao";
import { motion, AnimatePresence } from "framer-motion";
import flores from "../assets/flores.webp";
import CasaProvider, { useCasa } from "../components/CasaProvider";
import { casaDaSessao } from "../lib/identidadeCasa";
import { NOME_PRODUTO } from "../lib/casa";

function Ornament({ small = false }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        justifyContent: "center",
        margin: small ? "4px 0" : "8px 0",
      }}
    >
      <div
        style={{
          height: "1px",
          width: small ? "18px" : "40px",
          backgroundColor: "var(--gold-light)",
        }}
      />
      <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
        <path
          d="M8 1.5 C6.2 1.5 4.5 3 4.5 5 C4.5 7 6.2 8.5 8 8.5 C9.8 8.5 11.5 7 11.5 5 C11.5 3 9.8 1.5 8 1.5Z"
          stroke="var(--ouro)"
          strokeWidth="0.7"
          fill="none"
        />
        <path
          d="M1 5 L4.5 5 M11.5 5 L15 5"
          stroke="var(--ouro)"
          strokeWidth="0.7"
        />
        <circle cx="1" cy="5" r="0.9" fill="var(--ouro)" />
        <circle cx="15" cy="5" r="0.9" fill="var(--ouro)" />
      </svg>
      <div
        style={{
          height: "1px",
          width: small ? "18px" : "40px",
          backgroundColor: "var(--gold-light)",
        }}
      />
    </div>
  );
}

// Ícones SVG dourados
function MailIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--ouro)"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--ouro)"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}
function EyeIcon({ off = false }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--gray-mid)"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

function FlowerDecoration() {
  return (
    <img
      src={flores}
      alt=""
      aria-hidden="true"
      className="flower-deco"
      style={{
        position: "fixed",
        top: "-30px",
        left: "-40px",
        width: "min(380px, 45vw)",
        height: "auto",
        pointerEvents: "none",
        zIndex: 0,
        opacity: 0.9,
      }}
    />
  );
}

// O login é rota IRMÃ da protegida, e por isso tem Provider próprio —
// não pode herdar o da AreaAutenticada, que vive do outro lado da porta
// que este ecrã existe para abrir.
//
// A consequência é honesta e fica dita: quem ainda não entrou não tem
// sessão, a RPC devolve null e o ecrã veste a identidade de omissão. É
// o que deve acontecer — a porta de entrada é do PRODUTO, não de uma
// casa; saber de que casa é alguém antes de ele se identificar era
// exactamente o que a 093 proibiu.
export default function LoginPage() {
  return (
    <CasaProvider chave="sessao" carregar={casaDaSessao}>
      <LoginConteudo />
    </CasaProvider>
  );
}

function LoginConteudo() {
  // Sem sessão a RPC responde «desconhecida», e é isso que ela deve
  // responder — de que casa é alguém não se sabe antes de a pessoa se
  // identificar (093). Por isso este ecrã veste o PRODUTO no título e
  // deixa cair a linha de marca e o slogan, que são da casa: emprestá-
  // los ao produto seria a mesma mentira em sentido contrário.
  const casa = useCasa();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();
  const localizacao = useLocation();
  const sessao = useSessao();

  // Para onde se vai depois de entrar — e para onde se vai já, se afinal
  // a sessão ainda cá está.
  const destino = destinoDepoisDoLogin(localizacao);

  const validate = () => {
    const e = {};
    if (!email.trim()) e.email = "Introduz o teu endereço de email";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      e.email = "Endereço de email inválido";
    if (!password.trim()) e.password = "Introduz a tua password";
    return e;
  };

  const handleLogin = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }

    setLoading(true);
    setErrors({});

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrors({ general: "Email ou password incorretos. Tenta novamente." });
    } else {
      // `replace` para o "voltar" do browser não trazer de volta ao
      // formulário depois de já se estar lá dentro.
      navigate(destino, { replace: true });
    }
    setLoading(false);
  };

  const inputWrapperStyle = (hasError) => ({
    display: "flex",
    alignItems: "center",
    // O vermelho de erro #F87171 (e o halo dele, abaixo) está fora da
    // família de perigo da identidade — fica literal e segue no relatório.
    border: `1.5px solid ${hasError ? "#F87171" : "var(--gold-light)"}`,
    borderRadius: "10px",
    backgroundColor: "var(--superficie)",
    overflow: "hidden",
    transition: "all 0.2s",
    boxShadow: hasError ? "0 0 0 3px rgba(248,113,113,0.1)" : "none",
  });

  const iconStyle = {
    width: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    borderRight: "1px solid var(--gold-light)",
    backgroundColor: "var(--superficie-quente)",
    flexShrink: 0,
  };

  const inputStyle = {
    flex: 1,
    border: "none",
    outline: "none",
    padding: "13px 14px",
    fontSize: "15px",
    fontFamily: "Inter, sans-serif",
    color: "var(--charcoal)",
    backgroundColor: "var(--superficie)",
    minWidth: 0,
  };

  // Já cá dentro, o formulário é um beco: escreve-se a password outra
  // vez para nada, ou fica-se na dúvida se a sessão morreu. Quem quer
  // entrar com outra conta sai primeiro — o "Sair" da barra lateral
  // termina a sessão e traz aqui.
  //
  // Espera-se pela resposta em vez de assumir que não há sessão: assumir
  // fazia o formulário piscar a quem já entrou.
  if (sessao === undefined) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--cream)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "14px",
          color: "var(--gray-mid)",
        }}
      >
        A verificar sessão...
      </div>
    );
  }
  if (sessao) return <Navigate to={destino} replace />;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--cream)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "Inter, sans-serif",
        position: "relative",
        overflowX: "clip",
      }}
    >
      <FlowerDecoration />

      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Cabeçalho */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{ textAlign: "center", marginBottom: "32px" }}
        >
          <h1
            style={{
              fontSize: "clamp(22px, 5vw, 32px)",
              color: "var(--gold)",
              fontFamily: "Playfair Display, serif",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              margin: "0 0 6px 0",
              lineHeight: 1.1,
            }}
          >
            {casa.nome || NOME_PRODUTO}
          </h1>
          {casa.linha_by && (
            <p
              style={{
                fontSize: "11px",
                color: "var(--gold)",
                textTransform: "uppercase",
                letterSpacing: "0.28em",
                margin: "0 0 20px 0",
              }}
            >
              {casa.linha_by}
            </p>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              justifyContent: "center",
              marginBottom: "6px",
            }}
          >
            <div
              style={{
                height: "1px",
                width: "clamp(28px, 8vw, 70px)",
                flexShrink: 0,
                backgroundColor: "var(--gold-light)",
              }}
            />
            <p
              style={{
                fontSize: "12px",
                color: "var(--charcoal)",
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                margin: 0,
                fontWeight: "500",
                whiteSpace: "nowrap",
              }}
            >
              Área Privada
            </p>
            <div
              style={{
                height: "1px",
                width: "clamp(28px, 8vw, 70px)",
                flexShrink: 0,
                backgroundColor: "var(--gold-light)",
              }}
            />
          </div>
          <Ornament small />
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          style={{
            backgroundColor: "var(--superficie)",
            borderRadius: "20px",
            overflow: "hidden",
            boxShadow: "0 8px 48px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ padding: "32px 28px 24px" }}>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "18px" }}
            >
              {/* Email */}
              <div>
                <label
                  style={{
                    fontSize: "11px",
                    fontWeight: "600",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    // #EF4444 como TEXTO de erro (aqui e nos cinco irmãos
                    // abaixo) está fora do papel: na identidade é a cor do
                    // botão de perigo CHEIO; texto de erro é #DC2626/#B91C1C.
                    // Unificar mudava o claro — fica literal e na lista.
                    color: errors.email ? "#EF4444" : "var(--charcoal)",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Email{" "}
                  {errors.email && <span style={{ color: "#EF4444" }}>*</span>}
                </label>
                <div style={inputWrapperStyle(!!errors.email)}>
                  <div style={iconStyle}>
                    <MailIcon />
                  </div>
                  <input
                    type="email"
                    value={email}
                    placeholder="o teu email"
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email)
                        setErrors((p) => ({ ...p, email: null }));
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    style={inputStyle}
                  />
                </div>
                <AnimatePresence>
                  {errors.email && (
                    <motion.p
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: "auto", marginTop: 5 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{
                        fontSize: "12px",
                        color: "#EF4444",
                        margin: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        overflow: "hidden",
                      }}
                    >
                      ⚠ {errors.email}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Password */}
              <div>
                <label
                  style={{
                    fontSize: "11px",
                    fontWeight: "600",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: errors.password ? "#EF4444" : "var(--charcoal)",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Password{" "}
                  {errors.password && (
                    <span style={{ color: "#EF4444" }}>*</span>
                  )}
                </label>
                <div style={inputWrapperStyle(!!errors.password)}>
                  <div style={iconStyle}>
                    <LockIcon />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    placeholder="••••••••"
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password)
                        setErrors((p) => ({ ...p, password: null }));
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    className="btn-compact"
                    onClick={() => setShowPassword((v) => !v)}
                    style={{
                      padding: "0 14px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      alignSelf: "stretch",
                    }}
                  >
                    <EyeIcon off={showPassword} />
                  </button>
                </div>
                <AnimatePresence>
                  {errors.password && (
                    <motion.p
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: "auto", marginTop: 5 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{
                        fontSize: "12px",
                        color: "#EF4444",
                        margin: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        overflow: "hidden",
                      }}
                    >
                      ⚠ {errors.password}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Erro geral */}
              <AnimatePresence>
                {errors.general && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                    style={{
                      backgroundColor: "var(--perigo-fundo)",
                      border: "1px solid var(--perigo-borda)",
                      borderRadius: "8px",
                      padding: "10px 14px",
                    }}
                  >
                    <p
                      style={{ fontSize: "13px", color: "var(--perigo)", margin: 0 }}
                    >
                      ⚠ {errors.general}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Footer creme */}
          <div
            style={{
              backgroundColor: "var(--superficie-quente)",
              borderTop: "1px solid var(--borda)",
              padding: "16px 28px",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button
              onClick={handleLogin}
              disabled={loading}
              style={{
                padding: "11px 36px",
                borderRadius: "999px",
                fontSize: "11px",
                fontWeight: "600",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                // O ouro pálido do estado «a carregar» fica literal: o
                // token de hairline que lhe corresponde no escuro é uma
                // borda escura, e um botão a meio do gesto não pode
                // apagar-se. Pálido com letra escura lê-se nos dois modos.
                backgroundColor: loading ? "#E8D5A3" : "var(--gold)",
                color: "var(--texto-sobre-ouro)",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                boxShadow: loading
                  ? "none"
                  : "0 4px 16px rgba(var(--ouro-rgb), 0.4)",
              }}
            >
              {loading ? "A entrar..." : "Entrar →"}
            </button>
          </div>
        </motion.div>

        {/* Rodapé */}
        <div style={{ marginTop: "20px" }}>
          <Ornament />
          {casa.slogan && (
            <p
              style={{
                textAlign: "center",
                fontSize: "10px",
                color: "var(--gold-light)",
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                margin: "4px 0 0",
              }}
            >
              {casa.slogan}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
