# DataGuardian - Style Guide

Guia oficial para manter consistencia visual no frontend.
Tecnologia: CSS Modules + CSS Custom Properties (tokens globais em `tokens.css`).

---

## 1. Objetivo

Este guia define o estilo atual do produto:

- interfaces claras e orientadas a operacao
- hierarquia visual forte (header, cards, secoes)
- profundidade moderada (sombras, bordas, gradientes sutis)
- interacao previsivel (hover/focus/disabled consistentes)
- total compatibilidade com light/dark mode via tokens

---

## 2. Estrutura de estilos

```txt
interface/src/
|-- styles/
|   |-- tokens.css
|   `-- STYLE_GUIDE.md
|-- index.css
`-- pages/*/
    `-- *.module.css
```

Regras obrigatorias:

- Use CSS Modules para estilos de pagina/componente.
- Use somente `var(--token)` para cores, espacamentos, fontes, raio e sombra.
- Nao use seletor global de elemento em `.module.css`.
- Nao use cor fixa (`#fff`, `#000`, etc.) em componentes.
- Prefira `color-mix(...)` com tokens quando precisar de variacao suave.

---

## 3. Tokens (fonte unica)

Sempre consumir valores de `tokens.css`:

- Cores: `--color-*`
- Espacamento: `--space-*`
- Tipografia: `--font-size-*`, `--font-weight-*`
- Radius: `--radius-*`
- Sombras: `--shadow-*`
- Transicoes: `--transition-*`
- Layout: `--sidebar-width`, `--topbar-height`

Se um valor novo for recorrente, promova para token.

---

## 4. Linguagem visual atual

### 4.1 Background de pagina

Padrao recomendado para paginas dentro do dashboard:

```css
background:
  radial-gradient(circle at 15% -10%, color-mix(in srgb, var(--color-primary) 10%, transparent), transparent 45%),
  radial-gradient(circle at 85% 0%, color-mix(in srgb, var(--color-info) 8%, transparent), transparent 40%),
  var(--color-bg);
```

Regras:

- Gradiente sempre sutil e com opacidade baixa.
- Nunca competir com o conteudo.
- Se a pagina for extremamente densa, pode usar apenas `var(--color-bg)`.

### 4.2 Header de pagina

Padrao:

- titulo principal com `--font-size-lg`
- subtitulo com `--font-size-sm`
- borda inferior sutil
- superficie levemente translucida com blur opcional
- acoes principais no canto direito (ex: `Novo ...`)

### 4.3 Cards

Padrao de secao:

- `background: var(--color-surface)`
- `border: 1px solid var(--color-border)`
- `border-radius: var(--radius-lg)`
- `box-shadow: var(--shadow-sm)`
- hover: elevar para `--shadow-md` e ajustar borda com `color-mix`

Opcional (recomendado em telas de gestao): linha de destaque inferior com gradiente sutil no pseudo-elemento `::after`.

---

## 5. Formularios

### 5.1 Campos

Inputs/selects:

- fundo derivado de `--color-bg` + `--color-surface`
- borda `1.5px` com `--color-border`
- focus ring com `--color-primary-muted`
- hover suave para `--color-surface-elevated`

Labels:

- `--font-size-xs`
- uppercase
- `letter-spacing` leve
- `--color-text-muted`

### 5.2 Blocos de opcoes

Para checkboxes/toggles de configuracao:

- usar grid responsivo
- cada item dentro de "mini-card" com borda sutil
- hover reforca borda e fundo

### 5.3 Fluxos de criacao

Novo padrao:

- Criacao/edicao primarias devem acontecer em `Modal` quando o formulario for grande.
- A pagina principal mostra listagem e acoes.
- Modal concentra validacao, erros locais e CTA de salvar.

---

## 6. Tabelas e dados

Padrao:

- header em `--color-surface-elevated`
- colunas com label em uppercase (`--font-size-xs`)
- linhas com `border-bottom` sutil
- hover de linha em `--color-surface-elevated`
- acoes por linha com botoes outline pequenos

Status badge:

- formato pill
- variante semantica (`success`, `warning`, `danger`, `info`, `queued`)
- variante `running` pode usar animacao de pulso discreta no indicador

---

## 7. Botoes

### Primario

```css
background: var(--color-primary);
color: var(--color-text-on-primary);
border: none;
border-radius: var(--radius-md);
font-weight: var(--font-weight-semi);
transition: background var(--transition-fast), transform var(--transition-fast);
```

Hover: `--color-primary-hover` + leve `translateY(-1px)`.
Disabled: `opacity: 0.6` + `cursor: not-allowed`.

### Secundario/outline

- fundo transparente
- borda `--color-border`
- texto `--color-text-muted`
- hover em `--color-surface-elevated` com borda mais forte

### Acao destrutiva

- usar tokens `--color-danger` / `--color-danger-muted`
- manter contraste e destaque de risco

---

## 8. Modal (padrao)

Usar `ui/overlay/Modal`:

- `title`, `subtitle`, `body`, `footer`
- fechamento por botao e clique fora
- tamanhos: `sm`, `md`, `lg`

Boas praticas:

- erro de submit dentro da modal, proximo ao formulario
- footer com `Cancelar` + CTA principal
- desabilitar fechamento durante submit critico, quando necessario

---

## 9. Responsividade

Breakpoints recomendados:

- `<=1080px`: grids de 3 colunas para 2
- `<=900px`: grids para 1 coluna, footer empilhado
- manter areas clicaveis confortaveis em mobile

Checklist responsivo:

- nenhuma coluna estoura horizontalmente sem necessidade
- botoes continuam legiveis/tocaveis
- formulario permanece navegavel dentro da modal

---

## 10. Acessibilidade minima

Obrigatorio:

- contraste suficiente entre texto e fundo
- estado de foco visivel em controles interativos
- `:disabled` visualmente distinto
- sem dependencia de cor unica para indicar estado

Recomendado:

- usar texto junto de icone em acoes criticas
- evitar animacoes agressivas ou continuas sem necessidade

---

## 11. Do / Dont

Do:

- reaproveitar padroes existentes da Dashboard e telas recentes
- manter ritmo visual (espacamento, borda, sombra) consistente
- usar semantica de cor correta para status e risco

Dont:

- inventar novo padrao de card/botao sem necessidade
- misturar estilos de alta saturacao com superfices neutras
- colocar formulario longo inline quando modal ja resolve melhor

---

## 12. Checklist para nova pagina

- [ ] Arquivos `NomePagina.tsx` e `NomePagina.module.css`
- [ ] Somente tokens (`var(--...)`)
- [ ] Header com titulo/subtitulo e CTA quando aplicavel
- [ ] Conteudo principal em cards padronizados
- [ ] Tabelas, badges e botoes seguindo este guia
- [ ] Fluxos de criacao/edicao avaliados para modal
- [ ] Testado em light e dark mode
- [ ] Testado em desktop e mobile
