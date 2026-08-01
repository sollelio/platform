import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ridDe,
  obterDocumento,
  criarDocumento,
  actualizarDocumento,
  lerRascunhoLocal,
  espelharRascunhoLocal,
  gravarCampoLocal,
  marcarMigracao,
} from "../../../lib/documentos";

// ============================================================
// DocumentoProvider — carrega UM documento (tipo + evento) antes de
// montar o gerador, e centraliza a gravação na BD.
//
// Ordem de arranque (a migração transparente):
//   1. BD primeiro — se o documento existir, é a fonte de verdade
//      (e o rascunho local é alinhado com ela).
//   2. Sem BD mas com rascunho local → cria na BD, valida a gravação
//      (o insert relê a linha), marca a flag de migração. O rascunho
//      local NUNCA é apagado.
//   3. Sem nada → documento novo; a linha na BD só nasce na primeira
//      edição (evita documentos-fantasma na BD por simples aberturas).
//   Em caso de falha de rede/BD → usa o rascunho local nesta sessão e
//   volta a tentar na próxima abertura. Zero perda.
//
// Gravação (escrita dupla):
//   - localStorage: síncrono, a cada alteração (rede de segurança);
//   - BD: upsert do objecto `dados` completo, com debounce de 800ms,
//     descarga imediata ao esconder a página / desmontar.
//
// useCampoDocumento(chave, inicial) — assinatura IGUAL ao useRascunho:
// nos geradores basta trocar o import. Sem provider por cima,
// comporta-se exactamente como o useRascunho antigo (só localStorage).
// ============================================================

const DEBOUNCE_MS = 800;
const DocumentoContext = createContext(null);

export function DocumentoProvider({ tipo, submissionId = null, children }) {
  const rid = ridDe(tipo, submissionId);
  const [pronto, setPronto] = useState(false);
  // TRANCADO (fase 3 do portal): o contrato assinado no acompanhamento não
  // se altera mais — a base recusa (gatilho da 057), e aqui nem se tenta.
  const [trancado, setTrancado] = useState(false);

  const dadosRef = useRef({});
  const docIdRef = useRef(null);
  const sujoRef = useRef(false); // há alterações por gravar na BD
  const aGravarRef = useRef(false); // gravação em curso
  const timerRef = useRef(null);
  const gravarRef = useRef(() => {});

  // ---------- Carregamento + migração ----------
  useEffect(() => {
    let cancelado = false;
    setPronto(false);
    setTrancado(false);
    dadosRef.current = {};
    docIdRef.current = null;
    sujoRef.current = false;

    (async () => {
      try {
        const doc = await obterDocumento(tipo, submissionId);
        if (doc) {
          // 1) BD é a fonte de verdade; o rascunho local vira espelho.
          docIdRef.current = doc.id;
          dadosRef.current = doc.dados || {};
          if (!cancelado && doc.trancado_em) setTrancado(true);
          espelharRascunhoLocal(rid, dadosRef.current);
        } else {
          const local = lerRascunhoLocal(rid);
          if (local) {
            // 2) Migração transparente do rascunho local para a BD.
            let criado = null;
            try {
              criado = await criarDocumento(tipo, submissionId, local);
            } catch (e) {
              // Corrida (outra aba/StrictMode criou primeiro): recupera.
              criado = await obterDocumento(tipo, submissionId);
              if (!criado) throw e;
            }
            docIdRef.current = criado.id;
            dadosRef.current = criado.dados || local;
            marcarMigracao(rid);
          }
          // 3) Sem BD nem rascunho: documento novo (dados vazios).
        }
      } catch (e) {
        console.error(
          "documentos: falha a carregar/migrar — a usar o rascunho local nesta sessão",
          e,
        );
        dadosRef.current = lerRascunhoLocal(rid) || {};
        // docId fica null: a primeira gravação tenta criar na BD.
      }
      if (!cancelado) setPronto(true);
    })();

    return () => {
      cancelado = true;
    };
  }, [tipo, submissionId, rid]);

  // ---------- Gravação na BD ----------
  const gravar = useCallback(async () => {
    if (aGravarRef.current || !sujoRef.current) return;
    aGravarRef.current = true;
    sujoRef.current = false;
    let falhou = false;
    try {
      if (docIdRef.current) {
        await actualizarDocumento(docIdRef.current, dadosRef.current);
      } else {
        try {
          const criado = await criarDocumento(
            tipo,
            submissionId,
            dadosRef.current,
          );
          docIdRef.current = criado.id;
        } catch (e) {
          // Já criado entretanto (outra aba): recupera o id e actualiza.
          const doc = await obterDocumento(tipo, submissionId);
          if (!doc) throw e;
          docIdRef.current = doc.id;
          await actualizarDocumento(doc.id, dadosRef.current);
        }
      }
    } catch (e) {
      falhou = true;
      sujoRef.current = true; // o rascunho local tem tudo; retenta na próxima edição
      console.error(
        "documentos: falha a gravar na BD (o rascunho local mantém as alterações)",
        e,
      );
    }
    aGravarRef.current = false;
    // Chegaram alterações durante a gravação? Agenda outra passagem
    // (mas não em cima de uma falha, para não martelar offline).
    if (sujoRef.current && !falhou && timerRef.current === null) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        gravarRef.current();
      }, DEBOUNCE_MS);
    }
  }, [tipo, submissionId]);
  gravarRef.current = gravar;

  const agendar = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      gravarRef.current();
    }, DEBOUNCE_MS);
  }, []);

  // Descarga imediata quando a página se esconde ou o provider desmonta.
  useEffect(() => {
    const descarregar = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      gravarRef.current();
    };
    const aoEsconder = () => {
      if (document.visibilityState === "hidden") descarregar();
    };
    document.addEventListener("visibilitychange", aoEsconder);
    window.addEventListener("pagehide", descarregar);
    return () => {
      document.removeEventListener("visibilitychange", aoEsconder);
      window.removeEventListener("pagehide", descarregar);
      descarregar();
    };
  }, []);

  // ---------- API para o hook ----------
  const getCampo = useCallback((campo) => dadosRef.current[campo], []);

  const setCampo = useCallback(
    (campo, valor) => {
      if (trancado) return; // assinado: nada se escreve, nem localmente
      dadosRef.current = { ...dadosRef.current, [campo]: valor };
      gravarCampoLocal(rid, campo, valor); // espelho síncrono
      sujoRef.current = true;
      agendar();
    },
    [rid, agendar, trancado],
  );

  const api = useMemo(
    () => ({ rid, getCampo, setCampo, trancado }),
    [rid, getCampo, setCampo, trancado],
  );

  if (!pronto) {
    return (
      <p
        style={{
          fontSize: "13px",
          color: "var(--gray-mid)",
          fontStyle: "italic",
          padding: "24px 0",
        }}
      >
        A carregar o documento…
      </p>
    );
  }

  return (
    <DocumentoContext.Provider value={api}>
      {children}
    </DocumentoContext.Provider>
  );
}

