import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import { TITULO_BACKOFFICE } from "./casa";
import { useCasa } from "../components/CasaProvider";

// ============================================================
// notificacoes.js — a Caixa de Entrada da Nádia (migração 022).
// Cada linha é um acontecimento (hoje: uma captação pública) com o
// snapshot completo do pedido em `dados` — o que o interessado
// preencheu, tal como chegou.
//
// Degradação graciosa: enquanto a migração 022 não correr numa BD,
// a tabela não existe lá — tudo devolve vazio sem rebentar, e a app
// continua a funcionar como antes (mesmo padrão do rpc.js).
// ============================================================

// Os avisos cuja casa é a folha do ACOMPANHAMENTO da ficha — a página
// do evento abre-a por state, consumido uma vez (padrão do realce).
// UMA lista só, importada pelo AdminPage e pelas duas portas da
// EventoPage (Caixa e toast): a cópia à mão já custou um bug — o
// «sinal_confirmado» da 083 entrou numa cópia e não nas outras, e o
// «Abrir ficha completa» caía na lista de contactos quando visto de
// uma ficha (10/08/2026).
// · os quatro primeiros: pedidos que se emitem/tratam na folha;
// · 072 — as respostas dela lêem-se na folha (o «Aceite por … a …» e
//   o publicar da versão nova);
// · 083 — a confirmação do sinal trata-se na folha (a confirmação
//   viva e o limpar); o registo fica a um separador, Pagamentos.
export const TIPOS_DO_ACOMPANHAMENTO = [
  "codigo_pedido",
  "pedido_alteracao",
  "contrato_papel",
  "questionario_pedido",
  "orcamento_aceite",
  "projecto_aprovado",
  "contrato_assinado",
  "sinal_confirmado",
];

// O PostgREST responde 42P01/PGRST205 quando a tabela não existe.
const ehTabelaEmFalta = (erro) =>
  erro?.code === "42P01" ||
  erro?.code === "PGRST205" ||
  /relation .* does not exist|could not find the table/i.test(
    erro?.message || "",
  );

const getNotificacoes = async (limite = 60) => {
  try {
    const { data, error } = await supabase
      .from("notificacoes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limite);
    if (error) throw error;
    return data || [];
  } catch (e) {
    if (ehTabelaEmFalta(e)) {
      console.warn("Tabela notificacoes ainda não existe (migração 022).");
    } else {
      console.error("Erro ao ler notificações:", e);
    }
    return [];
  }
};

const marcarNotificacaoLida = async (id) => {
  try {
    await supabase
      .from("notificacoes")
      .update({ lida_em: new Date().toISOString() })
      .eq("id", id)
      .is("lida_em", null);
  } catch (e) {
    console.error("Erro ao marcar notificação lida:", e);
  }
};

const marcarTodasNotificacoesLidas = async () => {
  try {
    await supabase
      .from("notificacoes")
      .update({ lida_em: new Date().toISOString() })
      .is("lida_em", null);
  } catch (e) {
    console.error("Erro ao marcar notificações lidas:", e);
  }
};

// Remove um lote de notificações (a seleção da Nádia). Definitivo,
// mas sem drama: os dados do pedido vivem na ficha do evento — a
// notificação é só o aviso.
//
// ⚠ EXCEPÇÃO: um aviso `contrato_papel` NÃO é só o aviso — é a própria
// fila do papel (getPapelPorConfirmar, em portal.js, lê DESTA tabela, e
// `dados.caminho` é o único fio até à fotografia no balde). Removê-lo
// fazia a secção «Contrato assinado em papel» desaparecer da folha do
// Acompanhamento para sempre. Quem filtra é o apagarVarias do hook, que
// tem os tipos em mão; marcar como lida continua livre (migração 060).
const apagarNotificacoes = async (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return;
  try {
    await supabase.from("notificacoes").delete().in("id", ids);
  } catch (e) {
    console.error("Erro ao remover notificações:", e);
  }
};

// Subscreve INSERTs em tempo real. Devolve a função de limpeza.
//
// O status é sempre registado (mesmo padrão do canal "db-changes" no
// AdminPage) — sem isto, um canal preso em CHANNEL_ERROR/CLOSED que
// nunca chega a SUBSCRIBED falha em total silêncio: as notificações
// param de chegar e não fica rasto nenhum para perceber porquê.
const subscreverNotificacoes = (onNova) => {
  const canal = supabase
    .channel("notificacoes-changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notificacoes" },
      (payload) => {
        if (payload?.new) onNova(payload.new);
      },
    )
    .subscribe((status, err) => {
      console.log(
        "Realtime status (notificações):",
        status,
        err ? err.message || err : "",
      );
    });
  return () => supabase.removeChannel(canal);
};

