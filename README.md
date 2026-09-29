# LPX Private — ERP

Aplicação de gestão financeira da LPX Private. Construída sobre a mesma
estrutura do ERP da Rio Capital (React + Vite + Supabase), com todos os dados
repostos a zero e a lista de empresas substituída.

---

## 1. Base de dados (fazer primeiro)

O ERP tem de apontar para um projeto **Supabase novo e separado** do da Rio
Capital. Caso contrário as duas aplicações partilham os mesmos dados.

1. Criar projeto em <https://supabase.com/dashboard> (região Europa).
2. Abrir `supabase/schema.sql` — ou a página `/setup-base-dados.html` da app —
   e correr o SQL completo no *SQL Editor*. Cria tabelas, índices, políticas de
   acesso, realtime e as 16 contas bancárias.
3. Criar os utilizadores seguindo `/criar-utilizadores.html`.

## 2. Variáveis de ambiente

Copiar `.env.example` para `.env` e preencher com os dados do projeto Supabase
(*Project Settings → API*):

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxx
```

No Netlify, as mesmas duas variáveis vão em *Site settings → Environment
variables*.

### Leitura automática de faturas (opcional)

O botão "Extrair dados com IA" no ecrã Importar precisa de uma chave da API da
Anthropic:

1. Criar conta em <https://console.anthropic.com>
2. *Billing* → adicionar créditos (a leitura de faturas custa cêntimos por
   documento; 5 € dão para centenas)
3. *API keys* → **Create key** → copiar (só é mostrada uma vez, começa por `sk-ant-`)
4. Netlify → *Site configuration* → *Environment variables* → **Add**:
   `ANTHROPIC_API_KEY` = a chave
5. *Deploys* → *Trigger deploy* → **Clear cache and deploy site**

A chave fica só no servidor, dentro da função `netlify/functions/ai-proxy.js`,
e nunca é enviada para o browser. Sem ela, o resto do ERP funciona
normalmente — só a extração automática é que fica indisponível, e os dados da
fatura podem ser preenchidos à mão.

## 3. Correr localmente

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # gera dist/
```

## 4. Deploy (Netlify)

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

O `netlify.toml` já tem o redirect de SPA configurado.

---

## Empresas e contas

Definidas num **único ficheiro**: `src/empresas.js`. Alterar aí propaga para
Extratos, Fluxo Futuro, Contas a Pagar, Importar Extrato e Importar Fatura.

| Empresa | id | Bancos |
|---|---|---|
| Favorite Closet | `favcloset` | BCP, RED |
| Simplify Rubric | `simplify` | BCP, RED |
| Enchanted Vortex | `enchanted` | BCP |
| Blessed Legion | `blessed` | BCP |
| Pearl Syntax | `pearl` | BCP |
| Género Prudente | `genero` | BCP |
| Fluffy Rithm | `fluffy` | BCP |
| Admirable Sequence | `adseq` | BCP, RED |
| Infinite Change | `infinite` | BCP, RED |
| LPX Private | `lpx` | BCP, Revolut, CGD |

**Convenção do `conta_id`:** `<empresa_id>_<banco em minúsculas, sem espaços>`
— por exemplo `lpx_revolut`, `adseq_red`.

### Adicionar uma empresa ou um banco

1. Acrescentar a linha em `src/empresas.js` (array `DEF`).
2. Inserir a conta correspondente na tabela `contas` do Supabase:

```sql
INSERT INTO contas (id, empresa_id, empresa_nome, banco, iban, saldo)
VALUES ('novaempresa_bcp', 'novaempresa', 'Nova Empresa', 'BCP', '', 0);
```

3. Se o banco for novo, acrescentar a cor em `BANCO_COLORS` no mesmo ficheiro.

---

## Utilizadores e permissões

| Papel | Acesso |
|---|---|
| `admin` | Tudo, incluindo o separador Utilizadores |
| `gestor` | Tudo exceto gestão de utilizadores; importa e edita |
| `viewer` | Só leitura; sem separador Importar |

