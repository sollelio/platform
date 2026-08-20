# GitHub — Estrutura da Sollelio

> [!NOTE]
> **Objetivo:** mover o repositório privado atual da conta pessoal para a organização da empresa, sem alterar o código nem separar produtos em vários repositórios.

```text
CURRENT STATE  ──────▶  MIGRATION  ──────▶  TARGET STATE
srlhyo/dlm-app          transfer + rename   sollelio/platform
```

---

## 1. Estado atual

```mermaid
flowchart TB
    GH["GitHub"] --> U["👤 srlhyo<br/>conta pessoal"]
    U --> R["🔒 dlm-app<br/>private repository"]
    R --> M["main<br/>estável / produção atual"]
    R --> D["develop<br/>desenvolvimento atual"]

    classDef root fill:#111827,color:#ffffff,stroke:#111827,stroke-width:2px;
    classDef account fill:#e0f2fe,color:#0c4a6e,stroke:#0284c7,stroke-width:2px;
    classDef repo fill:#ede9fe,color:#4c1d95,stroke:#7c3aed,stroke-width:2px;
    classDef stable fill:#dcfce7,color:#14532d,stroke:#16a34a,stroke-width:2px;
    classDef active fill:#fef3c7,color:#78350f,stroke:#f59e0b,stroke-width:3px;
    class GH root;
    class U account;
    class R repo;
    class M stable;
    class D active;
```

- O repositório pertence atualmente à conta pessoal `srlhyo`.
- `dlm-app` continua privado e conserva as branches `main` e `develop`.
- O desenvolvimento ativo está em `develop`.
- O nome `dlm-app` ainda reflete a origem do projeto: Do Luxo à Mesa.

---

## 2. Estrutura final

```mermaid
flowchart TB
    GH["GitHub"] --> O["🏢 Organization: sollelio<br/>identidade GitHub da empresa"]
    O --> R["🔒 platform<br/>private monorepo"]
    R --> M["main<br/>stable / production"]
    R --> D["develop<br/>Sollelio vNext"]

    classDef root fill:#111827,color:#ffffff,stroke:#111827,stroke-width:2px;
    classDef org fill:#ccfbf1,color:#134e4a,stroke:#0d9488,stroke-width:3px;
    classDef repo fill:#ede9fe,color:#4c1d95,stroke:#7c3aed,stroke-width:3px;
    classDef stable fill:#dcfce7,color:#14532d,stroke:#16a34a,stroke-width:2px;
    classDef active fill:#fef3c7,color:#78350f,stroke:#f59e0b,stroke-width:2px;
    class GH root;
    class O org;
    class R repo;
    class M stable;
    class D active;
```

| Elemento | Significado |
|---|---|
| `sollelio` | GitHub Organization da empresa |
| `platform` | Repositório principal e privado da plataforma |
| `main` | Branch associada à versão estável / produção atual |
| `develop` | Branch onde evolui a nova plataforma — **Sollelio vNext** |

> [!IMPORTANT]
> A migração reorganiza **propriedade e nome** no GitHub. Não deve alterar o conteúdo das branches nem a versão que está em produção.

---

## 3. Antes vs. depois

| Antes | Depois |
|---|---|
| `srlhyo/dlm-app` | `sollelio/platform` |
| Conta pessoal | Organização da empresa |
| Nome ligado ao primeiro cliente | Nome umbrella da plataforma |
| Repositório privado | Repositório privado |

![Migração de srlhyo/dlm-app para sollelio/platform](./images/github-migration.png)

```mermaid
flowchart TB
    A["srlhyo/dlm-app"] -->|transfer| B["sollelio/dlm-app"]
    B -->|rename| C["sollelio/platform"]

    classDef before fill:#f3f4f6,color:#111827,stroke:#6b7280,stroke-width:2px;
    classDef middle fill:#fef3c7,color:#78350f,stroke:#f59e0b,stroke-width:2px;
    classDef after fill:#ccfbf1,color:#134e4a,stroke:#0d9488,stroke-width:3px;
    class A before;
    class B middle;
    class C after;
```