// ------------------------------------------------------------
// useNotificacoes — o estado vivo da Caixa de Entrada.
// Carrega a lista, subscreve o realtime, conta as não lidas e
// reflete-as no título do separador do browser. `nova` guarda a
// última chegada em tempo real (alimenta o toast).
// ------------------------------------------------------------
export function useNotificacoes() {
  // Este ficheiro não é componente, mas ISTO é um hook — e um hook pode
  // ler o contexto. O título do separador é o único pedaço de identidade
  // que aqui vive, e não precisa de descer por argumento.
  const casa = useCasa();
  const [lista, setLista] = useState([]);
  const [nova, setNova] = useState(null);

  useEffect(() => {
    let vivo = true;
    // FUNDE, não substitui. O canal já está a receber enquanto a lista
    // inicial vem a caminho: uma notificação que chegue nesses
    // milissegundos era prependida e logo a seguir varrida pelo
    // setLista(dados) — e é justamente a MAIS RECENTE, a que mais
    // importa. Some sem rasto: não há erro, não há segundo evento, e o
    // badge fica a menos até ao próximo recarregamento.
    getNotificacoes().then((dados) => {
      if (!vivo) return;
      setLista((prev) => {
        const jaVem = new Set(dados.map((n) => n.id));
        const chegadasEntretanto = prev.filter((n) => !jaVem.has(n.id));
        return [...chegadasEntretanto, ...dados];
      });
    });
    const parar = subscreverNotificacoes((n) => {
      setLista((prev) => [n, ...prev.filter((x) => x.id !== n.id)]);
      setNova(n);
    });
    return () => {
      vivo = false;
      parar();
    };
  }, []);

  const naoLidas = lista.filter((n) => !n.lida_em).length;

  useEffect(() => {
    const base = TITULO_BACKOFFICE(casa);
    document.title = naoLidas > 0 ? `(${naoLidas}) ${base}` : base;
  }, [naoLidas, casa]);

  const marcarLida = useCallback((id) => {
    setLista((prev) =>
      prev.map((n) =>
        n.id === id && !n.lida_em
          ? { ...n, lida_em: new Date().toISOString() }
          : n,
      ),
    );
    marcarNotificacaoLida(id);
  }, []);

  const marcarTodas = useCallback(() => {
    setLista((prev) =>
      prev.map((n) =>
        n.lida_em ? n : { ...n, lida_em: new Date().toISOString() },
      ),
    );
    marcarTodasNotificacoesLidas();
  }, []);

  const apagarVarias = useCallback(
    (ids) => {
      // A fila do papel vive nesta tabela: os avisos `contrato_papel`
      // não se removem daqui (ver o aviso em apagarNotificacoes). A
      // Caixa já os exclui da seleção — esta guarda é a rede de baixo.
      const protegidas = new Set(
        lista
          .filter((n) => n.tipo === "contrato_papel")
          .map((n) => n.id),
      );
      const permitidas = (ids || []).filter((id) => !protegidas.has(id));
      if (permitidas.length === 0) return;
      const conjunto = new Set(permitidas);
      setLista((prev) => prev.filter((n) => !conjunto.has(n.id)));
      apagarNotificacoes(permitidas);
    },
    [lista],
  );

  const limparNova = useCallback(() => setNova(null), []);

  return {
    lista,
    naoLidas,
    nova,
    marcarLida,
    marcarTodas,
    apagarVarias,
    limparNova,
  };
}