`approval_level`: `0` não aprova · `1` primeira aprovação de mapas de pagamento ·
`2` segunda aprovação (fecha o mapa).

---

## Marca

`src/brand.js` concentra nome, logótipo, subtítulo e paleta.
O logótipo é `public/logo-lpx.png` (branco, fundo transparente) — assenta sobre
superfícies escuras e mantém-se legível no modo escuro da app. O original está
em `public/logo-lpx-original.jpg`.

Acento da marca: `#6B7C93`.

---

## Estado inicial

Tudo reposto a zero: sem movimentos, sem faturas, sem frações, sem vendas e sem
orçamentos. O separador **Real × Orçado** mostra um estado vazio até serem
definidos projetos em `REAL_ORCADO_PROJECTS` (`src/App.jsx`).

## Estrutura

```
src/
  brand.js            marca (nome, logo, cores)
  empresas.js         empresas + contas bancárias  ← fonte única de verdade
  supabase.js         ligação ao Supabase (via variáveis de ambiente)
  hooks.js            hooks de dados com sincronização em tempo real
  App.jsx             navegação, login, Contas a Pagar, Real × Orçado
  ExtratosView.jsx    Caixa Único, extratos, exportação PPTX
  FluxoFuturo.jsx     projeção de tesouraria
  PagamentosView.jsx  mapas de pagamento e aprovações
  ComercialView.jsx   frações, vendas e comissões
  EntidadesView.jsx   fornecedores, clientes e mediadores
  ImportarExtrato.jsx importação de extratos bancários
  ImportarFatura.jsx  leitura de faturas (PDF/imagem) por IA
public/
  setup-base-dados.html    SQL de instalação
  criar-utilizadores.html  criação dos utilizadores
supabase/
  schema.sql               schema completo + seed das contas
```

---

## v42 — Questionamentos dos investidores

### O que muda

1. **Extratos** — cada linha passa a ter uma coluna `?`.
   O investidor clica e escreve a dúvida numa caixa de texto; a pergunta fica
   agarrada ao lançamento (data, descrição e valor ficam copiados, para
   continuar legível mesmo que o extrato seja reimportado).
   O gestor vê na mesma linha um balão `💬 n` com as questões levantadas.
2. **Separador Questões** — o gestor vê todas as perguntas, responde, fecha ou
   reabre. O investidor vê só as suas e as respostas.
3. **Notificação aos gestores** — contador vermelho no separador, aviso
   flutuante em tempo real para quem tem o ERP aberto, notificação do sistema
   (se o gestor carregar em «🔔 Ativar avisos») e, opcionalmente, email.
4. **Gráficos do Investor Relations** — os valores deixaram de se sobrepor:
   contorno branco por baixo de cada número, valores das barras escritos na
   vertical, deteção de colisão entre rótulos e contra a linha do saldo, e
   largura do gráfico proporcional ao número de meses.

### Instalação

Correr no SQL Editor do Supabase:

```
supabase/migracao-v11-questionamentos.sql
```

### Email (opcional)

Sem estas variáveis o ERP notifica à mesma dentro da aplicação — o email é um
extra. Em Netlify → Site configuration → Environment variables:

| Variável | Para que serve |
|---|---|
| `RESEND_API_KEY` | chave da Resend (resend.com) |
| `NOTIFICACOES_DE` | remetente verificado, ex.: `erp@lpxprivate.com` |
| `SUPABASE_URL` | `https://<projeto>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` (só no servidor!) |
| `NOTIFICACOES_PARA` | alternativa: lista fixa de emails, separada por vírgulas |

A `service_role` nunca pode ir para uma variável `VITE_*`: essas são
compiladas para dentro do bundle e ficam visíveis no browser.

### Testes

```
node teste-rotulos.mjs       # geometria dos rótulos dos gráficos
node teste-render.mjs        # renderização das vistas (SSR)
node teste-extrato-dom.mjs   # fluxo do questionamento em DOM real
```