---

## 4. O que representa cada nível

```mermaid
flowchart TB
    S["SOLLELIO"] --> C["Company<br/>empresa"]
    S --> O["GitHub Organization<br/>sollelio"]
    S --> P["Platform<br/>plataforma umbrella"]
    P --> E["Product: Events"]
    P --> D["Product: Dental"]
    P --> F["Futuros produtos"]
    E --> T["Tenant / cliente:<br/>Do Luxo à Mesa"]

    classDef brand fill:#111827,color:#ffffff,stroke:#111827,stroke-width:3px;
    classDef identity fill:#ccfbf1,color:#134e4a,stroke:#0d9488,stroke-width:2px;
    classDef product fill:#ede9fe,color:#4c1d95,stroke:#7c3aed,stroke-width:2px;
    classDef tenant fill:#fef3c7,color:#78350f,stroke:#f59e0b,stroke-width:2px;
    class S brand;
    class C,O,P identity;
    class E,D,F product;
    class T tenant;
```

| Conceito | O que representa | Exemplo |
|---|---|---|
| **Sollelio** | Empresa e nome umbrella da plataforma | `Sollelio` |
| **Organization** | Espaço da empresa no GitHub | `github.com/sollelio` |
| **Repository** | Código principal da plataforma | `sollelio/platform` |
| **Product** | Capacidade comercial suportada pela plataforma | `Events`, futuramente `Dental` |
| **Tenant / cliente** | Negócio que usa um produto | `Do Luxo à Mesa` usa `Events` |

> [!TIP]
> **Sollelio não é um tenant.** Do Luxo à Mesa é um cliente/tenant. `Events` é um produto; `Dental` poderá ser outro.

---

## 5. Monorepo

### Decisão desta fase

```text
sollelio/platform     ← um único repositório privado
│
├── capacidades partilhadas da plataforma
├── engines partilhados
├── experience / design system
└── products
    ├── events
    └── dental
```

Os produtos começam como **módulos / bounded contexts dentro de `platform`**. Nesta fase, não serão criados repositórios separados para `events`, `dental`, `workflows` ou `design-system`.

> [!CAUTION]
> A árvore acima é uma **direção arquitetural conceptual**, não uma decisão definitiva sobre nomes de diretórios ou implementação.

| Agora | Não agora |
|---|---|
| `sollelio/platform` | `sollelio/events` |
| Produtos como módulos | `sollelio/dental` |
| Código partilhado no monorepo | `sollelio/workflows` |
| Uma evolução coordenada | `sollelio/design-system` |

---

## 6. Passos para executar

### A. Preparar

- [ ] Criar a GitHub Organization `sollelio`.
- [ ] Confirmar que a conta pessoal `srlhyo` é **Owner**.
- [ ] Ativar 2FA em `srlhyo` e, depois de verificar membros/colaboradores, configurar a política de 2FA da organização.
- [ ] Identificar e registar o commit/version atualmente em produção.
- [ ] Confirmar que o working tree local está num estado conhecido antes da migração.

### B. Transferir e renomear

- [ ] Transferir `srlhyo/dlm-app` para a organização `sollelio`.
- [ ] Confirmar que passa a existir `sollelio/dlm-app`.
- [ ] Renomear `dlm-app` para `platform`.
- [ ] Confirmar que o destino final é `sollelio/platform`.
- [ ] Confirmar que o repositório continua **private**.
- [ ] Confirmar que `main` e `develop` continuam intactas.

### C. Atualizar o repositório local

Ver o remote atual:

```bash
git remote -v
```

Atualizar o remote, se necessário:

```bash
git remote set-url origin git@github.com:sollelio/platform.git
```

Sincronizar e confirmar branches:

```bash
git fetch
git branch -a
git branch --show-current
```

