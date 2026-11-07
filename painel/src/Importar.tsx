import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  importarCadastros, importarExames, importarPacientes,
  type SecaoImportada, type PacientesImportados
} from './dados';
import {
  lerEspecialidades, lerConvenios, lerMedicos, lerExpediente, lerPacientes,
  verdade, plural,
  type Cadastros, type PacienteImp, type Achado
} from '../../nucleo/planilha';
import {
  lerExames, lerTuss, lerHorariosDeExame, examesSemNinguem,
  type ExameImp, type TussImp, type FaixaExameImp, type AchadoExame
} from '../../nucleo/planilha-exames';
import { Aviso, useAviso } from './Aviso';

/**
 * ============================================================
 *  IMPORTAR A PLANILHA
 *
 *  O caminho do Apps Script para o MedCalendar: especialidades,
 *  convênios, médicos (com subárea, convênio, limite diário e
 *  faixa etária), o expediente de cada um, e os pacientes.
 *
 *  ------------------------------------------------------------
 *  ⭐ TRÊS PASSOS, E O DO MEIO É O QUE IMPORTA
 *
 *    1. abrir      — lê o arquivo aqui no navegador
 *    2. ENSAIO     — o banco grava tudo e desfaz, e devolve o
 *                    relatório de verdade
 *    3. importar   — o mesmo caminho, sem desfazer
 *
 *  O ensaio não é uma validação: é a importação inteira,
 *  desfeita no fim. Ele vê a chave estrangeira, a trava de
 *  duplicidade, o `check` da faixa invertida e o gatilho do
 *  limite — tudo o que uma "validação" não veria.
 *
 *  Prévia que mente é pior que prévia nenhuma: ela diz "3019
 *  entram" e no dia da virada entram 2800, com a recepção
 *  esperando.
 *
 *  ------------------------------------------------------------
 *  A TELA NÃO SABE LER PLANILHA
 *
 *  Quem lê é `nucleo/planilha.ts`, com 37 testes. Aqui ficou só
 *  o que é tela: abrir o arquivo, mostrar, perguntar.
 *
 *  As decisões que mudam o que entra no hospital — qual coluna é
 *  o "ativo", quem vence no médico repetido, qual nome fica no
 *  CPF repetido — estão todas lá, onde dá para prová-las sem
 *  clicar em nada.
 * ============================================================
 */

/** As abas que o importador conhece, e para que serve cada uma. */
import { lerAgendamentos, type ResumoDaAgenda } from '../../nucleo/planilha';
import { ImportarAgendas } from './ImportarAgendas';

const ABAS = [
  { nome: 'Especialidades', serve: 'as áreas, para ligar ao médico' },
  { nome: 'Convenios', serve: 'só os marcados como ativos' },
  { nome: 'Medicos', serve: 'quem atende consulta' },
  { nome: 'Medicos_Exames', serve: 'quem faz exame — fundido com o de cima' },
  { nome: 'MedicoRegras', serve: 'a faixa etária de cada um' },
  { nome: 'Horarios', serve: 'o expediente, faixa por faixa' },
  { nome: 'Pacientes', serve: 'nome, CPF, telefone, nascimento' },
  { nome: 'Exames_Config', serve: 'os exames, com subtipos e preparo' },
  { nome: 'TUSS_Exames', serve: 'o código que vai na guia do convênio' },
  { nome: 'Horarios_Exames', serve: 'o expediente de quem faz exame' },
  // ⭐ 27/10: as consultas já marcadas.
  { nome: 'Agendamentos', serve: 'as consultas já marcadas' },
] as const;

type Passo = 'abrir' | 'lido' | 'ensaio' | 'pronto';

/* ════════════════════════════════════════════════════════════
 *  ⭐ ONDE A IMPORTAÇÃO PAROU
 *
 *  ⚠️ ISTO NASCEU DE UM DEFEITO EM PRODUÇÃO, 08/10/2026.
 *
 *  A primeira versão com lotes consertou o estouro de tempo —
 *  mas quando um lote falhava por um motivo que o corte ao meio
 *  não resolve, ela fazia `throw`. O `throw` subia por cima da
 *  variável `total`, que já tinha a contagem de TODOS os lotes
 *  anteriores, e ela morria ali.
 *
 *  Na tela do Tom: "parte foi importado, mas no final não deu
 *  certo". Os pacientes dos primeiros lotes ESTAVAM no banco. A
 *  tela não dizia quantos, nem quais, nem de onde recomeçar —
 *  só mostrava a mensagem crua do Postgres.
 *
 *  Trabalho feito que a tela joga fora é pior que trabalho não
 *  feito: ninguém sabe em que pé está, e a saída mais fácil é
 *  começar tudo de novo.
 *
 *  Agora a parada é um ESTADO, e não uma exceção:
 *
 *    · o relatório do que já entrou continua na tela
 *    · a mensagem do banco aparece inteira, em letras
 *    · e o botão "Continuar de onde parou" recomeça no
 *      paciente exato, somando ao relatório que já está lá
 *
 *  O `em` é o índice do PRIMEIRO paciente que NÃO entrou — e a
 *  fila tem sempre a mesma ordem (`filaDePacientes`), senão
 *  "de onde parou" não quereria dizer nada.
 * ════════════════════════════════════════════════════════════ */
