import { useState } from "react";
import FormStep from "../components/form/FormStep";
import { supabase } from "../lib/supabase";
import { validateStep } from "../lib/validation";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { markInviteUsed } from "../lib/invites";
import { motion, AnimatePresence } from "framer-motion";
import CasaProvider, { useCasa } from "../components/CasaProvider";
import { casaPorCodigo } from "../lib/identidadeCasa";
import flores from "../assets/flores.webp";
import { iniciarTour, tourJaVista } from "../lib/tour";
import { submeterFormulario } from "../lib/clientes";
import { registarErroFormulario } from "../lib/errosForm";
import { codigoErroRpc } from "../lib/rpc";

// Tour curta, só com o essencial — é um formulário único, não queremos
// ser intrusivos
const FORM_TOUR_STEPS = [
  {
    element: "#tour-form-progress",
    popover: {
      title: "O vosso progresso",
      description:
        "Vão andando passo a passo — esta barra mostra sempre onde estão e quanto falta.",
    },
  },
  {
    element: "#tour-form-next",
    popover: {
      title: "Sem pressa",
      description:
        "Podem sempre voltar atrás para corrigir alguma coisa. Os campos com * são obrigatórios.",
    },
  },
];

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
          stroke="#C9A84C"
          strokeWidth="0.7"
          fill="none"
        />
        <path
          d="M1 5 L4.5 5 M11.5 5 L15 5"
          stroke="#C9A84C"
          strokeWidth="0.7"
        />
        <circle cx="1" cy="5" r="0.9" fill="#C9A84C" />
        <circle cx="15" cy="5" r="0.9" fill="#C9A84C" />
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

function CoupleIcon() {
  return (
    <svg
      width="46"
      height="46"
      viewBox="0 0 46 46"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="14"
        cy="9"
        r="5"
        stroke="#C9A84C"
        strokeWidth="1.2"
        fill="#FBF7EF"
      />
      <line
        x1="14"
        y1="14"
        x2="14"
        y2="17"
        stroke="#C9A84C"
        strokeWidth="1.1"
      />
      <path
        d="M8 18 Q8 16 14 16 Q20 16 20 18 L20 30 L8 30 Z"
        stroke="#C9A84C"
        strokeWidth="1.1"
        fill="#FBF7EF"
      />
      <path
        d="M14 16 L11.5 20 L14 19"
        stroke="#C9A84C"
        strokeWidth="0.9"
        fill="none"
      />
      <path
        d="M14 16 L16.5 20 L14 19"
        stroke="#C9A84C"
        strokeWidth="0.9"
        fill="none"
      />
      <path d="M14 17 L13 21 L14 23 L15 21 Z" fill="#C9A84C" opacity="0.7" />
      <path
        d="M8 30 L8 42 L12 42 L14 34 L16 42 L20 42 L20 30"
        stroke="#C9A84C"
        strokeWidth="1.1"
        fill="#FBF7EF"
      />
      <path
        d="M8 42 L6 43 L12 43 L12 42"
        stroke="#C9A84C"
        strokeWidth="0.9"
        fill="none"
      />
      <path
        d="M20 42 L22 43 L16 43 L16 42"
        stroke="#C9A84C"
        strokeWidth="0.9"
        fill="none"
      />
      <circle
        cx="32"
        cy="9"
        r="5"
        stroke="#C9A84C"
        strokeWidth="1.2"
        fill="#FBF7EF"
      />
      <path
        d="M29 6 Q32 3.5 35 6 L36 14 Q34 12 32 13 Q30 12 28 14 Z"
        stroke="#C9A84C"
        strokeWidth="0.9"
        fill="#FBF7EF"
        opacity="0.8"
      />
      <line
        x1="32"
        y1="14"
        x2="32"
        y2="17"
        stroke="#C9A84C"
        strokeWidth="1.1"
      />
      <path
        d="M27 18 Q27 16 32 16 Q37 16 37 18 L37 26 L27 26 Z"
        stroke="#C9A84C"
        strokeWidth="1.1"
        fill="#FBF7EF"
      />
      <path
        d="M29 16 Q32 19 35 16"
        stroke="#C9A84C"
        strokeWidth="0.8"
        fill="none"
      />
      <path
        d="M27 26 Q22 32 21 42 L43 42 Q42 32 37 26 Z"
        stroke="#C9A84C"
        strokeWidth="1.1"
        fill="#FBF7EF"
      />
      <path
        d="M29 28 Q26 34 25 40"
        stroke="#C9A84C"
        strokeWidth="0.7"
        fill="none"
        opacity="0.5"
      />
      <path
        d="M32 27 Q32 34 32 40"
        stroke="#C9A84C"
        strokeWidth="0.7"
        fill="none"
        opacity="0.4"
      />
      <path
        d="M35 28 Q38 34 39 40"
        stroke="#C9A84C"
        strokeWidth="0.7"
        fill="none"
        opacity="0.5"
      />
      <circle
        cx="26"
        cy="28"
        r="3"
        stroke="#C9A84C"
        strokeWidth="0.8"
        fill="#FBF7EF"
      />
      <circle cx="24.5" cy="26.5" r="1.5" fill="#E8D5A3" opacity="0.8" />
      <circle cx="27" cy="26" r="1.5" fill="#E8D5A3" opacity="0.8" />
      <circle cx="25.5" cy="29" r="1.2" fill="#E8D5A3" opacity="0.7" />
    </svg>
  );
}

