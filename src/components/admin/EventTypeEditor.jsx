import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  createEventType,
  updateEventType,
  getQuestionarioGrupos,
} from "../../lib/eventTypes";

const TYPE_OPTIONS = [
  { value: "text", label: "Texto curto" },
  { value: "textarea", label: "Texto longo (várias linhas)" },
  { value: "number", label: "Número" },
  { value: "email", label: "Email" },
  { value: "tel", label: "Telefone" },
  { value: "date", label: "Data" },
  { value: "time", label: "Hora" },
  { value: "radio", label: "Escolha única (um botão)" },
  { value: "checkbox", label: "Escolha múltipla (vários botões)" },
  { value: "paleta", label: "Paleta de Cores 🎨" },
  { value: "morada", label: "Morada / Endereço" },
];

let uidSeq = 0;
const makeUid = () => `tmp_${Date.now()}_${uidSeq++}`;
// Prefixos para os ids do dnd-kit — evita colisões entre steps/fields/options
const STEP_PREFIX = "step__";
const FIELD_PREFIX = "field__";
const OPT_PREFIX = "opt__";
const DROPZONE_PREFIX = "dropzone__";
const OPTZONE_PREFIX = "optzone__"; // zona de largar opções num campo diferente

export function toEditingSteps(steps) {
  return (steps || []).map((step) => ({
    uid: makeUid(),
    title: step.title || "",
    subtitle: step.subtitle || "",
    // O grupo de prazo (062). Vazio = este passo nunca fecha.
    grupo: step.grupo || "",
    fields: (step.fields || []).map((field) => ({
      uid: makeUid(),
      // O id GRAVADO viaja com o campo e nunca se regenera: é a chave
      // das respostas já dadas (respostas[campo.id]) em todos os
      // eventos deste modelo. Descartá-lo aqui e regenerá-lo do rótulo
      // ao gravar foi o que desligou respostas reais em produção.
      id: field.id || null,
      label: field.label || "",
      type: field.type || "text",
      required: !!field.required,
      placeholder: field.placeholder || "",
      papel: field.papel || "",
      options: (field.options || []).map((o) => ({ uid: makeUid(), value: o })),
      validatePositive: field.validate === "positive",
      validateFutureDate: field.validate === "futureDate",
    })),
  }));
}

export function blankEditingSteps() {
  return [{ uid: makeUid(), title: "Passo 1", subtitle: "", grupo: "", fields: [] }];
}

// As mensagens que o organizador lê quando erra um campo. TERCEIRA PESSOA,
// como o resto do que sai de casa (identidade-visual.md §6) — estas são a
// raiz, não uma cópia: cada campo NOVO leva daqui a sua mensagem para
// dentro do `steps` do modelo, na base. Corrigir só as linhas já gravadas
// não chega; sem isto, o editor volta a semear segunda pessoa amanhã.
//
// As duas impessoais ficam como estão: já não tratam ninguém por tu.
function buildErrorMsg(validate) {
  if (validate === "phone")
    return "Introduza um número de telefone válido (ex: 912 345 678)";
  if (validate === "email") return "Introduza um endereço de email válido";
  if (validate === "futureDate") return "Esta data não pode ser no passado";
  if (validate === "positive") return "Introduza um número positivo";
  return "Este campo é obrigatório";
}

function toCamelId(label) {
  const palavras = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (palavras.length === 0) return "campo";
  return palavras
    .map((p, i) =>
      i === 0
        ? p.toLowerCase()
        : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
    )
    .join("");
}

function generateUniqueFieldId(label, idsJaUsados) {
  const base = toCamelId(label) || "campo";
  let id = base;
  let contador = 2;
  while (idsJaUsados.includes(id)) {
    id = `${base}${contador}`;
    contador++;
  }
  return id;
}

function buildStepsForSave(steps) {
  // IDS ESTÁVEIS: um campo que já tem id gravado mantém-no tal e qual —
  // renomear o rótulo, reordenar passos ou mexer no resto do modelo
  // nunca lhe toca. Só um campo NOVO ganha id, derivado do rótulo
  // (recriar um campo com o rótulo exacto de um removido regenera o id
  // antigo — e as respostas órfãs dele voltam a aparecer sozinhas).
  //
  // A unicidade confere-se contra TODOS os ids do modelo, preservados
  // incluídos — não só os já percorridos. Senão, um campo novo em cima
  // podia gerar o id de um campo existente mais abaixo, e o modelo
  // ficava com dois campos a ler e escrever a mesma resposta.
  const idsJaUsados = steps
    .flatMap((s) => s.fields.map((f) => f.id))
    .filter(Boolean);
  return steps.map((step, stepIndex) => {
    const passoFinal = {
      id: stepIndex + 1,
      title: step.title.trim(),
      subtitle: step.subtitle.trim(),
      icon: "user",
    };
    // O grupo só se grava quando existe. Escrever `grupo: ""` punha uma
    // chave vazia em todos os passos de todos os modelos, e a leitura no
    // servidor teria de distinguir «vazio» de «ausente» sem ganho nenhum.
    if (step.grupo) passoFinal.grupo = step.grupo;
    passoFinal.fields = step.fields.map((field) => {
      let id = field.id;
      if (!id) {
        id = generateUniqueFieldId(field.label, idsJaUsados);
        idsJaUsados.push(id);
      }
      let validate;
      if (field.type === "tel") validate = "phone";
      else if (field.type === "email") validate = "email";
      else if (field.type === "number" && field.validatePositive)
        validate = "positive";
      else if (field.type === "date" && field.validateFutureDate)
        validate = "futureDate";
      const campoFinal = {
        id,
        label: field.label.trim(),
        type: field.type,
        required: field.required,
        errorMsg: buildErrorMsg(validate),
      };
      if (field.placeholder && field.placeholder.trim())
        campoFinal.placeholder = field.placeholder.trim();
      if (validate) campoFinal.validate = validate;
      if (["radio", "checkbox"].includes(field.type)) {
        campoFinal.options = field.options
          .map((o) => o.value.trim())
          .filter((o) => o !== "");
      }
      if (field.papel) campoFinal.papel = field.papel;

      return campoFinal;
    });
    return passoFinal;
  });
}

