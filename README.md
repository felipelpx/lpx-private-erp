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

---

## v43 — Funding bancário e legibilidade dos gráficos

### Funding bancário

Há despesas que o banco financia: o empreiteiro é pago, mas o banco liberta o
mesmo montante, e a saída acaba neutralizada no caixa do projeto.

- Cada despesa do **Fluxo Futuro** (previsão ou fatura) tem um botão **🏦**.
- Ligado, o fluxo gera automaticamente a **entrada do banco** no mesmo mês,
  como linha própria (`Funding — <despesa>`).
- Ao lado do botão fica a **percentagem financiada**, editável: o banco
  raramente cobre 100%. A 70%, só 70% da despesa é reposta e os restantes 30%
  continuam a pesar no projeto.
- O **Contas a Pagar** tem a mesma coluna 🏦, para marcar a fatura onde ela
  vive.
- Quando uma previsão financiada é convertida em fatura, a fatura **herda** a
  marcação — senão a entrada do banco desaparecia do fluxo no dia em que a
  fatura chegasse.
- O cartão **Financiado (banco)** no topo mostra quanto do período está
  coberto, e os gráficos do Investor Relations usam exatamente a mesma regra
  (`src/funding.js` é a fonte única).

Instalação: correr `supabase/migracao-v12-funding.sql` no SQL Editor do
Supabase. Nada é recalculado — todas as despesas começam sem funding.

### Evolução do saldo legível

O gráfico crescia em largura mas era comprimido para caber no cartão, e o
texto encolhia com ele até deixar de se ler. Agora:

- **1 unidade do desenho = 1 pixel**: o texto tem sempre o tamanho pedido e o
  gráfico rola na horizontal em vez de encolher (vale para todos os gráficos).
- Letra maior (11 px nos valores e nos eixos) e gráfico mais alto.
- Seletor de detalhe **Auto / Mês / Trimestre / Ano**. Em Auto, mais de 16
  meses passa a trimestres e mais de 40 a anos — porque o saldo é um *stock*,
  cada período fica com o **último** saldo, nunca com a soma.

### Testes

```
node teste-funding.mjs       # aritmética do funding
node teste-rotulos.mjs       # geometria dos rótulos dos gráficos
node teste-render.mjs        # renderização das vistas (SSR) + agregação do saldo
node teste-extrato-dom.mjs   # questionamentos em DOM real
node teste-fluxo-dom.mjs     # funding no Fluxo Futuro em DOM real
```

---

## v44 — Plano de contas HDG e funding nas vencidas

### Funding nas vencidas

O botão **🏦** passou a existir também nas faturas e previsões **vencidas**,
que é onde estão precisamente os autos de medição por liquidar. A entrada do
banco aparece na mesma linha do bloco de vencidas.

### Plano de contas dos projetos HDG

Nos projetos do grupo HDG — Admirable Sequence (Cinq Etoiles), Infinite Change
(Paço D'arcos) e Traços e Angulos — o extrato mostra
**Categoria | Subcategoria | Observações**. Nos projetos LPX nada muda: mesmas
colunas, mesmo plano de contas de sempre.

A lista vem de duas fontes (`src/categoriasHDG.js`):

- `cat_subcat.xlsx`, folha **Menu1** — o plano como deve ser;
- `Caixa_Unico_HDG_3.xlsm` — o que está mesmo em uso.

São 17 categorias e 59 subcategorias. Os nomes com underscore
(`Soft_Costs`, `Aquisição_de_Terreno`, …) são os do business plan e os que o
Real × Orçado já usa — mudá-los partia esse cruzamento. Categorias como
**Sócios** não constam do Menu1 mas têm 84 movimentos: entram, porque a folha
de controlo manda mais do que o menu. Subcategorias usadas uma única vez
(texto livre, do género «CSO Agosto (WH 371)») ficam fora da lista mas
continuam gravadas — o ecrã mostra-as como **(fora do plano)**, que é o sinal
de que há ali algo a arrumar.

O exportador para Excel acompanha: nos HDG sai
`Data | Descrição | Valor | Saldo | Categoria | Subcategoria | Observações`.

### Instalação, por esta ordem

| Ficheiro | O que faz |
|---|---|
| `supabase/migracao-v13-subcategoria.sql` | acrescenta a coluna `subcategoria` aos movimentos |
| `supabase/reclassificar-hdg.sql` | passa as 616 classificações do Caixa Único HDG para o ERP |
| `supabase/marcar-funding-obra.sql` | marca as faturas de obra a 100% de funding |

Os dois últimos guardam cópia de segurança antes de alterar e trazem o bloco
de reversão comentado no fim. O `reclassificar-hdg.sql` só toca nas contas
`adseq_bcp`, `adseq_red`, `infinite_bcp` e `infinite_red`, e lista no fim os
movimentos que o ficheiro não cobre.