// ------------------------------------------------------------
// useCampoDocumento — substituto drop-in do useRascunho.
// chave = `${tipo}:${submissionId|"manual"}:${campo}` (igual a sempre).
// ------------------------------------------------------------
export function useCampoDocumento(chave, inicial) {
  const ctx = useContext(DocumentoContext);
  // O campo é o último segmento (tipo e submissionId nunca têm ":").
  const campo = chave.slice(chave.lastIndexOf(":") + 1);

  const [valor, setValor] = useState(() => {
    if (ctx) {
      const v = ctx.getCampo(campo);
      if (v !== undefined) return v;
    } else {
      // Sem provider: comportamento antigo do useRascunho (só local).
      try {
        const bruto = localStorage.getItem("dlm_rascunho_" + chave);
        if (bruto !== null) return JSON.parse(bruto);
      } catch {
        /* segue o inicial */
      }
    }
    return typeof inicial === "function" ? inicial() : inicial;
  });

  const persistir = useCallback(
    (v) => {
      if (ctx) {
        ctx.setCampo(campo, v);
      } else {
        try {
          localStorage.setItem("dlm_rascunho_" + chave, JSON.stringify(v));
        } catch {
          /* quota cheia ou privado */
        }
      }
    },
    [ctx, campo, chave],
  );

  const definir = useCallback(
    (novo) => {
      if (typeof novo === "function") {
        setValor((prev) => {
          const v = novo(prev);
          persistir(v);
          return v;
        });
      } else {
        persistir(novo);
        setValor(novo);
      }
    },
    [persistir],
  );

  // O terceiro elemento é o TRANCADO do documento (fase 3): vai no mesmo
  // array de propósito — um export novo neste ficheiro acordava a regra
  // only-export-components, e quem destrutura só dois elementos não nota.
  return [valor, definir, !!ctx?.trancado];
}