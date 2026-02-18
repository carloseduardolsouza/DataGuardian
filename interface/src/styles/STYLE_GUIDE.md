# DataGuardian — Guia de Estilos

Documento de referência para manter consistência visual em todas as páginas.
**Tecnologia:** CSS Modules + CSS Custom Properties (tokens globais em `tokens.css`)

---

## 1. Arquitetura de estilos

```
interface/src/
├── styles/
│   ├── tokens.css       ← variáveis globais (cores, espaçamento, tipografia)
│   └── STYLE_GUIDE.md   ← este arquivo
├── index.css            ← reset global + importa tokens.css
└── pages/*/
    └── *.module.css     ← estilos escopados por componente (CSS Modules)
```

### Regras

| Regra | Descrição |
|-------|-----------|
| **CSS Modules** | Todo estilo de componente/página usa `.module.css` — classes são automaticamente escopadas |
| **Tokens** | Nunca use valores fixos de cor, espaçamento ou tipografia. Use sempre `var(--token)` |
| **Sem globals** | Não adicione seletores de elemento (`div`, `p`, `h1`) em arquivos `.module.css` |
| **Dark mode** | Controlado pelo atributo `data-theme="dark"` no elemento raiz — os tokens mudam automaticamente |

---

## 2. Paleta de cores (tokens)

### Backgrounds e superfícies

| Token | Light | Dark | Uso |
|-------|-------|------|-----|
| `--color-bg` | `#f4f6fb` | `#0d0f1a` | Fundo principal da página |
| `--color-surface` | `#ffffff` | `#161926` | Cards, modais, painéis |
| `--color-surface-elevated` | `#ffffff` | `#1e2235` | Hover de linhas, tooltips, sub-painéis |
| `--color-sidebar-bg` | `#1e2235` | `#0a0c15` | Sidebar (sempre escuro) |

### Bordas

| Token | Uso |
|-------|-----|
| `--color-border` | Bordas visíveis (cards, inputs, divisores) |
| `--color-border-subtle` | Bordas internas leves (linhas de tabela, separadores) |

### Brand / Primary

| Token | Uso |
|-------|-----|
| `--color-primary` | Botões CTA, links, tabs ativas, bordas de foco |
| `--color-primary-hover` | Hover de botões primários |
| `--color-primary-muted` | Backgrounds de badges, highlights, focus ring |

### Texto

| Token | Uso |
|-------|-----|
| `--color-text` | Texto principal |
| `--color-text-muted` | Labels, metadados, placeholders |
| `--color-text-subtle` | Texto desativado, hints |
| `--color-text-on-primary` | Texto sobre fundo primário |
| `--color-text-sidebar` | Itens de navegação da sidebar |
| `--color-text-sidebar-muted` | Labels de grupo, ícones inativos |

### Feedback semântico

| Token | Uso |
|-------|-----|
| `--color-success` / `--color-success-muted` | Status healthy, OK, sucesso |
| `--color-warning` / `--color-warning-muted` | Status warning, alertas não críticos |
| `--color-danger` / `--color-danger-muted` | Status critical, erros, exclusão |
| `--color-info` / `--color-info-muted` | Informações, FK, progresso |

---

## 3. Tipografia

A fonte padrão é **Inter**. Monospace usa **JetBrains Mono / Consolas** (query editor, valores de tabela).

| Token | Tamanho | Uso |
|-------|---------|-----|
| `--font-size-2xs` | 10px | Badges compactos, números de linha |
| `--font-size-xs` | 11px | Labels de grupo (ALLCAPS), metadados |
| `--font-size-sm` | 13px | Corpo padrão, labels de input, itens de lista |
| `--font-size-base` | 14px | Texto padrão do sistema |
| `--font-size-md` | 15px | Títulos de seção |
| `--font-size-lg` | 18px | Títulos de página |
| `--font-size-xl` | 22px | Títulos de tela (ex: Login) |
| `--font-size-2xl` | 28px | Valores de stat cards |

### Pesos

| Token | Valor | Uso |
|-------|-------|-----|
| `--font-weight-normal` | 400 | Corpo |
| `--font-weight-medium` | 500 | Labels, itens de nav |
| `--font-weight-semi` | 600 | Títulos de seção, botões |
| `--font-weight-bold` | 700 | Títulos principais, brand |

---

## 4. Espaçamento

Baseado em múltiplos de 4px:

| Token | Valor | Uso típico |
|-------|-------|------------|
| `--space-1` | 4px | Gaps mínimos entre ícone e texto |
| `--space-2` | 8px | Gap padrão em grupos pequenos |
| `--space-3` | 12px | Padding interno de badges, items da sidebar |
| `--space-4` | 16px | Padding de inputs, padding lateral padrão |
| `--space-5` | 20px | Padding de cards |
| `--space-6` | 24px | Padding de seções |
| `--space-8` | 32px | Margin entre seções maiores |
| `--space-10` | 40px | Padding de formulários |

---

## 5. Border radius

| Token | Valor | Uso |
|-------|-------|-----|
| `--radius-sm` | 6px | Badges, inputs pequenos, botões compactos |
| `--radius-md` | 10px | Inputs, botões, cards pequenos |
| `--radius-lg` | 14px | Cards de conteúdo |
| `--radius-xl` | 20px | Cards de login/modal |
| `--radius-full` | 9999px | Pills, avatares, status dots |

