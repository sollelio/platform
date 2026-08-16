# 108 · A casa no endereço, também no admin

## O problema

`tenant_actual()` faz `select m.tenant_id from memberships … limit 1`. Com
uma membership por pessoa devolve a certa; com duas, devolve **a mais
antiga, em silêncio**. As escritas caem na casa errada sem erro nenhum.

É o último bloqueio real ao segundo cliente, e é o modo de falhar que a
casa já aprendeu a temer três vezes esta semana: não parte nada, mente.

**Ler primeiro:** `docs/decisoes-de-produto.md`, secção «Multi-tenant»
(15/08/2026), e `docs/invariantes.md`.

## A decisão (palavra do Hélio, 16/08/2026)

**A casa vem do endereço, no admin como já vem no lado público.**

```
/admin/:casa/inicio       /admin/:casa/documentos    /evento/:casa/:id/…
```

Não é padrão novo — é o mesmo do `/interesse/:slug` (migração 093). A
razão que o escolheu lá vale aqui: o endereço nunca mente, e um estado
invisível de «casa activa» é precisamente o que produz escritas no sítio
errado sem ninguém reparar.

Alternativas consideradas e recusadas: um seletor no topo (a casa passaria
a estado invisível — o problema que isto vem resolver); proibir membership
múltipla (adia em vez de resolver).

## O que fazer

### 1 · O servidor

`tenant_actual()` deixa de adivinhar. A casa passa a vir do pedido, e o
servidor **verifica que quem pede pertence a ela** — nunca aceitar um
tenant só porque veio de fora.

O padrão está feito em `tenant_por_slug(text)` (093) e em
`tenants_do_utilizador()` (090). O que falta é a junção das duas: uma
função que recebe o slug, confirma a membership, e devolve o id — ou nada.

⚠ `tenant_actual()` é usada como `default` de coluna em quinze tabelas
(migração 092) e dentro de várias funções `SECURITY DEFINER`. **Levanta
todos os usos antes de mexer.** Muda-la sem os ver é partir escritas em
silêncio, que é exactamente o que estamos a corrigir.

Se a mudança for grande, propõe o desenho e espera — o SQL é do Hélio, mas
o levantamento e a proposta são teus.

### 2 · As rotas

O `src/lib/rotasAdmin.js` tem doutrina escrita sobre isto: os ids dos
separadores nunca mudam, e «o URL é para humanos». Lê-o antes de tocar nas
rotas — o que fizeres tem de continuar a respeitá-lo.

Endereços antigos (`/admin/inicio` sem casa) têm de continuar a funcionar:
a Nádia tem-nos em favoritos. Enquanto houver uma casa só, redirecionam
para a dela. Esse redirect sai no dia da segunda casa — regista-o como
pendência, com essa condição escrita.

### 3 · O acesso

Alguém que peça uma casa a que não pertence não vê nada dessa casa. Não é
«lista vazia»: é um ecrã que diz que o endereço não é dele. O vazio
silencioso é o que a casa suspensa já produz por acidente, e está
registado como problema (pendência da 104).

## O que NÃO fazer

- **Não commites e não faças push.** O git é do Hélio.
- Não construas seletor de casa. A decisão foi o endereço.
- Não mudes texto de interface sem propor.
- Não instales dependências novas.

## O portão

`esbuild` + `eslint` + `build`, os três, entre cada lote. Baseline: 70
erros pré-existentes do react-hooks. Zero erros **novos**, contados por
ficheiro.

## Como trabalhar

1. **Levanta primeiro.** Todos os usos de `tenant_actual()` — nos defaults
   das colunas, dentro de funções, e no frontend. Mostra-me a lista antes
   de propor a mudança.
2. **Propõe o desenho** do lado do servidor e espera. O SQL é do Hélio.
3. As rotas e o frontend, em lotes, com o portão entre cada.

## O teste que prova que funciona

Com uma casa só, nada disto se exercita a sério. Cria um segundo tenant em
**staging** e uma membership tua nas duas — é a única forma de ver o bug
que isto corrige, e a única forma de saber que a correção pega.

Limpa no fim.