# Pôr o ERP da LPX Private no ar — passo a passo

Do zero até um endereço a funcionar. Conta com cerca de 40 minutos à primeira vez.

Vais fazer quatro coisas, por esta ordem:

1. **Supabase** — criar a base de dados (10 min)
2. **Utilizadores** — criar o Felipe, o Rodrigo e o Thiago (5 min)
3. **GitHub** — pôr o código num repositório (10 min)
4. **Netlify** — publicar o site (10 min)

A ordem importa: o site precisa das chaves do Supabase para funcionar, por isso a
base de dados vem primeiro.

---

## Atalho: o script de instalação

As partes 3, 4 e 5 deste guia estão automatizadas. Depois de teres a base de
dados criada (Parte 1), abre o Terminal na pasta do projeto e corre:

```bash
node setup.mjs
```

O script pede-te as duas chaves do Supabase, testa a ligação, instala, compila,
confirma que as chaves ficaram no build, prepara o Git e publica no Netlify.
A autenticação no Netlify é feita por ti, no browser.

As Partes 1 e 2 — criar o projeto Supabase e os utilizadores — têm de ser feitas
à mão, porque envolvem as tuas credenciais.

---

## Antes de começar

Precisas de ter instalado no computador:

- **Node.js** — descarrega a versão LTS em <https://nodejs.org>
- **Git** — <https://git-scm.com/downloads>

Para confirmar que ficaram bem instalados, abre o Terminal (macOS) ou o Command
Prompt (Windows) e escreve:

```bash
node -v
git --version
```

Se aparecerem números de versão, está tudo bem. Se der "command not found",
falta instalar.

Descompacta o `lpx-private-erp-v2.zip` numa pasta onde o consigas encontrar —
por exemplo `Documentos/lpx-private-erp`.

---

## PARTE 1 · Supabase (base de dados)

### 1.1 Criar o projeto

1. Vai a <https://supabase.com/dashboard> e entra (ou cria conta com o GitHub).
2. Carrega em **New project**.
3. Preenche:
   - **Name:** `lpx-private-erp`
   - **Database Password:** gera uma password forte e **guarda-a no teu gestor de
     passwords**. Não a vais usar no dia-a-dia, mas sem ela não recuperas a base
     de dados.
   - **Region:** `Europe (Frankfurt)` ou `Europe (London)` — mais perto de
     Lisboa, mais rápido.
4. **Create new project.** Demora 1 a 2 minutos a arrancar.

> **Importante:** tem de ser um projeto **novo**, separado do da Rio Capital. Se
> apontares para o projeto antigo, os dois ERPs passam a partilhar os mesmos
> dados.

### 1.2 Criar as tabelas

1. No menu da esquerda, **SQL Editor** → **New query**.
2. Abre o ficheiro `supabase/schema.sql` (está dentro da pasta que
   descompactaste) num editor de texto, seleciona tudo e copia.
3. Cola na caixa do SQL Editor e carrega em **Run** (ou `Ctrl/Cmd + Enter`).
4. Deve aparecer *Success. No rows returned* — é o resultado esperado.

Isto cria as 11 tabelas, os índices, as permissões, a sincronização em tempo real
e já insere as 16 contas bancárias das 10 empresas.

**Para confirmar:** menu **Table Editor** → devem aparecer as tabelas na lista.
Abre a tabela `contas` e confirma que tem 16 linhas.

### 1.3 Copiar as chaves

1. Menu da esquerda, em baixo: **Project Settings** → **API**.
2. Deixa esta página aberta. Vais precisar de dois valores:
   - **Project URL** — algo como `https://abcdefghijkl.supabase.co`
   - **anon / publishable key** — uma chave longa que começa por `sb_publishable_`
     ou `eyJ...`

> A chave `service_role` **nunca** é usada aqui. Essa dá acesso total à base de
> dados e não pode ir para o browser.

---

## PARTE 2 · Utilizadores

### 2.1 Criar as três contas