---

## 6. Sombras

| Token | Uso |
|-------|-----|
| `--shadow-sm` | Cards no estado padrão |
| `--shadow-md` | Cards no hover, dropdowns |
| `--shadow-lg` | Modais, card de login |

---

## 7. Transições

| Token | Valor | Uso |
|-------|-------|-----|
| `--transition-fast` | 130ms ease | Hover de botões, cores de texto |
| `--transition-base` | 200ms ease | Slides, acordeões |
| `--transition-slow` | 300ms ease | Animações de página |

---

## 8. Layout

| Token | Valor | Uso |
|-------|-------|-----|
| `--sidebar-width` | 240px | Largura da sidebar de navegação |
| `--topbar-height` | 64px | Altura da barra de topo |

---

## 9. Padrões de componentes

### Botão primário
```css
background: var(--color-primary);
color: var(--color-text-on-primary);
border: none;
border-radius: var(--radius-md);
font-weight: var(--font-weight-semi);
padding: 10px var(--space-4);
transition: background var(--transition-fast);

:hover → background: var(--color-primary-hover)
:disabled → opacity: 0.6; cursor: not-allowed
```

### Botão secundário / outline
```css
background: transparent;
border: 1px solid var(--color-border);
color: var(--color-text-muted);
border-radius: var(--radius-md);
:hover → background: var(--color-surface-elevated); color: var(--color-text)
```

### Input de texto
```css
background: var(--color-bg);
border: 1.5px solid var(--color-border);
border-radius: var(--radius-md);
color: var(--color-text);
:focus → border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-muted)
```

### Card de conteúdo
```css
background: var(--color-surface);
border: 1px solid var(--color-border);
border-radius: var(--radius-lg);
box-shadow: var(--shadow-sm);
padding: var(--space-5);
:hover → box-shadow: var(--shadow-md)
```

### Status badge (pill)
```css
display: inline-flex; align-items: center; gap: 5px;
padding: 3px 9px;
border-radius: var(--radius-full);
font-size: var(--font-size-xs);
font-weight: var(--font-weight-medium);

/* Variantes semânticas */
.success → background: var(--color-success-muted); color: var(--color-success)
.warning → background: var(--color-warning-muted); color: var(--color-warning)
.danger  → background: var(--color-danger-muted);  color: var(--color-danger)
.info    → background: var(--color-info-muted);    color: var(--color-info)
```

### Tabela de dados
```css
th: background: var(--color-surface-elevated); font-size: var(--font-size-xs); text-transform: uppercase
td: font-size: var(--font-size-sm); border-bottom: 1px solid var(--color-border-subtle)
tr:hover td: background: var(--color-surface-elevated)
```

---

## 10. Estrutura de páginas

### Página simples (ex: Dashboard)
```
DashboardPage
├── Sidebar (fixo, esquerda)
└── Main
    ├── Topbar (sticky, 64px)
    └── Content (.content — com padding, overflow-y: auto)
        └── conteúdo da página
```

### Página com layout próprio (ex: Datasources, Executions com split view)
```
DashboardPage
├── Sidebar (fixo, esquerda)
└── Main
    ├── Topbar (sticky, 64px)
    └── Content (.contentFull — sem padding, overflow: hidden, display: flex)
        └── layout interno da página (ex: 3 painéis)
```

> Para usar `.contentFull`, adicione `activePage === 'sua-pagina'` na condição em `DashboardPage.tsx`.

---

## 11. Icones

Todos os ícones são **SVGs inline** com `stroke="currentColor"` — herdam a cor do CSS.

Dimensões padrão:
- **Sidebar:** 18×18
- **Botões:** 14×14 ou 16×16
- **Decorativos grandes:** 36–56px

Sempre inclua `strokeLinecap="round"` e `strokeLinejoin="round"` para consistência visual.

---

## 12. Dark mode

O tema escuro é aplicado via `data-theme="dark"` no elemento raiz (`App.tsx`). Os tokens em `tokens.css` definem os dois temas:

```css
:root { /* light */ }
[data-theme="dark"] { /* dark — sobrescreve as mesmas variáveis */ }
```

**Regras:**
- Nunca use cores fixas (`#fff`, `#000`) em componentes — use sempre tokens
- A sidebar (`--color-sidebar-bg`) é sempre escura em ambos os temas
- Sombras ficam mais intensas no dark mode (já definidas nos tokens)
- O `localStorage` persiste a escolha do usuário (chave: `dg-theme`)

---

## 13. Checklist para novas páginas

- [ ] Criar `NomePagina.tsx` e `NomePagina.module.css` em `src/pages/NomePagina/`
- [ ] Usar apenas `var(--token)` — zero valores fixos de cor/espaço
- [ ] Adicionar `activePage === 'nome-pagina'` em `DashboardPage.tsx`
- [ ] Se a página tem layout próprio (painéis, splitview): usar `.contentFull` em vez de `.content`
- [ ] Adicionar rota no `Sidebar.tsx` (`navItems`) com ícone SVG
- [ ] Testar nos dois temas (dark e light)