// Ícone genérico — para qualquer tipo de evento que não seja Casamento
function EventIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20 4 C20 4 21 14 26 17 C31 20 36 20 36 20 C36 20 26 21 22 26 C18 31 20 36 20 36 C20 36 19 26 14 23 C9 20 4 20 4 20 C4 20 14 19 18 14 C22 9 20 4 20 4Z"
        stroke="#C9A84C"
        strokeWidth="1.2"
        fill="#FBF7EF"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Mapa entre o "icone" do tipo de evento e o ícone/emoji a mostrar.
// Qualquer tipo de evento que não tenha icone="couple" cai no genérico.
const ICONE_POR_TIPO = {
  couple: { Icon: CoupleIcon, emoji: "💍" },
};
const ICONE_GENERICO = { Icon: EventIcon, emoji: "✨" };

function getIconeDoTipo(eventTypes) {
  return ICONE_POR_TIPO[eventTypes?.icone] || ICONE_GENERICO;
}

// Bouquet — imagem real do template
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

function ProgressStepper({ currentStep, steps }) {
  return (
    <div
      className="h-scroll stepper-wrap"
      style={{
        marginBottom: "24px",
        padding: "0 8px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          width: "100%",
          minWidth: "520px",
        }}
      >
        {steps.map((step, index) => {
          const stepNum = index + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          const isLast = index === steps.length - 1;
          return (
            <div
              key={step.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                flex: isLast ? "0 0 auto" : 1,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
                    fontWeight: "600",
                    transition: "all 0.35s ease",
                    backgroundColor:
                      isCompleted || isActive ? "var(--gold)" : "white",
                    color:
                      isCompleted || isActive ? "white" : "var(--gold-light)",
                    border: `2px solid ${isCompleted || isActive ? "var(--gold)" : "var(--gold-light)"}`,
                    boxShadow: isActive
                      ? "0 0 0 4px rgba(201,168,76,0.15)"
                      : "none",
                    flexShrink: 0,
                  }}
                >
                  {isCompleted ? "✓" : stepNum}
                </div>
                <p
                  style={{
                    fontSize: "8px",
                    textAlign: "center",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: isActive
                      ? "var(--gold)"
                      : isCompleted
                        ? "var(--gold)"
                        : "var(--gold-light)",
                    fontWeight: isActive ? "700" : "400",
                    lineHeight: "1.3",
                    width: "64px",
                    margin: "4px 0 0",
                  }}
                >
                  {step.title}
                </p>
              </div>
              {!isLast && (
                <div
                  style={{
                    height: "1.5px",
                    flex: 1,
                    marginTop: "14px",
                    marginLeft: "4px",
                    marginRight: "4px",
                    backgroundColor:
                      stepNum < currentStep
                        ? "var(--gold)"
                        : "var(--gold-light)",
                    transition: "background-color 0.35s ease",
                    minWidth: "8px",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// A casa vem do código do convite (098). O código está no
// sessionStorage, onde a porta de entrada o pousou — lê-se aqui,
// síncrono e antes de tudo, para o Provider arrancar já com a chave
// certa em vez de esperar pelo efeito que carrega o convite.
//
// Ler a casa pelo CÓDIGO e não pelo prefixo dele é a regra da 098: o
// prefixo é formato, e confiar no formato é adivinhar.
const codigoDoConvite = () => {
  try {
    return JSON.parse(sessionStorage.getItem("dlm_invite") || "null")?.code || "";
  } catch {
    // Um sessionStorage estragado não é motivo para a página não abrir:
    // sem código fica a identidade de omissão, e o efeito lá dentro já
    // trata de mandar o visitante de volta à porta.
    return "";
  }
};

export default function FormPage() {
  const codigo = codigoDoConvite();
  return (
    <CasaProvider chave={codigo} carregar={() => casaPorCodigo(codigo)}>
      <FormConteudo />
    </CasaProvider>
  );
}

function FormConteudo() {
  const casa = useCasa();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [shakeBtn, setShakeBtn] = useState(false);

  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("dlm_invite");
    if (!stored) {
      navigate("/");
      return;
    }
    const inv = JSON.parse(stored);
    // A guarda antiga só apanhava steps em FALTA; um modelo com steps
    // vazios (ou num formato inesperado) passava e rebentava no
    // primeiro step.title. Sem passos não há formulário para mostrar.
    if (
      !inv.event_types ||
      !Array.isArray(inv.event_types.steps) ||
      inv.event_types.steps.length === 0
    ) {
      navigate("/");
      return;
    }
    setInvite(inv);
    setFormData((prev) => ({
      ...prev,
      dataEvento: inv.data_evento,
      ...inv.respostas,
    }));

    // Onboarding: o convite aponta a um evento — busca o que a
    // captação já sabe e PRÉ-PREENCHE os campos do modelo que
    // coincidam com chaves canónicas (editáveis pelo cliente).
    // Uma verdade só: o EVENTO, lido no momento da validação do código.
    // O caminho novo (RPC da migração 020) já traz os dados do alvo
    // dentro do convite (alvo_dados); o caminho antigo lê a tabela
    // directamente, como sempre.
    const aplicarAlvo = (alvo) => {
      if (!alvo) return;
      const r = alvo.respostas || {};
      setFormData((prev) => ({
        ...prev,
        ...r,
        dataEvento: alvo.data_evento || r.dataEvento || prev.dataEvento,
        numeroConvidados:
          alvo.numero_convidados ?? r.numeroConvidados ?? prev.numeroConvidados,
      }));
    };
    if (inv.submission_alvo_id) {
      if (inv.alvo_dados) {
        aplicarAlvo(inv.alvo_dados);
      } else {
        (async () => {
          try {
            const { data: alvo, error } = await supabase
              .from("submissions")
              .select("respostas, data_evento, numero_convidados")
              .eq("id", inv.submission_alvo_id)
              .single();
            if (error || !alvo) return; // sem alvo legível, o form segue normal
            aplicarAlvo(alvo);
          } catch (e) {
            console.warn("Sem dados do evento-alvo:", e?.message || e);
          }
        })();
      }
    }
  }, []);

  // Tour curta — só depois do formulário estar mesmo visível, e só
  // uma vez por browser
  useEffect(() => {
    if (invite && !tourJaVista("form")) {
      const temporizador = setTimeout(() => {
        iniciarTour("form", FORM_TOUR_STEPS);
      }, 700);
      return () => clearTimeout(temporizador);
    }
  }, [invite]);

  // Enquanto o convite ainda não foi lido do sessionStorage, mostra um
  // ecrã simples em vez de tentar ler "steps" de algo que ainda não existe
  if (!invite) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--cream)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p
          style={{
            fontSize: "13px",
            color: "var(--gold)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            fontFamily: "Inter, sans-serif",
          }}
        >
          A carregar o vosso formulário...
        </p>
      </div>
    );
  }

  // Os passos do formulário vêm do tipo de evento do convite (BD),
  // não de um ficheiro estático
  const steps = invite.event_types.steps;
  const totalSteps = steps.length;
  const step = steps[currentStep - 1];
  const percentage = Math.round((currentStep / totalSteps) * 100);
  const { Icon: StepIcon, emoji: emojiObrigado } = getIconeDoTipo(
    invite.event_types,
  );

  const handleChange = (fieldId, value) =>
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  const handleClearError = (fieldId) =>
    setErrors((prev) => {
      const n = { ...prev };
      delete n[fieldId];
      return n;
    });
  const triggerShake = () => {
    setShakeBtn(true);
    setTimeout(() => setShakeBtn(false), 500);
  };

  const handleNext = () => {
    const stepErrors = validateStep(step, formData);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      triggerShake();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors({});
    setCurrentStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    setErrors({});
    if (currentStep > 1) setCurrentStep((s) => s - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Encontra o valor do primeiro campo de um dado TYPE no modelo (ex:
  // "date"), usando o id real do campo (gerado do label). Para a data,
  // isto é fiável — o calendário e o dashboard lêem da coluna data_evento.
  const valorPorTipo = (tipo) => {
    for (const s of steps) {
      for (const f of s.fields || []) {
        if (
          f.type === tipo &&
          formData[f.id] != null &&
          formData[f.id] !== ""
        ) {
          return formData[f.id];
        }
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    const stepErrors = validateStep(step, formData);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      triggerShake();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    // Deriva a data a partir do campo do tipo "date" do modelo (pelo id
    // real), em vez de assumir o id fixo "dataEvento". Assim qualquer
    // modelo grava a data na coluna data_evento que o calendário lê.
    // O nº de convidados NÃO é adivinhado por tipo (um modelo pode ter
    // vários campos numéricos): mantém-se o id conhecido do Casamento,
    // ficando null quando não existir — melhor vazio que um número errado.
    const dataDoEvento = valorPorTipo("date") || formData.dataEvento || null;
    const numeroConvidados = formData.numeroConvidados
      ? parseInt(formData.numeroConvidados, 10)
      : null;

    const payload = {
      event_type_id: invite.event_type_id,
      data_evento: dataDoEvento,
      numero_convidados: Number.isNaN(numeroConvidados)
        ? null
        : numeroConvidados,
      respostas: formData,
    };
    try {
      // Dois caminhos (migração 013), agora atrás de submeterFormulario:
      //   • Convite com EVENTO-ALVO (onboarding pós-sinal): as respostas
      //     ATUALIZAM o evento existente — nada de clientes duplicados.
      //   • Convite sem alvo (caminho antigo): cria CLIENTE + SUBMISSÃO
      //     ligados, como sempre.
      // No caminho novo (RPC) tudo acontece numa transação, incluindo
      // marcar o convite; no antigo o markInviteUsed é um passo à parte.
      const { submission, conviteMarcado } = await submeterFormulario(
        invite,
        payload,
      );

      // As respostas JÁ ESTÃO gravadas: uma falha a marcar o convite
      // não pode mostrar erro ao cliente (levaria a resubmeter e, no
      // caminho sem alvo, a duplicar cliente + evento). Regista-se
      // para a equipa e o cliente vê o sucesso que de facto teve.
      if (!conviteMarcado) {
        try {
          await markInviteUsed(invite.id, submission.id);
        } catch (e) {
          registarErroFormulario({
            origem: "onboarding:markInviteUsed",
            erro: e,
            contexto: {
              inviteId: invite.id,
              inviteCode: invite.code,
              submissionId: submission.id,
            },
          });
        }
      }
      sessionStorage.removeItem("dlm_invite");
      setSubmitted(true);
    } catch (e) {
      console.error(e);
      // Convite já submetido noutra aba/dispositivo: mensagem própria,
      // sem alarme — as respostas desse convite já estão connosco.
      if (codigoErroRpc(e) === "CONVITE_JA_USADO") {
        setSubmitError(
          // `casa.nome` nulo escreveria «contacta null»: numa template
          // string o null imprime-se. «a casa» é a palavra que o portal
          // já usa quando não a nomeia.
          `Este formulário já foi submetido. Se precisares de alterar alguma resposta, contacta ${casa.nome || "a casa"}.`,
        );
        setSubmitting(false);
        return;
      }
      // Grava o erro real + as respostas na BD: permite investigar a
      // causa e recuperar o que o cliente preencheu, sem depender de
      // prints ou da consola do browser dele.
      registarErroFormulario({
        origem: "onboarding",
        erro: e,
        contexto: {
          inviteId: invite?.id,
          inviteCode: invite?.code,
          submissionAlvoId: invite?.submission_alvo_id || null,
          eventTypeId: invite?.event_type_id,
          passo: `${currentStep}/${totalSteps}`,
        },
        respostas: formData,
      });
      const detalhe = e?.message ? ` (${e.message})` : "";
      setSubmitError(
        `Ocorreu um erro ao submeter. Por favor tenta novamente. Se o erro continuar, envia-nos um print deste ecrã.${detalhe}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--cream)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <FlowerDecoration />
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{
            backgroundColor: "white",
            borderRadius: "20px",
            padding: "52px 44px",
            maxWidth: "420px",
            width: "100%",
            textAlign: "center",
            boxShadow: "0 8px 48px rgba(0,0,0,0.08)",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div style={{ fontSize: "52px", marginBottom: "16px" }}>
            {emojiObrigado}
          </div>
          <h2
            style={{
              fontSize: "24px",
              color: "var(--gold)",
              margin: "0 0 4px 0",
              fontFamily: "Playfair Display, serif",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Obrigado!
          </h2>
          <Ornament />
          <p
            style={{
              fontSize: "14px",
              color: "var(--gray-mid)",
              lineHeight: "1.8",
              margin: "12px 0 20px",
            }}
          >
            O vosso formulário foi submetido com sucesso.
            <br />
            Entraremos em contacto brevemente.
          </p>
          {casa.slogan && (
            <p
              style={{
                fontSize: "10px",
                color: "var(--gold-light)",
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                margin: 0,
              }}
            >
              {casa.slogan}
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  const fillTestData = () => {
    setFormData({
      nomeNoivo: "João Silva",
      nomeNoiva: "Maria Santos",
      contactoPrincipal: "912345678",
      email: "joao.maria@email.com",
      morada: "Rua das Flores, 123, 4000-123 Porto",
      dataEvento: "2026-12-15",
      localEvento: "Quinta das Lágrimas, Coimbra",
      numeroConvidados: "120",
      horaInicio: "16:00",
      horaTermino: "23:00",
      horaMontagem: "10:00",
      horaLimiteMontagem: "15:00",
      horaRecolha: "00:00",
      recolhaDiaSeguinte: "Sim",
      nomeResponsavel: "Ana Silva",
      contactoResponsavel: "934567890",
      relacaoResponsavel: "Mãe da noiva",
      estiloEvento: ["Elegante", "Romântico"],
      paletaCores: ["Branco", "Dourado", "Champanhe"],
      paletaObservacoes: "Tons suaves e elegantes",
      mesaNoivos: ["Mesa com destaque floral", "Mesa com velas"],
      cartoesPratos: "Sim",
      observacoesCartoes: "Com nome em caligrafia dourada",
      descricaoMesaNoivos: "Mesa rectangular com arranjo floral central alto",
      cenarioPalco: [
        "Estrutura arqueada",
        "Arranjos florais",
        "Luzes decorativas",
      ],
      descricaoCenario: "Arco floral branco com luzes warm white",
      medidasEspaco: "Palco com 5m de largura e 4m de altura",
      centrosMesa: ["Mistura de alturas"],
      tipoFlores: ["Flores naturais"],
      numeroMesas: "12",
      formatoMesas: "Redondas",
      lugaresporMesa: "10",
      observacoesMesas: "Mesa de honra com 20 lugares",
      textoPrincipalPlaca: "Bem-vindos ao nosso casamento",
      textoSecundarioPlaca: "João & Maria · 15 de Dezembro de 2026",
      estiloPlaca: ["Com moldura", "Com cavalete"],
      notasPlaca: "Letra script dourada em fundo espelho",
      moradaExacta:
        "Quinta das Lágrimas, Rua António Augusto Gonçalves, 3040-091 Coimbra",
      pessoaAbreEspaco: "Carlos Ferreira",
      contactoPessoaAbre: "239123456",
      acessoLocal: ["Elevador disponível", "Estacionamento próximo"],
      notasAcesso: "Entrada pela porta lateral, portão fecha às 23h",
      observacoesGerais: "Evento muito especial, atenção aos detalhes dourados",
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--cream)",
        position: "relative",
        overflowX: "clip",
      }}
    >
      <style>{`
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-5px)} 40%{transform:translateX(5px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(3px)} }
        .shake{animation:shake 0.4s ease}
      `}</style>

      <FlowerDecoration />

      <div
        className="form-page-inner"
        style={{ position: "relative", zIndex: 1, padding: "36px 16px 64px" }}
      >
        {/* Cabeçalho — dentro do limitador de largura */}
        <div style={{ maxWidth: "560px", margin: "0 auto" }}>
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{ textAlign: "center", marginBottom: "24px" }}
          >
            {/* Sem casa não há cabeçalho — o formulário identifica-se
                pelo tipo de evento, logo abaixo. */}
            {casa.nome && (
              <h1
                style={{
                  fontSize: "clamp(24px, 6.5vw, 44px)",
                  color: "var(--gold)",
                  fontFamily: "Playfair Display, serif",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  margin: "0 0 6px 0",
                  lineHeight: 1.1,
                }}
              >
                {casa.nome}
              </h1>
            )}
            {casa.linha_by && (
              <p
                style={{
                  fontSize: "11px",
                  color: "var(--gold)",
                  textTransform: "uppercase",
                  letterSpacing: "0.28em",
                  margin: "0 0 20px 0",
                  fontWeight: "400",
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
                Formulário de {invite.event_types.nome}
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

          <div id="tour-form-progress">
            <ProgressStepper currentStep={currentStep} steps={steps} />
          </div>

        </div>

        {/* Barra sticky — FORA do div de 560px para colar ao topo durante o scroll */}
        <div className="sticky-progress">
          <div className="sticky-progress-inner">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "var(--gold)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {currentStep}/{totalSteps} · {step.title}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--gold)",
                  fontWeight: "600",
                }}
              >
                {percentage}%
              </span>
            </div>
            <div
              style={{
                height: "4px",
                borderRadius: "999px",
                backgroundColor: "#F5ECD7",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${percentage}%`,
                  backgroundColor: "var(--gold)",
                  borderRadius: "999px",
                  transition: "width 0.5s ease",
                }}
              />
            </div>
          </div>
        </div>

        {/* Card + rodapé — de volta ao limitador de largura */}
        <div style={{ maxWidth: "560px", margin: "0 auto" }}>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
            className="form-card"
            style={{
              backgroundColor: "white",
              borderRadius: "20px",
              overflow: "hidden",
              boxShadow: "0 8px 48px rgba(0,0,0,0.08)",
            }}
          >
            <div
              className="card-progress"
              style={{ padding: "14px 28px 12px" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "var(--gold)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Passo {currentStep} de {totalSteps}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--gold)",
                    fontWeight: "600",
                  }}
                >
                  {percentage}% Concluído
                </span>
              </div>
              <div
                style={{
                  height: "5px",
                  borderRadius: "999px",
                  backgroundColor: "#F5ECD7",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: "999px",
                    backgroundColor: "var(--gold)",
                    width: `${percentage}%`,
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
            </div>

            <div
              className="form-card-body"
              style={{ padding: "20px 28px 24px" }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                >
                  <div
                    className="step-header"
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "16px",
                      marginBottom: "24px",
                    }}
                  >
                    <div
                      style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "50%",
                        backgroundColor: "#FBF7EF",
                        border: "1.5px solid var(--gold-light)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <StepIcon />
                    </div>
                    <div style={{ flex: 1, paddingTop: "2px" }}>
                      <h2
                        style={{
                          fontSize: "16px",
                          color: "var(--charcoal)",
                          margin: "0 0 4px 0",
                          fontFamily: "Playfair Display, serif",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                      >
                        {step.title}
                      </h2>
                      <div
                        className="step-ornament"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          margin: "0 0 5px 0",
                        }}
                      >
                        <div
                          style={{
                            height: "1px",
                            width: "20px",
                            backgroundColor: "var(--gold-light)",
                          }}
                        />
                        <svg
                          width="12"
                          height="8"
                          viewBox="0 0 12 8"
                          fill="none"
                        >
                          <path
                            d="M6 1 C4.8 1 3.5 2.2 3.5 4 C3.5 5.8 4.8 7 6 7 C7.2 7 8.5 5.8 8.5 4 C8.5 2.2 7.2 1 6 1Z"
                            stroke="#C9A84C"
                            strokeWidth="0.6"
                            fill="none"
                          />
                          <path
                            d="M0.5 4 L3.5 4 M8.5 4 L11.5 4"
                            stroke="#C9A84C"
                            strokeWidth="0.6"
                          />
                          <circle cx="0.5" cy="4" r="0.7" fill="#C9A84C" />
                          <circle cx="11.5" cy="4" r="0.7" fill="#C9A84C" />
                        </svg>
                        <div
                          style={{
                            height: "1px",
                            width: "20px",
                            backgroundColor: "var(--gold-light)",
                          }}
                        />
                      </div>
                      <p
                        style={{
                          fontSize: "12px",
                          color: "var(--gray-mid)",
                          margin: 0,
                          lineHeight: "1.4",
                        }}
                      >
                        {step.subtitle}
                      </p>
                    </div>
                  </div>

                  <FormStep
                    step={step}
                    formData={formData}
                    onChange={handleChange}
                    errors={errors}
                    onClearError={handleClearError}
                  />
                </motion.div>
              </AnimatePresence>

              {submitError && (
                <p
                  style={{
                    fontSize: "13px",
                    color: "#EF4444",
                    textAlign: "center",
                    marginTop: "16px",
                  }}
                >
                  {submitError}
                </p>
              )}
            </div>

            {import.meta.env.DEV && (
              <button
                onClick={fillTestData}
                style={{
                  position: "fixed",
                  bottom: "20px",
                  left: "20px",
                  zIndex: 99,
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  backgroundColor: "#1A1A1A",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                  opacity: 0.7,
                }}
              >
                🧪 Preencher teste
              </button>
            )}

            <div
              className="form-card-footer"
              style={{
                backgroundColor: "#FBF7EF",
                borderTop: "1px solid #F0E6D0",
                padding: "16px 28px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <button
                onClick={handleBack}
                disabled={currentStep === 1}
                style={{
                  padding: "10px 24px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: "600",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  border: `1.5px solid ${currentStep === 1 ? "var(--gold-light)" : "var(--gold)"}`,
                  color:
                    currentStep === 1 ? "var(--gold-light)" : "var(--gold)",
                  backgroundColor: "transparent",
                  cursor: currentStep === 1 ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                }}
              >
                ← Voltar
              </button>

              {currentStep < totalSteps ? (
                <button
                  id="tour-form-next"
                  onClick={handleNext}
                  className={shakeBtn ? "shake" : ""}
                  style={{
                    padding: "10px 32px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: "600",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    backgroundColor: "var(--gold)",
                    color: "white",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    boxShadow: "0 4px 16px rgba(201,168,76,0.4)",
                  }}
                >
                  Continuar →
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className={shakeBtn ? "shake" : ""}
                  style={{
                    padding: "10px 32px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: "600",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    backgroundColor: submitting
                      ? "var(--gold-light)"
                      : "var(--gold)",
                    color: "white",
                    border: "none",
                    cursor: submitting ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                    boxShadow: "0 4px 16px rgba(201,168,76,0.4)",
                  }}
                >
                  {submitting ? "A enviar..." : "Submeter ✓"}
                </button>
              )}
            </div>
          </motion.div>

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
    </div>
  );
}