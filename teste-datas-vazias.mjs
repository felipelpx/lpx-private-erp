// Datas deixadas em branco não podem impedir uma gravação.
//
// O que o Felipe viu a 23/11/2026, ao criar uma fatura à mão com a previsão
// de pagamento e a data de emissão por preencher:
//
//     Erro ao criar fatura:
//     invalid input syntax for type date: ""
//
// Um <input type="date"> vazio vale "", não null, e o Postgres recusa a
// escrita INTEIRA. A fatura não era criada por causa de dois campos que ele
// deixou em branco de propósito.
//
// A causa a sério não foi o "": foi haver DUAS cópias do mecanismo de
// gravação. O `src/escrita.js` tratava disto; o formulário das faturas tinha
// a sua própria cópia, à mão, que não tratava. Este teste cobre as duas
// coisas — a conversão, e o facto de a gravação das faturas passar mesmo
// pelo módulo partilhado.
//   node teste-datas-vazias.mjs
import { datasVaziasANull, pareceData, escreverTolerante } from "./src/escrita.js";
import { readFileSync } from "fs";

let mau = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) mau++; };

console.log("Reconhecem-se as colunas que são datas:");
{
  for (const n of ["vencimento", "data_fatura", "previsao_pagamento", "data_carta",
                   "data_termo", "data_inicio", "data_fim", "validade"]) {
    ok(pareceData(n), `${n}`);
  }
  console.log("  …e não se confundem com as que não são:");
  for (const n of ["valor", "descricao", "fornecedor", "observacoes", "status",
                   "categoria", "rateio", "id", "empresa", "datado"]) {
    ok(!pareceData(n), `${n}`);
  }
}

console.log("\nUma data em branco vira null; o resto fica como está:");
{
  const limpo = datasVaziasANull({
    id: "f1", fornecedor: "EDP", valor: 460,
    vencimento: "2026-11-30",        // preenchida: não se toca
    previsao_pagamento: "",          // em branco: vira null
    data_fatura: "   ",              // só espaços: também
    observacoes: "",                 // texto vazio: FICA vazio
    status: "Pendente",
    taxa_iva: 23, iva_dedutivel: true, rateio: null,
  });
  ok(limpo.previsao_pagamento === null, "previsao_pagamento → null");
  ok(limpo.data_fatura === null, "data_fatura só com espaços → null");
  ok(limpo.vencimento === "2026-11-30", `vencimento intacto: ${limpo.vencimento}`);
  // Uma coluna de texto vazia é um valor legítimo e não se mexe nela: a
  // conversão vai pelo NOME da coluna, não por o valor estar vazio.
  ok(limpo.observacoes === "", "observações vazias continuam vazias, não null");
  ok(limpo.valor === 460 && limpo.taxa_iva === 23, "os números passam tal e qual");
  ok(limpo.iva_dedutivel === true, "e os booleanos também");
  ok(limpo.rateio === null, "um null já lá estava continua null");
}

console.log("\nO erro do Felipe deixa de acontecer:");
{
  // Uma base de dados de mentira que se comporta como o Postgres: recusa
  // tudo se alguma coluna de data vier com "".
  const DATAS = ["vencimento", "data_fatura", "previsao_pagamento"];
  let recebido = null;
  const postgres = async (corpo) => {
    recebido = corpo;
    for (const c of DATAS) {
      if (corpo[c] === "") {
        return { data: null, error: { message: 'invalid input syntax for type date: ""' } };
      }
    }
    return { data: [{ ...corpo }], error: null };
  };

  const fatura = {
    id: "f1", empresa: "offtopic", fornecedor: "Cartão de crédito",
    valor: 460, categoria: "Administrativos",
    vencimento: "2026-11-30",
    previsao_pagamento: "",     // ← o que ele deixou em branco
    data_fatura: "",            // ← e este também
    status: "Pendente", observacoes: "Pagamento cartao de credito off topic",
  };

  const r = await escreverTolerante(postgres, fatura);
  ok(!r.error, `a fatura grava${r.error ? " — ERRO: " + r.error.message : ""}`);
  ok(r.data?.[0]?.id === "f1", "e volta com o id");
  ok(recebido.previsao_pagamento === null, "a previsão foi gravada como null");
  ok(recebido.data_fatura === null, "a data de emissão também");
  ok(recebido.vencimento === "2026-11-30", "e o vencimento ficou com a data");
  ok(recebido.observacoes === "Pagamento cartao de credito off topic",
     "as observações chegaram inteiras");
}

console.log("\nE no código antigo falhava mesmo:");
{
  // O antigo é o que o formulário tinha: tolerava colunas em falta, mas
  // mandava as datas como "". É isto que o utilizador apanhava.
  const DATAS = ["vencimento", "data_fatura", "previsao_pagamento"];
  const postgres = async (corpo) => {
    for (const c of DATAS)
      if (corpo[c] === "")
        return { data: null, error: { message: 'invalid input syntax for type date: ""' } };
    return { data: [{ ...corpo }], error: null };
  };
  const antigo = async (escrever, payload) => {
    const corpo = { ...payload };           // ← sem tratar as datas
    return await escrever(corpo);
  };
  const r = await antigo(postgres, { id: "f1", previsao_pagamento: "" });
  ok(!!r.error && /invalid input syntax for type date/.test(r.error.message),
     `dá o erro do print: "${r.error.message}"`);
}

console.log("\nA tolerância a colunas em falta continua a funcionar:");
{
  // A conversão das datas não pode ter estragado o resto do mecanismo.
  let tentativas = 0;
  const base = async (corpo) => {
    tentativas++;
    if ("rateio" in corpo)
      return { data: null, error: { message: "Could not find the 'rateio' column of 'faturas'" } };
    if (corpo.previsao_pagamento === "")
      return { data: null, error: { message: 'invalid input syntax for type date: ""' } };
    return { data: [corpo], error: null };
  };
  const r = await escreverTolerante(base, {
    id: "f2", valor: 100, previsao_pagamento: "", rateio: [{ categoria: "X", valor: 100 }] });
  ok(!r.error, "grava à mesma");
  ok(r.ignoradas.join() === "rateio", `e diz o que ficou de fora: ${r.ignoradas.join(", ")}`);
  ok(tentativas === 2, `duas tentativas, não mais (${tentativas})`);
}

console.log("\nO formulário das faturas usa o módulo partilhado:");
{
  // A avaria nasceu de haver duas cópias do mesmo mecanismo. Se alguém
  // voltar a escrever uma à mão no App.jsx, isto apanha.
  const app = readFileSync("./src/App.jsx", "utf8");
  ok(/import \{[^}]*escreverTolerante[^}]*\} from "\.\/escrita\.js"/.test(app),
     "o App.jsx importa o escreverTolerante");
  ok(!/for \(let i = 0; i <= 8; i\+\+\)[\s\S]{0,200}colunaEmFalta/.test(app),
     "e já não tem uma cópia do ciclo escrita à mão");
}

console.log("\nCasos de fronteira:");
{
  ok(JSON.stringify(datasVaziasANull(null)) === "{}", "null não rebenta");
  ok(JSON.stringify(datasVaziasANull({})) === "{}", "nem um objeto vazio");
  const d = datasVaziasANull({ data_fatura: undefined, vencimento: 0 });
  ok(d.data_fatura === undefined, "undefined fica undefined, não vira null");
  ok(d.vencimento === 0, "e um 0 não é uma string vazia");
}

console.log(mau === 0 ? "\n✅ Datas vazias OK" : `\n❌ ${mau} falha(s)`);
process.exit(mau ? 1 : 0);