function validar(nome, steps) {
  const problemas = [];
  if (!nome.trim()) problemas.push("Dá um nome ao tipo de evento.");
  if (steps.length === 0) problemas.push("Adiciona pelo menos um passo.");
  steps.forEach((s, i) => {
    if (!s.title.trim())
      problemas.push(`O passo ${i + 1} precisa de um título.`);
    if (s.fields.length === 0)
      problemas.push(
        `O passo "${s.title || i + 1}" precisa de pelo menos um campo.`,
      );
    s.fields.forEach((f) => {
      if (!f.label.trim())
        problemas.push(`Há um campo sem nome no passo "${s.title || i + 1}".`);
      if (["radio", "checkbox"].includes(f.type)) {
        const validas = f.options.filter((o) => o.value.trim() !== "");
        if (validas.length === 0)
          problemas.push(
            `O campo "${f.label || "sem nome"}" precisa de pelo menos uma opção.`,
          );
      }
    });
  });
  return problemas;
}

const inputBaseStyle = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: "8px",
  border: "1.5px solid var(--gold-light)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "Inter, sans-serif",
  boxSizing: "border-box",
  backgroundColor: "white",
};
const labelStyle = {
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  color: "var(--charcoal)",
  display: "block",
  marginBottom: "6px",
};
const checkboxLabelStyle = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "12px",
  color: "var(--charcoal)",
  marginBottom: "6px",
  cursor: "pointer",
};
const deleteIconBtnStyle = {
  fontSize: "14px",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "#EF4444",
  padding: "6px",
  flexShrink: 0,
};

// O mesmo botão, armado: o segundo clique é que remove (confirmação
// inline no próprio sítio — nunca window.confirm, regra da casa)
const confirmDeleteBtnStyle = {
  ...deleteIconBtnStyle,
  fontSize: "11px",
  fontWeight: "700",
  backgroundColor: "#DC2626",
  color: "white",
  borderRadius: "8px",
  padding: "6px 10px",
  whiteSpace: "nowrap",
};

function DragHandle({ attributes, listeners, title }) {
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      title={title}
      style={{
        cursor: "grab",
        background: "none",
        border: "none",
        color: "var(--gray-mid)",
        fontSize: "18px",
        padding: "6px 4px",
        flexShrink: 0,
        touchAction: "none",
        lineHeight: 1,
        alignSelf: "flex-start",
      }}
    >
      ⠿
    </button>
  );
}

// ===== Opção arrastável (radio/checkbox) =====
function SortableOption({
  opt,
  index,
  fieldUid,
  fieldType,
  onChangeValue,
  onRemove,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${OPT_PREFIX}${opt.uid}`,
    data: { fieldUid, fieldType },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        display: "flex",
        gap: "6px",
        marginBottom: "6px",
      }}
    >
      <DragHandle
        attributes={attributes}
        listeners={listeners}
        title="Arrastar opção"
      />
      <input
        type="text"
        value={opt.value}
        onChange={(e) => onChangeValue(e.target.value)}
        placeholder={`Opção ${index + 1}`}
        style={{ ...inputBaseStyle, flex: 1 }}
      />
      <button onClick={onRemove} style={deleteIconBtnStyle}>
        ✕
      </button>
    </div>
  );
}

// ===== Zona de opções de um campo — arrastável e aceita opções de outros campos do mesmo tipo =====
function OptionsZone({
  field,
  draggingFieldOrOpt,
  onUpdateOption,
  onRemoveOption,
  onAddOption,
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${OPTZONE_PREFIX}${field.uid}`,
  });
  return (
    <div style={{ marginTop: "10px" }}>
      <p
        style={{
          fontSize: "10px",
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--gray-mid)",
          margin: "0 0 6px 0",
        }}
      >
        Opções
      </p>
      {!draggingFieldOrOpt ? (
        <SortableContext
          items={field.options.map((o) => `${OPT_PREFIX}${o.uid}`)}
          strategy={verticalListSortingStrategy}
        >
          <div
            ref={setNodeRef}
            style={{
              minHeight: "12px",
              borderRadius: "8px",
              outline: isOver ? "2px dashed var(--gold)" : "none",
              outlineOffset: "3px",
              transition: "outline 0.15s",
            }}
          >
            {field.options.map((opt, idx) => (
              <SortableOption
                key={opt.uid}
                opt={opt}
                index={idx}
                fieldUid={field.uid}
                fieldType={field.type}
                onChangeValue={(val) => onUpdateOption(idx, val)}
                onRemove={() => onRemoveOption(idx)}
              />
            ))}
          </div>
        </SortableContext>
      ) : (
        field.options.map((opt, idx) => (
          <div
            key={opt.uid}
            style={{ display: "flex", gap: "6px", marginBottom: "6px" }}
          >
            <div style={{ width: "30px" }} />
            <input
              type="text"
              value={opt.value}
              onChange={(e) => onUpdateOption(idx, e.target.value)}
              placeholder={`Opção ${idx + 1}`}
              style={{ ...inputBaseStyle, flex: 1 }}
            />
            <button
              onClick={() => onRemoveOption(idx)}
              style={deleteIconBtnStyle}
            >
              ✕
            </button>
          </div>
        ))
      )}
      <button
        onClick={onAddOption}
        style={{
          padding: "6px 14px",
          borderRadius: "999px",
          fontSize: "11px",
          fontWeight: "600",
          border: "1px solid var(--gold-light)",
          color: "var(--gold)",
          backgroundColor: "white",
          cursor: "pointer",
        }}
      >
        + Adicionar Opção
      </button>
    </div>
  );
}