type Parada = {
  em: number;           // índice do primeiro paciente que não entrou
  de: number;           // quantos eram ao todo
  erro: string;         // o que o banco disse, em letras
  confirmar: boolean;   // era ensaio, ou era valendo
};

export function Importar({ clienteId }: { clienteId: string }) {
  const { recado, avisar, fechar } = useAviso();
  const campo = useRef<HTMLInputElement>(null);

  const [passo, setPasso] = useState<Passo>('abrir');
  const [arquivo, setArquivo] = useState('');
  const [lendo, setLendo] = useState(false);
  const [faltando, setFaltando] = useState<string[]>([]);

  const [cadastros, setCadastros] = useState<Cadastros | null>(null);
  /* ⭐ As quatro abas de exame, já lidas. Nulo = a planilha não
   *    tem `Exames_Config`, e aí o importador nem oferece as
   *    seções — em vez de oferecer cinco seções zeradas. */
  const [exames, setExames] = useState<{
    exames: ExameImp[]; tuss: TussImp[];
    medicos: { id_exame: string; nome: string; exames: string[] }[];
    horarios: FaixaExameImp[];
  } | null>(null);
  const [pacientes, setPacientes] = useState<PacienteImp[]>([]);
  /* ⭐ `Achado` tem união fechada de tipos; `AchadoExame` não,
   *    porque as abas de exame trazem oito categorias novas e
   *    fechá-las aqui obrigaria a editar dois arquivos a cada
   *    achado novo. A tela só precisa das três colunas. */
  const [achados, setAchados] = useState<(Achado | AchadoExame)[]>([]);

  const [indo, setIndo] = useState(false);
  const [valendo, setValendo] = useState(false);
  const [secoes, setSecoes] = useState<SecaoImportada[]>([]);
  const [pac, setPac] = useState<PacientesImportados | null>(null);
  const [agenda, setAgenda] = useState<ResumoDaAgenda | null>(null);

  /* ---------------- 1. abrir ---------------- */

  async function abrir(f: File) {
    setLendo(true);
    setSecoes([]); setPac(null); setFaltando([]); setExames(null);
    setAgenda(null);
    let achadosDeExame: AchadoExame[] = [];
    try {
      // `cellDates` para a data de nascimento vir como Date em
      // vez de número de série do Excel; `raw: false` para o
      // resto vir como texto, que é o que o núcleo espera.
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });

      const aba = (n: string): Record<string, unknown>[] | null => {
        const ws = wb.Sheets[n];
        if (!ws) return null;
        return XLSX.utils.sheet_to_json<Record<string, unknown>>(
          ws, { defval: '', raw: false });
      };

      // ⭐ Aba que falta é DITA, não ignorada. Sem isso, uma
      //    planilha exportada pela metade importaria "com
      //    sucesso" trazendo médico sem expediente.
      const ausentes = ABAS.filter(a => !aba(a.nome)).map(a => a.nome);
      setFaltando(ausentes);

      const esp = lerEspecialidades(aba('Especialidades') ?? []);
      const conv = lerConvenios(aba('Convenios') ?? []);
      const med = lerMedicos(aba('Medicos') ?? [], aba('Medicos_Exames') ?? [],
                             aba('MedicoRegras') ?? []);
      const exp = lerExpediente(aba('Horarios') ?? []);
      const p = lerPacientes(aba('Pacientes') ?? []);

      /* ⭐⭐ AS QUATRO ABAS DE EXAME.
       *
       *  Lidas aqui e NÃO no banco, pela mesma razão de todo o
       *  resto: as decisões que mudam o que entra no hospital —
       *  qual coluna é o dia da semana numa aba com as colunas
       *  deslocadas, se "entrevista sem pergunta" entra ligada
       *  ou desligada — ficam em `nucleo/planilha-exames.ts`,
       *  onde dá para prová-las sem clicar em nada.
       *
       *  Planilha sem `Exames_Config` simplesmente não ganha as
       *  seções: oferecer cinco linhas zeradas seria dizer que
       *  não havia nada, quando o que houve foi uma aba que não
       *  veio. */
      const abaExames = aba('Exames_Config');
      let ex: typeof exames = null;
      if (abaExames && abaExames.length) {
        const le = lerExames(abaExames);
        const lt = lerTuss(aba('TUSS_Exames') ?? [], le.exames);
        const lh = lerHorariosDeExame(aba('Horarios_Exames') ?? []);
        // Só quem tem id na aba de exames pode ser ligado a um
        // exame — é por esse id que o `Horarios_Exames` aponta.
        const quem = med.medicos
          .filter(m => m.id_exame && m.exames.length)
          .map(m => ({ id_exame: m.id_exame!, nome: m.nome, exames: m.exames }));
        const semNinguem = examesSemNinguem(
          le.exames,
          med.medicos.map(m => ({ id: m.id_exame ?? '', ativo: m.ativo,
                                  exames: m.exames })));
        ex = { exames: le.exames, tuss: lt.tuss, medicos: quem,
               horarios: lh.faixas };
        setExames(ex);
        achadosDeExame = [...le.achados, ...lt.achados, ...lh.achados,
                          ...semNinguem];
      } else {
        setExames(null);
      }

      /* ⭐⭐⭐ `raw: true` SÓ PARA ESTA ABA, e é o ponto mais
       *  delicado da leitura.
       *
       *  Com `raw: false` o leitor devolveu a data como TEXTO no
       *  formato americano — "8/24/2026 8:00:00". Lido como
       *  dia/mês, 24 de agosto vira o mês 24; e "3/11" não tem
       *  como saber se é 3 de novembro ou 11 de março.
       *
       *  Com `raw: true` ela vem como `Date` de verdade, montada
       *  no fuso de quem abre — sem ambiguidade nenhuma. Medido
       *  nas 10.213 linhas do Tom: todas viraram `Date`.
       *
       *  ⚠️ O resto da planilha CONTINUA em `raw: false`, porque
       *     é o que o núcleo espera. Trocar para todo mundo
       *     mudaria o CPF para número e o zero à esquerda seria
       *     perdido antes de chegar ao `digitos()`. */
      /* ⭐⭐⭐ 29/10 — e a aba Agendamentos é lida de NOVO, SEM
       *  `cellDates`, para a `Data_Hora` chegar como o NÚMERO CRU
       *  do Excel. A `Date` que o leitor monta vem com um artefato
       *  de segundos que às vezes vai para trás: 07:10 virava
       *  07:09 (o print do Tom, Mauricio e Marciano). O número
       *  vira hora por aritmética, no núcleo (`instanteDaPlanilha`). */
      const wbCru = XLSX.read(buf, { type: 'array' });
      const abaAgenda = wbCru.Sheets['Agendamentos']
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(
            wbCru.Sheets['Agendamentos'], { defval: '', raw: true })
        : [];
      setAgenda(abaAgenda.length
        ? lerAgendamentos(abaAgenda, aba('Medicos') ?? [],
                          aba('Especialidades') ?? [], aba('Convenios') ?? [])
        : null);

      setCadastros({ especialidades: esp, convenios: conv.convenios,
                     medicos: med.medicos, expediente: exp });
      setPacientes(p.pacientes);
      setAchados([...conv.achados, ...med.achados, ...p.achados,
                  ...achadosDeExame]);
      setArquivo(f.name);
      setPasso('lido');
    } catch (e) {
      avisar('Não deu para abrir o arquivo: ' + ((e as Error).message ?? e), false);
    } finally {
      setLendo(false);
    }
  }

  /* ---------------- 2 e 3. ensaio e valendo ---------------- */

  /* ════════════════════════════════════════════════════════
   *  ⭐ OS PACIENTES VÃO EM LOTES — E O MOTIVO É UM NÚMERO
   *
   *  ⚠️ ISTO NASCEU DE UM DEFEITO EM PRODUÇÃO, 08/10/2026.
   *
   *  A primeira versão mandava os 3956 pacientes numa chamada
   *  só, porque aqui na bancada isso levava 4 segundos. No
   *  Supabase voltou:
   *
   *      canceling statement due to statement timeout
   *
   *  O Supabase corta qualquer chamada de `authenticated` em
   *  **8 segundos**, e com as travas de isolamento ligadas cada
   *  paciente custa várias vezes mais do que custava aqui. A
   *  importação morria no meio do ensaio, sem relatório nenhum.
   *
   *  ------------------------------------------------------------
   *  ⭐ E POR QUE O LOTE NÃO ESTRAGA O ENSAIO DESTA VEZ
   *
   *  Porque os CPFs repetidos já foram fundidos lá no
   *  `nucleo/planilha.ts`, antes de sair daqui.
   *
   *  Foi justamente o lote que fez o ensaio mentir na primeira
   *  vez: o lote 2 não enxergava o lote 1, e um CPF repetido
   *  entre eles contava como "criado" duas vezes — ensaio 2561,
   *  importação 2446. Com cada CPF aparecendo uma vez só, os
   *  lotes não têm como discordar.
   *
   *  A única exceção é o paciente SEM CPF, que casa por nome +
   *  nascimento. Por isso eles vão todos no MESMO lote, o
   *  último — um grupo que não se divide não se perde.
   *
   *  ------------------------------------------------------------
   *  E SE AINDA ASSIM ESTOURAR
   *
   *  O lote se parte ao meio e tenta de novo, até 25. Escolher
   *  um número fixo seria chutar o tamanho da máquina do
   *  hospital; o tempo real responde melhor que eu.
   * ════════════════════════════════════════════════════════ */

  // 150, e não 250: cada tentativa que leva corte custa os 8
  // segundos inteiros do limite antes de a tela saber que falhou.
  // Começar menor troca um round-trip de 100 ms (são ~27 lotes em
  // 4000 pacientes) por não esperar 8 segundos à toa.
  const LOTE_INICIAL = 150;
  const LOTE_MINIMO = 25;

  const [progresso, setProgresso] = useState('');
  const [parada, setParada] = useState<Parada | null>(null);

  /** O Postgres corta com 57014. A mensagem é só reserva. */
  function ehTempoEsgotado(e: unknown): boolean {
    const x = e as { code?: string; message?: string };
    return x?.code === '57014' || /statement timeout/i.test(x?.message ?? '');
  }

  /* ⭐ A MENSAGEM CRUA DO BANCO NÃO DIZ O QUE FAZER EM SEGUIDA.
   *
   *  "canceling statement due to statement timeout" é verdade e
   *  não serve para nada na mão de quem está importando. E o
   *  PostgREST manda o resto da explicação em `details` e `hint`
   *  — campos que a versão anterior jogava fora, mostrando só o
   *  `message`.
   */
  function emLetras(e: unknown): string {
    if (ehTempoEsgotado(e)) {
      return `O banco cortou a chamada por tempo, mesmo com os lotes no ` +
             `menor tamanho (${LOTE_MINIMO} pacientes).`;
    }
    const x = e as {
      message?: string; details?: string; hint?: string; code?: string };
    const texto = [x?.message, x?.details, x?.hint].filter(Boolean).join(' — ');
    return texto || String(e);
  }

  /* A FILA TEM SEMPRE A MESMA ORDEM.
   *
   * É ela que dá sentido ao "continuar de onde parou": se a
   * ordem mudasse entre uma tentativa e outra, o índice 1200
   * apontaria para outra pessoa, e o recomeço pularia uns e
   * repetiria outros.
   *
   * Os sem CPF vão por último, juntos — ver o comentário grande
   * acima. */
  const filaDePacientes = useMemo(() => [
    ...pacientes.filter(p => p.cpf),
    ...pacientes.filter(p => !p.cpf),
  ], [pacientes]);

  const NADA_AINDA: PacientesImportados = {
    criados: 0, atualizados: 0, ignorados: 0, recusados: 0,
    sem_cpf: 0, cpf_corrigido: 0, detalhes: [],
  };

  function somar(
    a: PacientesImportados, b: PacientesImportados
  ): PacientesImportados {
    return {
      criados:       a.criados       + b.criados,
      atualizados:   a.atualizados   + b.atualizados,
      ignorados:     a.ignorados     + b.ignorados,
      recusados:     a.recusados     + b.recusados,
      sem_cpf:       a.sem_cpf       + b.sem_cpf,
      cpf_corrigido: a.cpf_corrigido + b.cpf_corrigido,
      // 50 motivos bastam para entender; 3000 não cabem na tela
      // nem na cabeça de ninguém. O número total continua certo.
      detalhes: a.detalhes.concat(b.detalhes ?? []).slice(0, 50),
    };
  }

  /** O que a volta dos lotes devolve: o que entrou, até onde, e
   *  o que derrubou — se derrubou. Nunca um `throw`. */
  type Andamento = {
    total: PacientesImportados;
    ate: number;          // índice do primeiro que NÃO entrou
    erro: unknown | null;
  };

  async function mandarPacientes(
    confirmar: boolean, comecarEm: number, base: PacientesImportados
  ): Promise<Andamento> {
    const ordenados = filaDePacientes;

    let total = base;
    let i = comecarEm;
    let tamanho = LOTE_INICIAL;

    while (i < ordenados.length) {
      const fatia = ordenados.slice(i, i + tamanho);
      setProgresso(
        `${confirmar ? 'Importando' : 'Ensaiando'} pacientes: ` +
        `${i} de ${ordenados.length}…`);
      try {
        const r = await importarPacientes({
          clienteId, linhas: fatia, confirmar });
        total = somar(total, r);
        i += fatia.length;
      } catch (e) {
        if (ehTempoEsgotado(e) && tamanho > LOTE_MINIMO) {
          tamanho = Math.max(LOTE_MINIMO, Math.floor(tamanho / 2));
          setProgresso(`O banco cortou por tempo. Tentando de novo com ` +
                       `lotes de ${tamanho}…`);
          continue;        // mesma fatia, menor
        }
        // ⭐ AQUI FICAVA UM `throw e`, E ELE LEVAVA O RELATÓRIO
        //    JUNTO. Agora a parada volta como RESPOSTA, com tudo
        //    que já entrou dentro dela.
        setProgresso('');
        return { total, ate: i, erro: e };
      }
    }

    setProgresso('');
    return { total, ate: i, erro: null };
  }

  /**
   * `comecarEm` > 0 é o "continuar de onde parou": ele PULA os
   * cadastros (já entraram na primeira passada) e soma ao
   * relatório que está na tela, em vez de zerá-lo.
   */
  async function importar(confirmar: boolean, comecarEm = 0) {
    if (!cadastros || indo) return;
    const continuando = comecarEm > 0;

    setIndo(true); setValendo(confirmar); setParada(null);
    const base = continuando && pac ? pac : NADA_AINDA;
    if (!continuando) { setSecoes([]); setPac(null); }

    try {
      if (!continuando) {
        setProgresso(confirmar ? 'Importando cadastros…' : 'Ensaiando cadastros…');
        const s = await importarCadastros({ clienteId, dados: cadastros, confirmar });

        /* ⭐ OS EXAMES VÊM DEPOIS DOS CADASTROS, E O MOTIVO É O
         *    VÍNCULO: o `importar_exames` liga cada exame aos
         *    profissionais procurando-os PELO NOME, e eles só
         *    existem depois que o `importar_cadastros` os criou.
         *
         *    Invertendo a ordem, todo exame entraria sem
         *    ninguém — e, desde 09/10, exame sem ninguém não
         *    aparece para marcar. O hospital importaria e não
         *    teria exame nenhum na tela. */
        let se: SecaoImportada[] = [];
        if (exames) {
          setProgresso(confirmar ? 'Importando exames…' : 'Ensaiando exames…');
          se = await importarExames({ clienteId, dados: exames, confirmar });
        }
        setSecoes([...s, ...se]);
      }

      const a = await mandarPacientes(confirmar, comecarEm, base);

      // O relatório vai para a tela PRIMEIRO, e ele vai mesmo que
      // a importação tenha parado no meio.
      setPac(a.total);
      setPasso(confirmar ? 'pronto' : 'ensaio');

      if (a.erro) {
        setParada({
          em: a.ate, de: filaDePacientes.length,
          erro: emLetras(a.erro), confirmar,
        });
      } else if (confirmar) {
        avisar('Importação concluída.', true);
      }
    } catch (e) {
      // Só cai aqui o que falhou ANTES dos pacientes — os
      // cadastros. Lá não há nada parcial para guardar: o
      // `importar_cadastros` é uma chamada só.
      avisar(emLetras(e), false);
    } finally {
      setIndo(false);
      setProgresso('');
    }
  }

  /* ---------------- o que mostrar ---------------- */

  const resumo = useMemo(() => {
    if (!cadastros) return null;
    const m = cadastros.medicos;
    return {
      especialidades: cadastros.especialidades.length,
      convenios: cadastros.convenios.length,
      medicos: m.length,
      ativos: m.filter(x => verdade(x.ativo)).length,
      consulta: m.filter(x => x.faz_consulta).length,
      exame: m.filter(x => x.faz_exame).length,
      comLimite: m.reduce(
        (n, x) => n + x.convenios.filter(c => (c.limiteDia ?? 0) > 0).length, 0),
      comFaixa: m.filter(x => x.idade_min || x.idade_max).length,
      expediente: cadastros.expediente.filter(f => verdade(f.ativo)).length,
      medicosComExpediente: new Set(
        cadastros.expediente.filter(f => verdade(f.ativo)).map(f => f.medico)).size,
      pacientes: pacientes.length,
    };
  }, [cadastros, pacientes]);

  const porTipo = (t: string) => achados.filter(a => a.tipo === t);

  return (
    <>
      <div className="page-header">
        <h2>Importar a planilha</h2>
      </div>

      {/* ---------------- 1. o arquivo ---------------- */}
      <div className="imp-caixa">
        <h3><i className="fas fa-file-excel" /> 1 · A planilha</h3>
        <p className="wiz-dica">
          O arquivo <strong>.xlsx</strong> exportado do Google Sheets. Ele é
          lido <strong>aqui no seu navegador</strong> — não sobe para lugar
          nenhum antes de você mandar.
        </p>

        <input ref={campo} type="file" accept=".xlsx,.xlsm" data-campo="arquivo"
               style={{ display: 'none' }}
               onChange={e => { const f = e.target.files?.[0]; if (f) abrir(f); }} />

        <button className="btn-primary" data-acao="escolher-arquivo"
                disabled={lendo} onClick={() => campo.current?.click()}>
          {lendo
            ? <><i className="fas fa-circle-notch fa-spin" /> Lendo…</>
            : <><i className="fas fa-folder-open" /> Escolher o arquivo</>}
        </button>

        {!!arquivo && (
          <span className="imp-arquivo" data-arquivo={arquivo}>
            <i className="fas fa-check" /> {arquivo}
          </span>
        )}

        <details className="imp-abas">
          <summary>Quais abas ele usa</summary>
          <ul>
            {ABAS.map(a => (
              <li key={a.nome}>
                <code>{a.nome}</code> — {a.serve}
              </li>
            ))}
          </ul>
          <p className="wiz-dica">
            A aba <code>Agendamentos</code> <strong>não</strong> entra. As
            consultas continuam no sistema de hoje até o dia da virada.
          </p>
        </details>
      </div>

      {/* ---------------- 2. o que eu entendi ---------------- */}
      {passo !== 'abrir' && resumo && (
        <div className="imp-caixa" data-bloco="entendi">
          <h3><i className="fas fa-glasses" /> 2 · O que eu entendi do arquivo</h3>

          {!!faltando.length && (
            <div className="dia-nota amarela" data-aviso="abas-faltando">
              <strong>
                <i className="fas fa-triangle-exclamation" /> Faltam abas
              </strong>
              <p>
                Não achei <strong>{faltando.join(', ')}</strong>. O que vem
                delas não vai entrar. Se a exportação foi parcial, pare aqui.
              </p>
            </div>
          )}

          <div className="imp-numeros">
            <div><em>{resumo.especialidades}</em><span>especialidades</span></div>
            <div><em>{resumo.convenios}</em><span>convênios ativos</span></div>
            <div><em>{resumo.medicos}</em><span>médicos</span></div>
            <div><em>{resumo.expediente}</em>
                 <span>faixas de expediente<br />
                 <small>em {resumo.medicosComExpediente} médicos</small></span></div>
            <div><em>{resumo.pacientes}</em><span>pacientes</span></div>
          </div>

          {/* ⭐⭐ AS QUATRO ABAS DE EXAME.
              Só aparecem quando a planilha as tem — cinco
              números zerados diriam "não havia nada", quando o
              que houve foi uma aba que não veio. */}
          {!!exames && (
            <div className="imp-numeros" data-bloco="numeros-exame">
              <div><em>{exames.exames.length}</em>
                   <span>exames<br /><small>
                     {exames.exames.filter(e => e.ativo).length} ativos</small>
                   </span></div>
              <div><em>{exames.exames.reduce((n, e) => n + e.subtipos.length, 0)}</em>
                   <span>subtipos<br /><small>
                     em {exames.exames.filter(e => e.subtipos.length).length} exame(s)
                   </small></span></div>
              <div><em>{exames.tuss.length}</em><span>códigos TUSS</span></div>
              <div><em>{exames.horarios.length}</em>
                   <span>faixas de exame</span></div>
              <div><em>{exames.exames.filter(e => e.requer_entrevista).length}</em>
                   <span>com entrevista</span></div>
            </div>
          )}

          {/* ⭐ Planilha sem a aba de exames: dizer, e não deixar
              a pessoa procurar os exames depois da importação. */}
          {!exames && (
            <p className="wiz-dica" data-aviso="sem-aba-exame">
              Esta planilha não tem a aba <strong>Exames_Config</strong>, então
              nenhum exame vai entrar. Consulta e pacientes entram normalmente.
            </p>
          )}

          <p className="wiz-dica">
            Dos {resumo.medicos} médicos: <strong>{resumo.ativos} ativos</strong>,{' '}
            {resumo.consulta} atendem consulta, {resumo.exame} fazem exame,{' '}
            {resumo.comLimite} vínculos de convênio têm limite por dia, e{' '}
            {resumo.comFaixa} têm faixa etária.
          </p>

          {/* ⭐ O que o importador decidiu por conta própria fica
              à vista ANTES de qualquer gravação. */}
          {!!achados.length && (
            <div className="imp-achados" data-bloco="achados">
              <h4>O que eu resolvi sozinho — confira</h4>
              {/* ⭐ Os oito achados das abas de EXAME entram na
                  mesma lista. Cada um deles é uma decisão que
                  muda quem aparece para marcar — exame só com
                  gente inativa, profissional desligado só na aba
                  de exames, código TUSS órfão, faixa de horário
                  sem dono. Nenhum pode sumir calado. */}
              {(['cpf-consertado', 'nascimento-recuperado', 'convenio-inativo',
                 'medico-repetido', 'nome-divergente', 'cpf-repetido',
                 'exame-so-com-inativo', 'exame-sem-ninguem',
                 'medico-exame-desativado', 'entrevista-sem-pergunta',
                 'tuss-sem-exame', 'tuss-sem-subtipo',
                 'horario-sem-medico', 'subtipos-ilegiveis',
                 'subtipo-repetido', 'exame-id-repetido'] as const)
                .map(t => {
                  const lista = porTipo(t);
                  if (!lista.length) return null;
                  // Os repetidos de nome igual são 124 linhas de
                  // "entrou uma vez" — vira contagem, não lista.
                  const resumir = t === 'cpf-repetido' || t === 'nome-divergente';
                  return (
                    <div key={t} className="imp-achado" data-achado={t}>
                      {resumir ? (
                        <>
                          <strong>
                            {plural(lista.length, 'CPF repetido', 'CPFs repetidos')}
                          </strong>{' '}
                          {t === 'cpf-repetido'
                            ? 'com o mesmo nome — entraram uma vez.'
                            : 'com GRAFIAS DIFERENTES do nome. ' +
                              'Ficou a mais recente:'}
                          {t === 'nome-divergente' && (
                            <ul>
                              {lista.slice(0, 25).map(a => (
                                <li key={a.chave}>
                                  <code>{a.chave}</code> — {a.detalhe}
                                </li>
                              ))}
                              {lista.length > 25 && (
                                <li>… e outros {lista.length - 25}.</li>
                              )}
                            </ul>
                          )}
                        </>
                      ) : (
                        <ul>
                          {lista.map((a, i) => (
                            <li key={a.chave + i}>{a.detalhe}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          <div className="form-actions">
            <button className="btn-primary" data-acao="ensaio"
                    disabled={indo} onClick={() => importar(false)}>
              {indo && !valendo
                ? <><i className="fas fa-circle-notch fa-spin" /> Ensaiando…</>
                : <><i className="fas fa-flask" /> Fazer o ensaio</>}
            </button>
          </div>

          {/* ⭐ Com 3956 pacientes em 16 lotes, uma tela parada por
              meio minuto parece travada — e quem acha que travou
              clica de novo. */}
          {!!progresso && (
            <p className="imp-progresso" data-progresso="1">
              <i className="fas fa-circle-notch fa-spin" /> {progresso}
            </p>
          )}
          <p className="wiz-dica">
            O ensaio <strong>grava tudo e desfaz</strong>. Os números que ele
            der são os mesmos da importação de verdade.
          </p>
        </div>
      )}

      {/* ---------------- 3. o relatório ---------------- */}
      {(passo === 'ensaio' || passo === 'pronto') && (
        <div className="imp-caixa" data-bloco="relatorio">
          <h3>
            <i className={passo === 'pronto'
              ? 'fas fa-circle-check' : 'fas fa-flask'} />{' '}
            {passo === 'pronto' ? '3 · Importado' : '3 · O ensaio disse'}
          </h3>

          <table className="imp-tabela" data-tabela="relatorio">
            <thead>
              <tr>
                <th>o quê</th><th>entram</th><th>atualizam</th>
                <th>de fora</th><th>recusados</th>
              </tr>
            </thead>
            <tbody>
              {secoes.map(s => (
                <tr key={s.secao} data-secao={s.secao}
                    className={s.recusados ? 'tem-recusa' : ''}>
                  <td>{s.secao}</td>
                  <td>{s.criados}</td>
                  <td>{s.atualizados}</td>
                  <td>{s.ignorados || '—'}</td>
                  <td>{s.recusados || '—'}</td>
                </tr>
              ))}
              {pac && (
                <tr data-secao="Pacientes"
                    className={pac.recusados ? 'tem-recusa' : ''}>
                  <td>Pacientes</td>
                  <td>{pac.criados}</td>
                  <td>{pac.atualizados}</td>
                  <td>{pac.ignorados || '—'}</td>
                  <td>{pac.recusados || '—'}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* ⭐ "Entram" no expediente conta FAIXAS; "atualizam"
              conta MÉDICOS. 55 faixas em 27 médicos diz uma
              coisa; 55 em 2 diria outra. */}
          <p className="wiz-dica">
            No expediente, <strong>entram</strong> conta faixas e{' '}
            <strong>atualizam</strong> conta médicos.
          </p>

          {/* As recusas, uma por uma, com o motivo. */}
          {[...secoes.flatMap(s => s.detalhes.map(d => ({ ...d, secao: s.secao }))),
            ...(pac?.detalhes ?? []).map(d => ({ ...d, secao: 'Pacientes' }))]
            .slice(0, 50).length > 0 && (
            <div className="imp-recusas" data-bloco="recusas">
              <h4>Linha por linha</h4>
              <ul>
                {[...secoes.flatMap(s =>
                    s.detalhes.map(d => ({ ...d, secao: s.secao }))),
                  ...(pac?.detalhes ?? []).map(d => ({ ...d, secao: 'Pacientes' }))]
                  .slice(0, 50).map((d, i) => (
                    <li key={i}>
                      <em>{d.secao}</em> · <strong>{d.linha || '—'}</strong> —{' '}
                      {d.motivo}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* ════════════════════════════════════════════════
              ⭐ PAROU NO MEIO — E O QUE JÁ ENTROU CONTINUA AQUI

              A tabela acima não é apagada. Ela mostra o que
              entrou ATÉ a parada, que é exatamente a pergunta
              que o Tom fez em 08/10: "parte foi importado, mas
              no final não deu certo".

              Três coisas, nesta ordem, porque é a ordem em que
              alguém precisa delas: onde parou, o que o banco
              disse, e o botão que retoma.
             ════════════════════════════════════════════════ */}
          {parada && (
            <div className="dia-nota vermelha" style={{ marginTop: 14 }}
                 data-aviso="parou-no-meio">
              <strong>
                <i className="fas fa-circle-pause" />{' '}
                {parada.confirmar ? 'A importação parou' : 'O ensaio parou'}{' '}
                no paciente {parada.em} de {parada.de}
              </strong>
              <p>
                {parada.confirmar ? (
                  <>
                    Os <strong>{parada.em} primeiros já estão no banco</strong>,
                    e estão contados na tabela acima. Os{' '}
                    {parada.de - parada.em} seguintes não entraram.
                  </>
                ) : (
                  <>
                    Nada foi gravado — o ensaio desfaz cada lote. Os números
                    acima valem para os {parada.em} primeiros, só.
                  </>
                )}
              </p>
              <p data-parada="motivo">
                O banco disse: <code>{parada.erro}</code>
              </p>
              <div className="form-actions">
                <button className="btn-primary" data-acao="continuar"
                        disabled={indo}
                        onClick={() => importar(parada.confirmar, parada.em)}>
                  {indo
                    ? <><i className="fas fa-circle-notch fa-spin" /> Continuando…</>
                    : <><i className="fas fa-play" /> Continuar do paciente{' '}
                        {parada.em}</>}
                </button>
              </div>
              <p className="wiz-dica">
                Retomar é seguro: quem já entrou é <strong>atualizado</strong>,
                não duplicado — é o mesmo CPF.
              </p>
            </div>
          )}

          {passo === 'ensaio' && (
            <>
              <div className="dia-nota amarela" style={{ marginTop: 14 }}>
                <strong>
                  <i className="fas fa-triangle-exclamation" /> Nada foi gravado
                  ainda
                </strong>
                <p>
                  Confira os números acima, e principalmente as recusas. Daqui
                  para a frente é para valer.
                </p>
                <p>
                  Importar de novo depois <strong>atualiza em vez de
                  duplicar</strong>, então dá para consertar a planilha e
                  repetir quantas vezes precisar.
                </p>
              </div>

              <div className="form-actions">
                <button className="btn-secondary" disabled={indo}
                        onClick={() => {
                          setPasso('lido'); setSecoes([]);
                          setPac(null); setParada(null);
                        }}>
                  Voltar
                </button>
                {/* ⭐ ENSAIO QUE PAROU NO MEIO NÃO AUTORIZA NADA.
                    Os números em cima valem para uma PARTE da
                    planilha, e é exatamente assim que uma prévia
                    mente: ela não erra o que mostra, ela mostra
                    menos do que vai acontecer. */}
                <button className="btn-danger" data-acao="importar-valendo"
                        disabled={indo || !!parada}
                        title={parada
                          ? 'Termine o ensaio antes: ele parou no meio e os ' +
                            'números acima valem só para uma parte da planilha.'
                          : undefined}
                        onClick={() => importar(true)}>
                  {indo && valendo
                    ? <><i className="fas fa-circle-notch fa-spin" /> Importando…</>
                    : <><i className="fas fa-database" /> Importar de verdade</>}
                </button>
              </div>

              {!!progresso && (
                <p className="imp-progresso" data-progresso="1">
                  <i className="fas fa-circle-notch fa-spin" /> {progresso}
                </p>
              )}
            </>
          )}

          {/* ⭐ O VERDE SÓ APARECE SE TERMINOU MESMO.
              "Está no banco" em cima de uma importação que parou
              no paciente 1200 é o `success: true` sobre nada
              feito que apagou o expediente de quatro médicos em
              07/10. Com a parada na tela, quem manda é o
              vermelho. */}
          {passo === 'pronto' && !parada && (
            <div className="dia-nota verde" style={{ marginTop: 14 }}
                 data-aviso="importado">
              <strong><i className="fas fa-circle-check" /> Está no banco</strong>
              <p>
                Confira em <strong>Médicos</strong>, <strong>Especialidades</strong>,{' '}
                <strong>Convênios</strong> e na aba <strong>Expediente</strong> da
                Agenda do Médico. Se achar algo errado, conserte na planilha e
                importe de novo: o importador atualiza, não duplica.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          ⭐⭐⭐ AS AGENDAS, DEPOIS E SEPARADO      (27/10/2026)

          Aparece só quando os cadastros JÁ FORAM importados
          (`passo === 'pronto'`), e isso é a trava, não a ordem
          sugerida: a agenda liga por NOME de médico e de
          especialidade. Importada antes, ela recusaria as
          10.213 linhas dizendo "médico não existe" — e o Tom
          concluiria que a planilha está errada.
          ════════════════════════════════════════════════════════ */}
      {!!agenda && passo === 'pronto' && !parada && clienteId && (
        <ImportarAgendas clienteId={clienteId} resumo={agenda}
                         aoAvisar={avisar} />
      )}

      {!!agenda && passo !== 'pronto' && (
        <div className="imp-caixa" data-bloco="agendas-depois">
          <h3><i className="fas fa-calendar-check" /> 4 · As agendas</h3>
          <p className="imp-sub">
            O arquivo tem <strong>{agenda.linhas.length}</strong> consulta(s)
            marcada(s). Elas entram <strong>depois</strong> dos cadastros —
            é o nome do médico e da especialidade que liga uma coisa na
            outra. Termine o passo 3 e esta parte abre.
          </p>
        </div>
      )}

      <Aviso recado={recado} aoFechar={fechar} />
    </>
  );
}