1. Menu **Authentication** → **Users** → **Add user** → **Create new user**.
2. Cria uma de cada vez, marcando sempre **Auto Confirm User** (senão o
   utilizador tem de confirmar por email antes de conseguir entrar):

   | Email | Password |
   |---|---|
   | `felipe@lpxprivate.pt` | (define uma, forte) |
   | `rodrigo@lpxprivate.pt` | (define uma, forte) |
   | `thiago@lpxprivate.pt` | (define uma, forte) |

   Se o vosso domínio de email não for `@lpxprivate.pt`, usa o vosso — só tens de
   usar exatamente o mesmo no passo seguinte.

### 2.2 Definir os papéis

Volta ao **SQL Editor** → **New query**, cola isto e faz **Run**:

```sql
-- Garante que existe um perfil para cada utilizador
INSERT INTO profiles (id, nome, email, role)
SELECT u.id, initcap(split_part(u.email, '@', 1)), u.email, 'viewer'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Felipe — administrador, aprovação de nível 2
UPDATE profiles SET nome='Felipe', role='admin',
       approval_level=2, can_create_mapas=true
 WHERE email='felipe@lpxprivate.pt';

-- Rodrigo — gestor, aprovação de nível 1
UPDATE profiles SET nome='Rodrigo', role='gestor',
       approval_level=1, can_create_mapas=true
 WHERE email='rodrigo@lpxprivate.pt';

-- Thiago — gestor, aprovação de nível 1
UPDATE profiles SET nome='Thiago', role='gestor',
       approval_level=1, can_create_mapas=true
 WHERE email='thiago@lpxprivate.pt';

-- Conferir
SELECT nome, email, role, approval_level FROM profiles ORDER BY role, nome;
```

A última linha mostra-te uma tabela com os três. Se algum aparecer como `viewer`,
o email no SQL não corresponde ao email da conta — corrige e corre outra vez.

---

## PARTE 3 · Testar no teu computador (opcional, mas recomendado)

Vale a pena confirmar que tudo funciona antes de publicar.

Abre o Terminal e vai até à pasta do projeto:

```bash
cd Documentos/lpx-private-erp
```

Cria o ficheiro de configuração com as chaves do Supabase:

```bash
cp .env.example .env
```

Abre o `.env` num editor e preenche com os valores do passo 1.3:

```
VITE_SUPABASE_URL=https://abcdefghijkl.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxx
```

Instala e arranca:

```bash
npm install
npm run dev
```

Abre <http://localhost:5173> e entra com o teu email e password. Deves ver o
dashboard com as 10 empresas e saldos a zero.

Para parar: `Ctrl + C` no Terminal.

> O `.env` nunca vai para o GitHub — está no `.gitignore` de propósito. As chaves
> para o site publicado são configuradas no Netlify, na Parte 5.

---

## PARTE 4 · GitHub

### 4.1 Criar o repositório

1. Vai a <https://github.com/new>.
2. **Owner:** escolhe a organização onde está o repositório da Rio Capital
   (mantém tudo junto).
3. **Repository name:** `lpx-private-erp`
4. **Private** — é informação financeira, não deve ser público.
5. **Não** marques nada em *Initialize this repository* (sem README, sem
   .gitignore, sem licença). Já temos esses ficheiros.
6. **Create repository.**

### 4.2 Enviar o código

O GitHub mostra-te um ecrã com comandos. Usa estes, no Terminal, dentro da pasta
do projeto:

```bash
cd Documentos/lpx-private-erp
git init
git add .
git commit -m "ERP LPX Private - versao inicial"
git branch -M main
git remote add origin https://github.com/A_TUA_ORGANIZACAO/lpx-private-erp.git
git push -u origin main
```

Substitui `A_TUA_ORGANIZACAO` pelo nome real — copia o endereço do ecrã do
GitHub para não errares.

Se pedir utilizador e password: a password já não funciona há anos. Tens de usar
um **Personal Access Token** — vai a
<https://github.com/settings/tokens> → *Generate new token (classic)* → marca a
permissão `repo` → gera → cola o token onde pede a password.