// ===== Um campo, dentro de um passo =====
function FieldRow({
  field,
  dragHandle,
  draggingFieldOrOpt,
  confirmar = false,
  onUpdate,
  onRemove,
  onTypeChange,
  onUpdateOption,
  onAddOption,
  onRemoveOption,
}) {
  const showPlaceholder = [
    "text",
    "email",
    "tel",
    "number",
    "textarea",
  ].includes(field.type);
  const showOptions = ["radio", "checkbox"].includes(field.type);

  // Papéis disponíveis conforme o tipo do campo
  const papeisDisponiveis =
    field.type === "text"
      ? [
          { value: "", label: "Nenhum" },
          { value: "titulo", label: "Título do evento" },
          { value: "local", label: "Local do evento" },
        ]
      : field.type === "date"
        ? [
            { value: "", label: "Nenhum" },
            { value: "data", label: "Data do evento" },
          ]
        : field.type === "morada"
          ? [
              { value: "", label: "Nenhum" },
              { value: "morada", label: "Morada do evento" },
            ]
          : ["checkbox", "radio"].includes(field.type)
            ? [
                { value: "", label: "Nenhum" },
                { value: "estilo", label: "Estilo do evento" },
              ]
            : null;

  return (
    <div
      style={{
        backgroundColor: "#FBF7EF",
        borderRadius: "12px",
        padding: "14px",
        border: "1px solid #F0E6D0",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          marginBottom: "10px",
          alignItems: "center",
        }}
      >
        {dragHandle}
        <input
          type="text"
          value={field.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Nome do campo (ex: Nome do Bebé)"
          style={{ ...inputBaseStyle, flex: "2 1 200px" }}
        />
        <select
          value={field.type}
          onChange={(e) => onTypeChange(e.target.value)}
          style={{ ...inputBaseStyle, flex: "1 1 160px" }}
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          onClick={onRemove}
          style={confirmar ? confirmDeleteBtnStyle : deleteIconBtnStyle}
          title="Remover campo"
        >
          {confirmar ? "Confirmar?" : "🗑"}
        </button>
      </div>

      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => onUpdate({ required: e.target.checked })}
        />
        Obrigatório
      </label>

      {field.type === "number" && (
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={field.validatePositive}
            onChange={(e) => onUpdate({ validatePositive: e.target.checked })}
          />
          Tem de ser um número positivo (maior que zero)
        </label>
      )}
      {field.type === "date" && (
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={field.validateFutureDate}
            onChange={(e) => onUpdate({ validateFutureDate: e.target.checked })}
          />
          Esta data não pode ser no passado (ex: data do evento)
        </label>
      )}
      {showPlaceholder && (
        <input
          type="text"
          value={field.placeholder}
          onChange={(e) => onUpdate({ placeholder: e.target.value })}
          placeholder="Texto de exemplo, opcional"
          style={{ ...inputBaseStyle, marginTop: "8px" }}
        />
      )}
      {papeisDisponiveis && (
        <div style={{ marginTop: "8px" }}>
          <label
            style={{
              fontSize: "10px",
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--gray-mid)",
              display: "block",
              marginBottom: "4px",
            }}
          >
            Papel deste campo
          </label>
          <select
            value={field.papel || ""}
            onChange={(e) => onUpdate({ papel: e.target.value })}
            style={{ ...inputBaseStyle, fontSize: "12px" }}
          >
            {papeisDisponiveis.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {showOptions && (
        <OptionsZone
          field={field}
          draggingFieldOrOpt={draggingFieldOrOpt}
          onUpdateOption={onUpdateOption}
          onRemoveOption={onRemoveOption}
          onAddOption={onAddOption}
        />
      )}
    </div>
  );
}

function SortableFieldRow({ field, stepUid, draggingType, ...rest }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${FIELD_PREFIX}${field.uid}`, data: { stepUid } });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <FieldRow
        field={field}
        draggingFieldOrOpt={draggingType === "field"}
        dragHandle={
          <DragHandle
            attributes={attributes}
            listeners={listeners}
            title="Arrastar campo (pode mover para outro passo)"
          />
        }
        {...rest}
      />
    </div>
  );
}

// ===== Um passo =====
function StepCard({
  gruposPrazo,
  step,
  stepIndex,
  draggingType,
  unicoPasso = false,
  confirmarRemocaoPasso = false,
  campoAConfirmar = null,
  onUpdateStep,
  onRemoveStep,
  onAddField,
  onUpdateField,
  onRemoveField,
  onTypeChange,
  onUpdateOption,
  onAddOption,
  onRemoveOption,
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setStepRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${STEP_PREFIX}${step.uid}` });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${DROPZONE_PREFIX}${step.uid}`,
  });

  const combineRefs = (el) => {
    setStepRef(el);
  };

  // ===== MODO COMPACTO (a cura da leveza) =====
  // Ao arrastar um PASSO, todos os passos colapsam para cartões-resumo
  // finos e uniformes — como as Mensagens. O DOM fica leve, o
  // closestCenter acerta sempre, e 10 passos cabem no ecrã enquanto
  // reordenas. Ao largar, tudo reabre onde estava.
  if (draggingType === "step") {
    return (
      <div
        ref={combineRefs}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
        }}
      >
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "12px",
            padding: "10px 14px",
            marginBottom: "10px",
            border: "1.5px solid var(--gold-light)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <DragHandle
            attributes={attributes}
            listeners={listeners}
            title="Arrastar para reordenar o passo"
          />
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: "10px",
                fontWeight: "700",
                color: "var(--gold)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: 0,
              }}
            >
              Passo {stepIndex + 1}
            </p>
            <p
              style={{
                fontSize: "13px",
                fontWeight: "600",
                color: "var(--charcoal)",
                margin: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {step.title || "Sem título"} · {step.fields.length}{" "}
              {step.fields.length === 1 ? "campo" : "campos"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={combineRefs}
      style={{
        transform: isDragging ? undefined : CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "16px",
          padding: "18px",
          marginBottom: "16px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
          border: "1px solid var(--gold-light)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "8px",
            marginBottom: "14px",
          }}
        >
          {/* Pega do passo — só visível quando NÃO está a arrastar um campo/opção */}
          {draggingType !== "field" && draggingType !== "option" ? (
            <DragHandle
              attributes={attributes}
              listeners={listeners}
              title="Arrastar para reordenar o passo"
            />
          ) : (
            <div style={{ width: "30px", flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: "10px",
                fontWeight: "700",
                color: "var(--gold)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: "0 0 6px 0",
              }}
            >
              Passo {stepIndex + 1}
            </p>
            <input
              type="text"
              value={step.title}
              onChange={(e) => onUpdateStep({ title: e.target.value })}
              placeholder="Título do passo (ex: Dados do Bebé)"
              style={{
                ...inputBaseStyle,
                fontWeight: "600",
                marginBottom: "8px",
              }}
            />
            <input
              type="text"
              value={step.subtitle}
              onChange={(e) => onUpdateStep({ subtitle: e.target.value })}
              placeholder="Subtítulo, opcional"
              style={inputBaseStyle}
            />

            {/* ── O PRAZO DESTE PASSO ─────────────────────────────────
                A decisão que fecha respostas à cliente, e por isso a
                única no editor que se explica por baixo em vez de
                confiar no rótulo. O predefinido é «Nunca fecha»: nada
                se tranca por omissão. */}
            <div style={{ marginTop: "10px" }}>
              <label
                style={{
                  fontSize: "10px",
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--gray-mid)",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Quando é que estas respostas deixam de se poder mudar
              </label>
              <select
                value={step.grupo || ""}
                onChange={(e) => onUpdateStep({ grupo: e.target.value })}
                style={{ ...inputBaseStyle, fontSize: "12px" }}
              >
                <option value="">Nunca fecha</option>
                {(gruposPrazo || []).map((g) => (
                  <option key={g.chave} value={g.chave}>
                    {g.rotulo} — {g.dias_antes} dias antes do evento
                  </option>
                ))}
              </select>
              <p
                style={{
                  fontSize: "11px",
                  lineHeight: 1.55,
                  color: "var(--gray-mid)",
                  margin: "5px 0 0",
                }}
              >
                {step.grupo
                  ? "Passado o prazo, a cliente vê estas respostas em leitura e o motivo — e pode na mesma pedir a alteração, que lhe chega à Caixa de Entrada."
                  : "Estas respostas ficam abertas até ao dia. Escolha um prazo só para o que já foi comprado, impresso ou encomendado."}
              </p>
            </div>
          </div>
          <button
            onClick={onRemoveStep}
            disabled={unicoPasso}
            style={
              confirmarRemocaoPasso
                ? confirmDeleteBtnStyle
                : {
                    ...deleteIconBtnStyle,
                    opacity: unicoPasso ? 0.35 : 1,
                    cursor: unicoPasso ? "not-allowed" : "pointer",
                  }
            }
            title={
              unicoPasso
                ? "Tem de existir pelo menos um passo."
                : "Remover passo"
            }
          >
            {confirmarRemocaoPasso ? "Confirmar? Os campos perdem-se" : "🗑"}
          </button>
        </div>

        <SortableContext
          items={step.fields.map((f) => `${FIELD_PREFIX}${f.uid}`)}
          strategy={verticalListSortingStrategy}
        >
          <div
            ref={setDropRef}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              minHeight: "12px",
              borderRadius: "10px",
              outline:
                isOver && draggingType === "field"
                  ? "2px dashed var(--gold)"
                  : "none",
              outlineOffset: "4px",
              transition: "outline 0.15s",
            }}
          >
            {step.fields.map((field) => (
              <SortableFieldRow
                key={field.uid}
                field={field}
                stepUid={step.uid}
                draggingType={draggingType}
                confirmar={campoAConfirmar === field.uid}
                onUpdate={(changes) => onUpdateField(field.uid, changes)}
                onRemove={() => onRemoveField(field.uid)}
                onTypeChange={(newType) => onTypeChange(field.uid, newType)}
                onUpdateOption={(idx, val) =>
                  onUpdateOption(field.uid, idx, val)
                }
                onAddOption={() => onAddOption(field.uid)}
                onRemoveOption={(idx) => onRemoveOption(field.uid, idx)}
              />
            ))}
          </div>
        </SortableContext>

        <button
          onClick={onAddField}
          style={{
            marginTop: "12px",
            padding: "8px 16px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: "600",
            border: "1.5px solid var(--gold)",
            color: "var(--gold)",
            backgroundColor: "white",
            cursor: "pointer",
          }}
        >
          + Adicionar Campo
        </button>
      </div>
    </div>
  );
}

// ===== Componente principal =====
export default function EventTypeEditor({
  initialNome,
  initialSteps,
  editingId,
  isPredefinido,
  onCancel,
  onSaved,
}) {
  const [nome, setNome] = useState(initialNome || "");
  const [steps, setSteps] = useState(initialSteps || blankEditingSteps());
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState(null);
  // O que está a ser arrastado agora — controla quais contextos ficam activos
  const [draggingType, setDraggingType] = useState(null); // "step" | "field" | "option" | null
  const [draggingPreview, setDraggingPreview] = useState(null); // texto para o DragOverlay

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const updateStep = (stepUid, changes) =>
    setSteps((prev) =>
      prev.map((s) => (s.uid === stepUid ? { ...s, ...changes } : s)),
    );

  const addStep = () =>
    setSteps((prev) => [
      ...prev,
      { uid: makeUid(), title: "", subtitle: "", grupo: "", fields: [] },
    ]);

  // Remoções em duas fases: o primeiro clique arma o botão
  // ("Confirmar?"), o segundo remove. null | {tipo:'passo',uid} |
  // {tipo:'campo',stepUid,fieldUid}
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(null);

  // Os grupos de prazo (062) vêm da base: o prazo é do negócio, não do
  // programa. Se a leitura falhar, a lista fica vazia e o único valor
  // possível passa a ser «Nunca fecha» — que é a opção segura. Um erro
  // aqui nunca pode acabar em passos fechados por engano.
  const [gruposPrazo, setGruposPrazo] = useState([]);
  useEffect(() => {
    let cancelado = false;
    getQuestionarioGrupos()
      .then((g) => {
        if (!cancelado) setGruposPrazo(g);
      })
      .catch((e) => {
        console.error(e);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // O botão armado desarma sozinho ao fim de uns segundos: um clique
  // distraído minutos depois não pode remover sem novo aviso.
  useEffect(() => {
    if (!confirmandoRemocao) return undefined;
    const t = setTimeout(() => setConfirmandoRemocao(null), 4000);
    return () => clearTimeout(t);
  }, [confirmandoRemocao]);

  const removeStep = (stepUid) => {
    // Com um único passo o botão está desativado; isto é a segunda guarda.
    if (steps.length === 1) return;
    if (
      confirmandoRemocao?.tipo === "passo" &&
      confirmandoRemocao.uid === stepUid
    ) {
      setConfirmandoRemocao(null);
      setSteps((prev) => prev.filter((s) => s.uid !== stepUid));
      return;
    }
    setConfirmandoRemocao({ tipo: "passo", uid: stepUid });
  };

  const updateField = (stepUid, fieldUid, changes) =>
    setSteps((prev) =>
      prev.map((s) =>
        s.uid !== stepUid
          ? s
          : {
              ...s,
              fields: s.fields.map((f) =>
                f.uid === fieldUid ? { ...f, ...changes } : f,
              ),
            },
      ),
    );

  const addField = (stepUid) =>
    setSteps((prev) =>
      prev.map((s) =>
        s.uid !== stepUid
          ? s
          : {
              ...s,
              fields: [
                ...s.fields,
                {
                  uid: makeUid(),
                  // Novo: sem id até à gravação — é lá que o ganha,
                  // derivado do rótulo que entretanto lhe derem.
                  id: null,
                  label: "",
                  type: "text",
                  required: true,
                  placeholder: "",
                  papel: "",
                  options: [],
                  validatePositive: false,
                  validateFutureDate: false,
                },
              ],
            },
      ),
    );

  const removeField = (stepUid, fieldUid) => {
    if (
      confirmandoRemocao?.tipo === "campo" &&
      confirmandoRemocao.stepUid === stepUid &&
      confirmandoRemocao.fieldUid === fieldUid
    ) {
      setConfirmandoRemocao(null);
      setSteps((prev) =>
        prev.map((s) =>
          s.uid !== stepUid
            ? s
            : { ...s, fields: s.fields.filter((f) => f.uid !== fieldUid) },
        ),
      );
      return;
    }
    setConfirmandoRemocao({ tipo: "campo", stepUid, fieldUid });
  };

  const handleTypeChange = (stepUid, fieldUid, newType) => {
    // Papéis válidos por tipo: texto pode ser título/local; data pode ser
    // data; morada (o tipo estruturado) pode ser morada; estilo pode ser
    // checkbox ou radio. Ao mudar de tipo, um papel que já não faça
    // sentido é limpo.
    const papelValido = (papel) => {
      if (papel === "titulo" || papel === "local") return newType === "text";
      if (papel === "data") return newType === "date";
      if (papel === "morada") return newType === "morada";
      if (papel === "estilo") return newType === "checkbox" || newType === "radio";
      return false;
    };
    setSteps((prev) =>
      prev.map((s) =>
        s.uid !== stepUid
          ? s
          : {
              ...s,
              fields: s.fields.map((f) =>
                f.uid !== fieldUid
                  ? f
                  : {
                      ...f,
                      type: newType,
                      papel: papelValido(f.papel) ? f.papel : "",
                      options: ["radio", "checkbox"].includes(newType)
                        ? [{ uid: makeUid(), value: "" }]
                        : [],
                    },
              ),
            },
      ),
    );
  };
  const updateOption = (stepUid, fieldUid, idx, value) =>
    setSteps((prev) =>
      prev.map((s) =>
        s.uid !== stepUid
          ? s
          : {
              ...s,
              fields: s.fields.map((f) =>
                f.uid !== fieldUid
                  ? f
                  : {
                      ...f,
                      options: f.options.map((o, i) =>
                        i === idx ? { ...o, value } : o,
                      ),
                    },
              ),
            },
      ),
    );

  const addOption = (stepUid, fieldUid) =>
    setSteps((prev) =>
      prev.map((s) =>
        s.uid !== stepUid
          ? s
          : {
              ...s,
              fields: s.fields.map((f) =>
                f.uid !== fieldUid
                  ? f
                  : {
                      ...f,
                      options: [...f.options, { uid: makeUid(), value: "" }],
                    },
              ),
            },
      ),
    );

  const removeOption = (stepUid, fieldUid, idx) =>
    setSteps((prev) =>
      prev.map((s) =>
        s.uid !== stepUid
          ? s
          : {
              ...s,
              fields: s.fields.map((f) =>
                f.uid !== fieldUid
                  ? f
                  : { ...f, options: f.options.filter((_, i) => i !== idx) },
              ),
            },
      ),
    );

  const handleDragStart = ({ active }) => {
    // Arrastar desarma qualquer confirmação pendente — depois de mover
    // um campo, o primeiro clique volta a armar, nunca remove logo.
    setConfirmandoRemocao(null);
    const activeId = active.id;
    if (String(activeId).startsWith(STEP_PREFIX)) {
      const stepUid = String(activeId).replace(STEP_PREFIX, "");
      const idx = steps.findIndex((s) => s.uid === stepUid);
      setDraggingType("step");
      setDraggingPreview(
        idx !== -1
          ? `Passo ${idx + 1}${steps[idx].title ? `: ${steps[idx].title}` : ""}`
          : "Passo",
      );
    } else if (String(activeId).startsWith(FIELD_PREFIX)) {
      const fieldUid = String(activeId).replace(FIELD_PREFIX, "");
      let label = "Campo";
      steps.forEach((s) => {
        const f = s.fields.find((f) => f.uid === fieldUid);
        if (f) label = f.label || "Campo sem nome";
      });
      setDraggingType("field");
      setDraggingPreview(label);
    } else if (String(activeId).startsWith(OPT_PREFIX)) {
      const optUid = String(activeId).replace(OPT_PREFIX, "");
      let optValue = "";
      steps.forEach((s) => {
        s.fields.forEach((f) => {
          const opt = f.options.find((o) => o.uid === optUid);
          if (opt) optValue = opt.value || "Opção sem nome";
        });
      });
      setDraggingType("option");
      setDraggingPreview(optValue || null);
    }
  };

  const handleDragEnd = ({ active, over }) => {
    const tipo = draggingType;
    setDraggingType(null);
    setDraggingPreview(null);
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (tipo === "step") {
      const fromUid = activeId.replace(STEP_PREFIX, "");
      const toUid = overId.replace(STEP_PREFIX, "");
      setSteps((prev) => {
        const from = prev.findIndex((s) => s.uid === fromUid);
        const to = prev.findIndex((s) => s.uid === toUid);
        if (from === -1 || to === -1) return prev;
        return arrayMove(prev, from, to);
      });
      return;
    }

    if (tipo === "field") {
      const fieldUid = activeId.replace(FIELD_PREFIX, "");
      setSteps((prev) => {
        const origemIdx = prev.findIndex((s) =>
          s.fields.some((f) => f.uid === fieldUid),
        );
        if (origemIdx === -1) return prev;

        let destinoIdx = prev.findIndex((s) =>
          s.fields.some((f) => `${FIELD_PREFIX}${f.uid}` === overId),
        );
        if (destinoIdx === -1) {
          destinoIdx = prev.findIndex(
            (s) => `${DROPZONE_PREFIX}${s.uid}` === overId,
          );
        }
        if (destinoIdx === -1) return prev;

        const novo = prev.map((s) => ({ ...s, fields: [...s.fields] }));
        const campoIdx = novo[origemIdx].fields.findIndex(
          (f) => f.uid === fieldUid,
        );
        const [campo] = novo[origemIdx].fields.splice(campoIdx, 1);

        let posDestino = novo[destinoIdx].fields.findIndex(
          (f) => `${FIELD_PREFIX}${f.uid}` === overId,
        );
        if (posDestino === -1) posDestino = novo[destinoIdx].fields.length;
        novo[destinoIdx].fields.splice(posDestino, 0, campo);
        return novo;
      });
      return;
    }

    if (tipo === "option") {
      const optUid = activeId.replace(OPT_PREFIX, "");
      // Tipo do campo de origem (guardado no data do useSortable)
      const srcFieldType = active.data?.current?.fieldType;

      setSteps((prev) => {
        // Encontrar origem
        let srcStepIdx = -1,
          srcFieldIdx = -1,
          srcOptIdx = -1;
        prev.forEach((s, si) => {
          s.fields.forEach((f, fi) => {
            const oi = f.options.findIndex((o) => o.uid === optUid);
            if (oi !== -1) {
              srcStepIdx = si;
              srcFieldIdx = fi;
              srcOptIdx = oi;
            }
          });
        });
        if (srcStepIdx === -1) return prev;

        // Encontrar destino — pode ser outra opção (OPT_PREFIX) ou zona vazia (OPTZONE_PREFIX)
        let dstStepIdx = -1,
          dstFieldIdx = -1,
          dstOptIdx = -1;
        if (overId.startsWith(OPT_PREFIX)) {
          const overOptUid = overId.replace(OPT_PREFIX, "");
          prev.forEach((s, si) => {
            s.fields.forEach((f, fi) => {
              const oi = f.options.findIndex((o) => o.uid === overOptUid);
              if (oi !== -1) {
                dstStepIdx = si;
                dstFieldIdx = fi;
                dstOptIdx = oi;
              }
            });
          });
        } else if (overId.startsWith(OPTZONE_PREFIX)) {
          const overFieldUid = overId.replace(OPTZONE_PREFIX, "");
          prev.forEach((s, si) => {
            s.fields.forEach((f, fi) => {
              if (f.uid === overFieldUid) {
                dstStepIdx = si;
                dstFieldIdx = fi;
                dstOptIdx = -1;
              }
            });
          });
        }
        if (dstStepIdx === -1) return prev;

        // Só permite mover para campos do mesmo tipo (radio→radio, checkbox→checkbox)
        const dstField = prev[dstStepIdx].fields[dstFieldIdx];
        if (dstField.type !== srcFieldType) return prev;

        const novo = prev.map((s) => ({
          ...s,
          fields: s.fields.map((f) => ({ ...f, options: [...f.options] })),
        }));

        const isMesmoCampo =
          srcStepIdx === dstStepIdx && srcFieldIdx === dstFieldIdx;
        if (isMesmoCampo) {
          if (dstOptIdx === -1 || dstOptIdx === srcOptIdx) return prev;
          novo[srcStepIdx].fields[srcFieldIdx].options = arrayMove(
            novo[srcStepIdx].fields[srcFieldIdx].options,
            srcOptIdx,
            dstOptIdx,
          );
        } else {
          // Move para outro campo
          const [opt] = novo[srcStepIdx].fields[srcFieldIdx].options.splice(
            srcOptIdx,
            1,
          );
          const insertAt =
            dstOptIdx === -1
              ? novo[dstStepIdx].fields[dstFieldIdx].options.length
              : dstOptIdx;
          novo[dstStepIdx].fields[dstFieldIdx].options.splice(insertAt, 0, opt);
        }
        return novo;
      });
    }
  };

  const handleDragCancel = () => {
    setDraggingType(null);
    setDraggingPreview(null);
  };

  const handleSave = async () => {
    const problemas = validar(nome, steps);
    if (problemas.length > 0) {
      setErro(problemas[0]);
      return;
    }
    setErro(null);
    setSaving(true);
    try {
      const finalSteps = buildStepsForSave(steps);
      const tipo = editingId
        ? await updateEventType({
            id: editingId,
            nome: nome.trim(),
            steps: finalSteps,
          })
        : await createEventType({ nome: nome.trim(), steps: finalSteps });
      onSaved(tipo);
    } catch (e) {
      console.error(e);
      setErro("Ocorreu um erro ao gravar. Tenta novamente.");
    }
    setSaving(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        backgroundColor: "var(--cream)",
        display: "flex",
        justifyContent: "center",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "720px",
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
        }}
      >
        {/* Cabeçalho */}
        <div
          style={{
            position: "sticky",
            top: 0,
            backgroundColor: "var(--cream)",
            zIndex: 1,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px 20px 12px",
            borderBottom: "1px solid var(--gold-light)",
          }}
        >
          <h2
            style={{
              fontFamily: "Playfair Display, serif",
              fontSize: "18px",
              color: "var(--charcoal)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              margin: 0,
            }}
          >
            {editingId ? "Editar Tipo de Evento" : "Novo Tipo de Evento"}
          </h2>
          <button
            onClick={onCancel}
            style={{
              fontSize: "20px",
              color: "var(--gray-mid)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Corpo */}
        <div style={{ padding: "20px", flex: 1 }}>
          {/* A doutrina do modelo de evento — ligação viva, ao contrário
              do modelo de comunicado, que é cópia. Uma linha sempre
              visível, para TODOS os modelos, não só o predefinido. */}
          <p
            style={{
              fontSize: "11.5px",
              fontStyle: "italic",
              color: "var(--gray-mid)",
              margin: "0 0 16px 0",
            }}
          >
            Alterações aplicam-se já aos formulários por responder.
          </p>
          {isPredefinido && (
            <p
              style={{
                fontSize: "12px",
                color: "#92400E",
                backgroundColor: "#FEF3C7",
                border: "1px solid #FDE68A",
                borderRadius: "8px",
                padding: "10px 14px",
                margin: "0 0 20px 0",
              }}
            >
              ⚠ Este é o tipo de evento predefinido — alterações aqui afectam o
              questionário do Casamento já em uso.
            </p>
          )}
          <div style={{ marginBottom: "24px" }}>
            <label style={labelStyle}>Nome do Tipo de Evento *</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Batizado"
              style={{ ...inputBaseStyle, fontSize: "15px" }}
            />
          </div>

          <p
            style={{
              fontSize: "11px",
              color: "var(--gray-mid)",
              margin: "0 0 14px 0",
            }}
          >
            ⠿ Arrasta pela pega para reordenar passos, campos e opções. Um campo
            pode ser arrastado para outro passo. (Ao pegar num passo, a lista
            compacta-se para reordenares num relance.)
          </p>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={steps.map((s) => `${STEP_PREFIX}${s.uid}`)}
              strategy={verticalListSortingStrategy}
            >
              {steps.map((step, stepIndex) => (
                <StepCard
                  key={step.uid}
                  step={step}
                  stepIndex={stepIndex}
                  draggingType={draggingType}
                  unicoPasso={steps.length === 1}
                  confirmarRemocaoPasso={
                    confirmandoRemocao?.tipo === "passo" &&
                    confirmandoRemocao.uid === step.uid
                  }
                  campoAConfirmar={
                    confirmandoRemocao?.tipo === "campo" &&
                    confirmandoRemocao.stepUid === step.uid
                      ? confirmandoRemocao.fieldUid
                      : null
                  }
                  gruposPrazo={gruposPrazo}
                  onUpdateStep={(changes) => updateStep(step.uid, changes)}
                  onRemoveStep={() => removeStep(step.uid)}
                  onAddField={() => addField(step.uid)}
                  onUpdateField={(fieldUid, changes) =>
                    updateField(step.uid, fieldUid, changes)
                  }
                  onRemoveField={(fieldUid) => removeField(step.uid, fieldUid)}
                  onTypeChange={(fieldUid, newType) =>
                    handleTypeChange(step.uid, fieldUid, newType)
                  }
                  onUpdateOption={(fieldUid, idx, val) =>
                    updateOption(step.uid, fieldUid, idx, val)
                  }
                  onAddOption={(fieldUid) => addOption(step.uid, fieldUid)}
                  onRemoveOption={(fieldUid, idx) =>
                    removeOption(step.uid, fieldUid, idx)
                  }
                />
              ))}
            </SortableContext>

            <DragOverlay>
              {draggingPreview ? (
                <div
                  style={{
                    backgroundColor: "white",
                    borderRadius: "12px",
                    padding: "14px 18px",
                    boxShadow: "0 10px 32px rgba(0,0,0,0.2)",
                    border: "1.5px solid var(--gold)",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "var(--charcoal)",
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  ⠿ {draggingPreview}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          <button
            onClick={addStep}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              fontSize: "13px",
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              border: "1.5px dashed var(--gold-light)",
              color: "var(--gold)",
              backgroundColor: "transparent",
              cursor: "pointer",
            }}
          >
            + Adicionar Passo
          </button>
        </div>

        {/* Rodapé */}
        <div
          style={{
            position: "sticky",
            bottom: 0,
            backgroundColor: "white",
            borderTop: "1px solid var(--gold-light)",
            padding: "16px 20px",
          }}
        >
          {erro && (
            <p
              style={{
                fontSize: "12px",
                color: "#EF4444",
                margin: "0 0 10px 0",
                textAlign: "right",
              }}
            >
              ⚠ {erro}
            </p>
          )}
          <div
            style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}
          >
            <button
              onClick={onCancel}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                fontSize: "13px",
                border: "1.5px solid var(--gold-light)",
                color: "var(--gray-mid)",
                backgroundColor: "white",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "10px 24px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "600",
                border: "none",
                color: "white",
                backgroundColor: saving ? "var(--gold-light)" : "var(--gold)",
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving
                ? "A gravar..."
                : editingId
                  ? "Guardar Alterações"
                  : "Guardar Tipo de Evento"}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}