- [ ] Confirmar que `origin` aponta para `git@github.com:sollelio/platform.git`.
- [ ] Confirmar que `main` e `develop` aparecem localmente/remotamente.
- [ ] Confirmar que a branch atual continua a ser `develop`.

### D. Validar integrações e produção

- [ ] Confirmar **ChatGPT ↔ GitHub**.
- [ ] Confirmar **Codex**.
- [ ] Confirmar **deploy / staging**.
- [ ] Confirmar **Netlify** ou outros serviços ligados ao repositório.
- [ ] Atualizar referências que ainda usem `srlhyo/dlm-app`.
- [ ] Voltar a confirmar o commit/version atualmente em produção.
- [ ] Confirmar que a reorganização do GitHub **não alterou o código de produção**.

> [!WARNING]
> Redirecionamentos do GitHub podem manter links antigos a funcionar, mas integrações, deploy keys, webhooks e configurações externas devem ser verificados explicitamente.

---

## 7. Resultado esperado

![Estrutura final do GitHub e do monorepo Sollelio](./images/github-target-structure.png)

```mermaid
flowchart TB
    GH["GitHub"] --> ORG["SOLLELIO<br/>GitHub Organization"]
    ORG --> REPO["platform<br/>PRIVATE MONOREPO"]
    REPO --> MAIN["main<br/>stable / production"]
    REPO --> DEV["develop<br/>Sollelio vNext"]
    REPO -. direção conceptual .-> CAP["Platform capabilities"]
    REPO -. direção conceptual .-> ENG["Shared engines"]
    REPO -. direção conceptual .-> EXP["Experience / Design System"]
    REPO -. direção conceptual .-> PROD["Products"]
    PROD --> EVENTS["Events"]
    PROD --> DENTAL["Dental"]
    EVENTS --> DLM["Tenant: Do Luxo à Mesa"]
    DENTAL --> FUT["Futuros tenants"]

    classDef root fill:#111827,color:#ffffff,stroke:#111827,stroke-width:3px;
    classDef org fill:#ccfbf1,color:#134e4a,stroke:#0d9488,stroke-width:3px;
    classDef repo fill:#ede9fe,color:#4c1d95,stroke:#7c3aed,stroke-width:3px;
    classDef stable fill:#dcfce7,color:#14532d,stroke:#16a34a,stroke-width:2px;
    classDef active fill:#fef3c7,color:#78350f,stroke:#f59e0b,stroke-width:2px;
    classDef concept fill:#f3f4f6,color:#111827,stroke:#9ca3af,stroke-width:1px;
    classDef product fill:#e0e7ff,color:#312e81,stroke:#6366f1,stroke-width:2px;
    class GH root;
    class ORG org;
    class REPO repo;
    class MAIN stable;
    class DEV active;
    class CAP,ENG,EXP concept;
    class PROD,EVENTS,DENTAL,DLM,FUT product;
```

### Leitura rápida

```text
GitHub
└── SOLLELIO                         ← organização da empresa
    └── platform (private)           ← monorepo principal
        ├── main                     ← stable / production
        └── develop                  ← Sollelio vNext

platform — direção conceptual
├── Platform capabilities
├── Shared engines
├── Experience / Design System
└── Products
    ├── Events
    │   └── Tenant: Do Luxo à Mesa
    └── Dental
        └── futuros tenants
```

---

## 8. Regra para o futuro

> [!IMPORTANT]
> ## **Produto ≠ repository**
>
> Os produtos começam como módulos do monorepo `sollelio/platform`.

Um produto só deverá tornar-se um repositório separado quando existirem razões concretas, como:

- equipa independente;
- deployment independente;
- ciclo de release independente;
- ownership independente.

---

**Estado final de referência:** `sollelio/platform` · private · `main` + `develop` · monorepo.

<sub>Referências operacionais: [transferir um repositório](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository) · [renomear um repositório](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository) · [exigir 2FA na organização](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/requiring-two-factor-authentication-in-your-organization) · [atualizar o remote local](https://docs.github.com/en/get-started/git-basics/managing-remote-repositories)</sub>