**Para confirmar:** atualiza a página do repositório no GitHub. Devem aparecer as
pastas `src`, `public`, `supabase` e o `README.md`.

---

## PARTE 5 · Netlify (publicar)

### 5.1 Ligar o repositório

1. Vai a <https://app.netlify.com> e entra com a mesma conta GitHub.
2. **Add new site** → **Import an existing project** → **GitHub**.
3. Se o repositório não aparecer na lista, carrega em *Configure the Netlify app
   on GitHub* e dá acesso à organização.
4. Escolhe `lpx-private-erp`.

### 5.2 Configurar o build

O Netlify já lê o `netlify.toml` do projeto, por isso deve preencher sozinho.
Confirma que está assim:

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Functions directory:** `netlify/functions`

### 5.3 As chaves — antes de publicar

**Este passo é o que costuma falhar.** Antes de carregares em Deploy, abre
**Add environment variables** (ou depois em *Site configuration → Environment
variables*) e acrescenta:

| Key | Value |
|---|---|
| `VITE_SUPABASE_URL` | o Project URL do passo 1.3 |
| `VITE_SUPABASE_ANON_KEY` | a chave publishable do passo 1.3 |

Se te esqueceres, o site publica na mesma mas o login não funciona — o Vite grava
estes valores *dentro* do ficheiro compilado, por isso têm de estar definidos
antes do build.

Opcionalmente acrescenta `ANTHROPIC_API_KEY` se quiseres a leitura automática de
faturas por IA. Sem ela, o resto do ERP funciona na mesma.

### 5.4 Publicar

**Deploy site.** Demora 1 a 3 minutos. No fim recebes um endereço como
`https://random-name-123456.netlify.app`.

### 5.5 Dar um nome decente

*Site configuration* → *General* → *Site details* → **Change site name** →
`lpx-private-erp`.

Fica **`https://lpx-private-erp.netlify.app`** — este é o endereço que dás ao
Rodrigo e ao Thiago.

---

## A partir daqui

Cada vez que alterares o código e fizeres:

```bash
git add .
git commit -m "descrição da alteração"
git push
```

o Netlify reconstrói o site sozinho em 1-2 minutos. Não há mais nada a fazer.

---

## Se correr mal

**O site abre mas o login diz "Invalid login credentials"**
A password está errada, ou o utilizador não foi criado com *Auto Confirm*. Vai a
*Authentication → Users* no Supabase e define a password outra vez.

**O site abre em branco, ou a consola mostra "Supabase por configurar"**
Faltam as variáveis de ambiente no Netlify, ou foram acrescentadas depois do
build. Confirma que estão lá e depois força um novo build em *Deploys* →
*Trigger deploy* → **Clear cache and deploy site**.

**Entro, mas não vejo nenhuma empresa**
O `schema.sql` não chegou a correr por inteiro. Vai ao *Table Editor* do Supabase
e confirma que a tabela `contas` tem 16 linhas.

**O deploy falha com erro de "preparing repo"**
Foi o que aconteceu com o ERP da Rio Capital quando o repositório mudou de dono.
Em *Site configuration → Build & deploy → Continuous deployment*, desliga e volta
a ligar o repositório, dando ao Netlify acesso à organização.

**Consigo entrar mas os outros não**
Confirma no SQL que os três estão na tabela `profiles` com o papel certo:
`SELECT nome, email, role FROM profiles;`

---

## Resumo de referência

| O quê | Onde |
|---|---|
| Base de dados | supabase.com/dashboard → projeto `lpx-private-erp` |
| Código | github.com/A_TUA_ORGANIZACAO/lpx-private-erp |
| Site | app.netlify.com → `lpx-private-erp` |
| Endereço final | https://lpx-private-erp.netlify.app |
| Empresas e contas | `src/empresas.js` |
| Marca e logótipo | `src/brand.js` |
