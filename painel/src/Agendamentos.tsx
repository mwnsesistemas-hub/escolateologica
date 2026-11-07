import { useEffect, useMemo, useState } from 'react';
import {
  consultasNoPeriodo, buscarConsultas, mudarSituacao, modelosDoCliente, avisarPacienteAgora,
  type Consulta, type ModeloWhatsApp
} from './dados';
import { FILTRO_STATUS, infoStatus } from './status';
import { CardConsulta, type AcoesConsulta } from './CardConsulta';
import { DetalhesConsulta } from './DetalhesConsulta';
import { Cancelar } from './Cancelar';
import { MoverConsulta, type Modo } from './MoverConsulta';
import { CorrigirPaciente } from './CorrigirPaciente';
import { linkWhatsApp } from './whatsapp';
import { Aviso, useAviso } from './Aviso';
import { somarDias, comoISO, diaNoFuso, hojeNoFuso, rotuloDoDia }
  from '../../nucleo/formato';

/**
 * ============================================================
 *  A TELA DE AGENDAMENTOS
 *
 *  Reconstruída da tela de hoje: as cinco abas de período, a
 *  busca, os três filtros, o agrupamento por dia com o selo
 *  HOJE, e os cards.
 *
 *  ------------------------------------------------------------
 *  UMA DIFERENÇA DELIBERADA: O PERÍODO VAI AO BANCO
 *
 *  No sistema de hoje, a tela carrega TODOS os agendamentos numa
 *  variável (`agendamentosCache`) e filtra por período no
 *  navegador. Funciona com um hospital e alguns milhares de
 *  linhas; com cinco hospitais e alguns anos, não.
 *
 *  Aqui a aba escolhida vira um intervalo de datas na consulta.
 *  Trocar de aba é uma ida ao banco — e uma ida que o índice
 *  resolve, em vez de trazer tudo para peneirar aqui.
 *
 *  A busca e os três filtros continuam no navegador, porque
 *  operam sobre o que já está na tela e precisam ser instantâneos
 *  enquanto a recepção digita.
 * ============================================================
 */

type Aba = 'hoje' | 'amanha' | 'semana' | 'mes' | 'todos';

const ABAS: { id: Aba; rotulo: string; icone: string }[] = [
  { id: 'hoje',   rotulo: 'Hoje',        icone: 'fa-calendar-day' },
  { id: 'amanha', rotulo: 'Amanhã',      icone: 'fa-calendar' },
  { id: 'semana', rotulo: 'Esta Semana', icone: 'fa-calendar-week' },
  { id: 'mes',    rotulo: 'Este Mês',    icone: 'fa-calendar-alt' },
  { id: 'todos',  rotulo: 'Todos',       icone: 'fa-infinity' }
];

/**
 * A aba vira um intervalo de datas — no relógio do HOSPITAL.
 *
 * "Hoje" tem que ser o dia de trabalho de lá. Para quem abre de
 * outro fuso, o dia pode já ter virado — e a aba Hoje mostraria
 * a agenda de amanhã sem avisar.
 */
function periodoDaAba(aba: Aba, dataEspecifica: string, fuso: string): [string, string] {
  if (dataEspecifica) return [dataEspecifica, dataEspecifica];

  const hoje = hojeNoFuso(fuso);
  switch (aba) {
    case 'hoje':   return [hoje, hoje];
    case 'amanha': return [somarDias(hoje, 1), somarDias(hoje, 1)];
    case 'semana': {
      // A semana que CONTÉM hoje, de domingo a sábado — igual ao
      // calendário que a recepção tem na parede.
      const d = new Date(`${hoje}T12:00:00`);
      const inicio = somarDias(hoje, -d.getDay());
      return [inicio, somarDias(inicio, 6)];
    }
    case 'mes': {
      const d = new Date(`${hoje}T12:00:00`);
      const primeiro = new Date(d.getFullYear(), d.getMonth(), 1);
      const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return [comoISO(primeiro), comoISO(ultimo)];
    }
    case 'todos':
      /* ⚠️⚠️⚠️ ERA "um ano para trás, dois para a frente", E
       *  DERRUBOU A TELA NA MÃO DO TOM — 28/10/2026.
       *
       *  Eu tinha escrito, em setembro, que sem limite nenhum
       *  esta aba derrubaria a tela "no terceiro ano de uso".
       *  Errei o prazo: bastou importar a agenda de verdade.
       *  Um ano para trás, na base do St James, são 10.145
       *  consultas e 9,7 MB de resposta.
       *
       *  ⭐ Agora a aba olha para A FRENTE, a partir de hoje —
       *     que é o que a recepção faz com ela — e o passado se
       *     alcança pela busca (que vai ao banco) ou escolhendo
       *     a data. Com o teto de linhas lá embaixo, a tela abre
       *     em menos de meio segundo em vez de não abrir.
       */
      return [hoje, somarDias(hoje, 730)];
  }
}

/**
 * ⭐ O TETO DA ABA "TODOS".
 *
 *  Quinhentas linhas é mais do que qualquer pessoa lê de uma
 *  vez, e pouco o bastante para a tela abrir rápido num
 *  hospital de qualquer tamanho. Quando ele é atingido, a tela
 *  DIZ — teto que corta em silêncio é pior que tela lenta,
 *  porque quem olha acredita que viu tudo.
 */
const TETO_TODOS = 500;

/** A busca só vai ao banco a partir daqui. */
const MINIMO_DA_BUSCA = 3;

/** Os dias, na ordem, com as consultas de cada um. */
/**
 * Agrupa pelo dia DO HOSPITAL.
 *
 * Usar o dia do navegador punha a consulta das 23:00 debaixo do
 * cabeçalho do dia seguinte — e ninguém desconfiaria, porque o
 * card continua bonito no lugar errado.
 */
function agruparPorDia(lista: Consulta[]) {
  const grupos = new Map<string, Consulta[]>();
  for (const c of lista) {
    const chave = diaNoFuso(c.inicio, c.fuso);
    const atual = grupos.get(chave);
    if (atual) atual.push(c); else grupos.set(chave, [c]);
  }
  return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
              'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function soDigitos(s: string) { return (s ?? '').replace(/\D/g, ''); }

/** Um dos sete números do topo. */
function Numero({ cor, fundo, icone, n, rotulo }: {
  cor: string; fundo: string; icone: string; n: number; rotulo: string;
}) {
  return (
    <div className="ag-stat-mini" style={{ borderLeftColor: cor }}>
      <div className="ag-stat-mini-icon" style={{ background: fundo, color: cor }}>
        <i className={`fas ${icone}`} />
      </div>
      <div className="ag-stat-mini-info"><h4>{n}</h4><p>{rotulo}</p></div>
    </div>
  );
}

export function Agendamentos({ clienteId, nomeDoHospital = 'hospital' }: {
  clienteId: string;
  /** Vai no texto do WhatsApp: "Aqui é do <nome>". */
  nomeDoHospital?: string;
}) {
  const [aba, setAba] = useState<Aba>('hoje');
  const [dataEspecifica, setDataEspecifica] = useState('');
  const [lista, setLista] = useState<Consulta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [busca, setBusca] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fMedico, setFMedico] = useState('');
  const [fConvenio, setFConvenio] = useState('');

  /* ════════════════════════════════════════════════════════════
   *  ⭐⭐⭐ CONSULTA, EXAME, OU OS DOIS       (09/10/2026)
   *
   *  O Tom: *"na tela agendamentos não está aparecendo os exames
   *  (além disso falta filtro para exames). Por tipo também."*
   *
   *  A causa era UMA PALAVRA: a chamada ao banco passava
   *  `'consulta'` fixo. Os exames eram marcados, gravados,
   *  apareciam na agenda do médico e no calendário — e sumiam
   *  justamente na tela onde a recepção passa o dia.
   *
   *  ⚠️ O padrão agora é `''` — OS DOIS. É o único padrão
   *     honesto numa tela que se chama "Agendamentos": filtrar
   *     por omissão esconde sem avisar, que é como este defeito
   *     durou tanto. Quem quiser só consulta clica em Consultas.
   *
   *  ⭐ Este filtro vai ao BANCO (a visão `agenda_dia` já sabe
   *     `tipo`), e não num `.filter()` depois: trazer o dia
   *     inteiro para mostrar metade cresce com o hospital.
   *     O filtro POR EXAME fica no navegador, como os outros
   *     três — ele só reparte o que já veio.
   * ════════════════════════════════════════════════════════════ */
  const [fTipo, setFTipo] = useState<'' | 'consulta' | 'exame'>('');
  const [fExame, setFExame] = useState('');

  const [aberta, setAberta] = useState<Consulta | null>(null);

  /** A consulta que está no modal de cancelamento, ou null. */
  const [cancelando, setCancelando] = useState<Consulta | null>(null);
  /** A consulta que está sendo movida, e para qual fim. */
  const [movendo, setMovendo] = useState<{ c: Consulta; modo: Modo } | null>(null);
  /** A consulta cujo paciente está sendo corrigido. */
  const [corrigindo, setCorrigindo] = useState<Consulta | null>(null);
  /** O id da consulta que está esperando o banco responder. */
  const [agindo, setAgindo] = useState<string | null>(null);
  /** Muda de número para forçar uma releitura da lista. */
  const [recarga, setRecarga] = useState(0);

  /* ⭐ Quais modelos ESTE número tem aprovados. Lista vazia é a
     resposta normal de um hospital novo — e ela mantém o botão
     verde funcionando pelo caminho manual, em vez de sumir. */
  const [modelos, setModelos] = useState<ModeloWhatsApp[]>([]);
  useEffect(() => {
    let valido = true;
    modelosDoCliente(clienteId)
      .then(l => { if (valido) setModelos(l); })
      // Silêncio de propósito: não ter modelo não é erro, e um
      // toast vermelho ao abrir a tela de agendamentos assustaria
      // sem motivo.
      .catch(() => { if (valido) setModelos([]); });
    return () => { valido = false; };
  }, [clienteId]);

  const { recado, avisar, fechar } = useAviso();

  // O fuso vem nas linhas da agenda. Antes da primeira resposta
  // ainda não temos nenhuma — então o padrão vale só para montar
  // a primeira consulta, e some assim que o banco responde.
  const fuso = lista[0]?.fuso ?? 'America/Sao_Paulo';
  const [de, ate] = periodoDaAba(aba, dataEspecifica, fuso);

  /* ⭐⭐⭐ A BUSCA DA ABA "TODOS" VAI AO BANCO.
   *
   *  Nas outras abas o que está carregado é o período inteiro,
   *  então peneirar no navegador acha tudo que existe ali. Na
   *  aba Todos o que está carregado é um TETO de linhas — e
   *  peneirar aqui acharia só dentro do teto. Quem procura
   *  "Maria" quer a Maria de março, não a que coube na página.
   *
   *  ⚠️ Com espera: sem ela, cada tecla seria uma ida ao banco,
   *     e digitar "maria" seriam cinco varreduras na agenda
   *     inteira. 400 ms é o tempo entre duas teclas de quem
   *     digita rápido. */
  const [buscaNoBanco, setBuscaNoBanco] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setBuscaNoBanco(busca.trim()), 400);
    return () => clearTimeout(t);
  }, [busca]);

  /** Se é a busca do banco que manda nesta tela agora. */
  const buscandoNoBanco = aba === 'todos'
    && !dataEspecifica
    && buscaNoBanco.length >= MINIMO_DA_BUSCA;

  /** Quantas linhas pedir. `null` = o período inteiro. */
  const teto = aba === 'todos' && !dataEspecifica ? TETO_TODOS : null;

  /** 1 consulta ao banco por troca de período (ou de busca). */
  useEffect(() => {
    let valido = true;
    setCarregando(true);
    setErro('');
    const pedido = buscandoNoBanco
      ? buscarConsultas({ clienteId, termo: buscaNoBanco,
                          tipo: fTipo || null, limite: TETO_TODOS })
      : consultasNoPeriodo(clienteId, de, ate, fTipo || null, null, teto);
    pedido
      .then(l => { if (valido) { setLista(l); setCarregando(false); } })
      .catch(e => { if (valido) { setErro(e.message ?? String(e)); setCarregando(false); } });
    return () => { valido = false; };
  }, [clienteId, de, ate, fTipo, recarga, buscandoNoBanco, buscaNoBanco, teto]);

  // Médicos e convênios saem do que está na tela. Não é uma ida
  // ao banco a mais — e mostra só quem tem agenda no período, que
  // é o que a recepção quer filtrar.
  const medicos = useMemo(
    () => [...new Set(lista.map(c => c.recurso))].sort(), [lista]);
  const convenios = useMemo(
    () => [...new Set(lista.map(c => c.convenio ?? 'Particular'))].sort(), [lista]);

  /** Os exames que aparecem no período — só eles entram no filtro. */
  const exames = useMemo(
    () => [...new Set(lista.filter(c => c.tipo === 'exame')
                           .map(c => c.servico)
                           .filter((x): x is string => !!x))].sort(),
    [lista]);

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qNum = soDigitos(busca);
    return lista.filter(c => {
      if (fStatus && c.situacao !== fStatus) return false;
      if (fMedico && c.recurso !== fMedico) return false;
      if (fConvenio && (c.convenio ?? 'Particular') !== fConvenio) return false;
      if (fExame && c.servico !== fExame) return false;
      if (!q) return true;
      // Nome por texto; CPF e telefone por dígito, para achar
      // mesmo quando quem digitou pôs ponto e traço e o banco não.
      if (c.paciente.toLowerCase().includes(q)) return true;
      if (qNum && soDigitos(c.paciente_cpf ?? '').includes(qNum)) return true;
      if (qNum && soDigitos(c.paciente_telefone ?? '').includes(qNum)) return true;
      return false;
    });
  }, [lista, busca, fStatus, fMedico, fConvenio, fExame]);

  /**
   * Os sete números do topo.
   *
   * ⚠️ Cancelado e reagendado são contados SEPARADO, e isso não é
   * detalhe: um CANCELADO que na verdade virou outra consulta não
   * foi cancelado — foi remarcado. Somar os dois inventa uma taxa
   * de cancelamento que não existe, e essa é uma conta que você
   * usa para tomar decisão.
   *
   * Pelo mesmo motivo o registro antigo do reagendamento sai dos
   * "ativos": a consulta de verdade é a nova, que já está nesta
   * mesma lista. Contado nos dois, o paciente apareceria duas
   * vezes.
   *
   * (Isto veio do sistema de hoje, que já tinha acertado.)
   */
  const contas = useMemo(() => {
    const conta = (s: string) => filtrada.filter(c => c.situacao === s).length;
    const cancelados  = filtrada.filter(c => c.situacao === 'CANCELADO' && !c.reagendado_para_quando).length;
    const reagendados = filtrada.filter(c => c.situacao === 'CANCELADO' && !!c.reagendado_para_quando).length;
    return {
      ativos: filtrada.length - cancelados - reagendados,
      aguardando: conta('AGENDADO'),
      confirmados: conta('CONFIRMADO'),
      compareceram: conta('COMPARECEU'),
      faltaram: conta('FALTOU'),
      cancelados,
      reagendados
    };
  }, [filtrada]);

  const porvir = (o: string) =>
    avisar(`"${o}" ainda não foi construído. Está no mapa, vem nas próximas etapas.`, false);

  /* ==========================================================
   *  AS AÇÕES
   *
   *  ----------------------------------------------------------
   *  POR QUE A LISTA INTEIRA É RELIDA, E NÃO SÓ A LINHA MUDADA
   *
   *  Trocar só o card que mudou é mais rápido e está ERRADO.
   *
   *  Duas consultas no mesmo horário carregam a tarja vermelha de
   *  conflito — as DUAS. Cancelando uma, a outra deixa de estar em
   *  conflito, porque a visão `agenda_dia` não conta canceladas.
   *
   *  Se eu só trocasse a linha cancelada, a outra ficaria na tela
   *  com a tarja vermelha de um conflito que não existe mais. E
   *  essa é a pior classe de defeito que existe neste sistema: a
   *  tela continua bonita, ninguém vê erro nenhum, e a informação
   *  está errada.
   *
   *  É uma consulta ao banco por ação. Cabe no orçamento.
   *
   *  ----------------------------------------------------------
   *  "NÃO DEU" NÃO É ERRO
   *
   *  O banco responde `ok: false` com a frase pronta quando a
   *  mudança não vale — marcar falta em quem já compareceu, por
   *  exemplo. Isso é o sistema funcionando, e a recepção lê a
   *  frase no aviso de baixo. Tela vermelha de erro fica para o
   *  que é erro de verdade: a rede caiu, a sessão expirou.
   * ========================================================== */

  async function aplicar(c: Consulta, nova: string) {
    if (agindo) return;
    setAgindo(c.id);
    try {
      const r = await mudarSituacao(c.id, nova);
      avisar(r.mensagem, r.ok);
      if (r.ok) {
        setAberta(null);
        setRecarga(n => n + 1);
      }
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setAgindo(null);
    }
  }

  /**
   * O cancelamento tem caminho próprio porque exige motivo.
   *
   * Aqui o erro é RELANÇADO de propósito: quem mostra a falha é o
   * modal, que fica aberto com a mensagem e o botão liberado. Se
   * eu engolisse o erro, o modal ficaria travado em "Cancelando…"
   * para sempre.
   */
  async function confirmarCancelamento(motivo: string, detalhe: string) {
    const c = cancelando;
    if (!c) return;
    const r = await mudarSituacao(c.id, 'CANCELADO', motivo, detalhe);
    if (!r.ok) throw new Error(r.mensagem);
    setCancelando(null);
    setAberta(null);
    avisar(r.mensagem, true);
    setRecarga(n => n + 1);
  }

  /**
   * O botão verde.
   *
   * A API da Meta é a etapa 5. Até lá, isto abre o WhatsApp com
   * a mensagem JÁ ESCRITA — nome, médico, data e hora — e a
   * recepção confere e aperta enviar.
   *
   * Não é o envio automático disfarçado: não confirma sozinho,
   * não reenvia em 24 h, não sabe se o paciente leu. Mas tira o
   * "ligue para o paciente" de hoje.
   *
   * Sem telefone confiável o link não é montado, e o aviso diz
   * o porquê — melhor que abrir uma conversa com um número
   * inventado, que a recepção manda e ninguém recebe.
   */
  /**
   * ⭐⭐⭐ DOIS CAMINHOS, E A TELA DIZ QUAL FOI
   *
   * 13/10/2026. Se ESTE hospital tem o modelo `confirmacao`
   * aprovado no número dele, a mensagem entra na fila e sai
   * sozinha. Se não tem, o botão continua fazendo o que fazia:
   * abre o WhatsApp com o texto escrito, e a recepção envia.
   *
   * ⚠️ O risco aqui é o de sempre — duas respostas para a mesma
   *    pergunta. Ele é aceitável porque a escolha NÃO é da
   *    tela: ela é do banco (`enfileirar_mensagem` recusa sem
   *    modelo aprovado), e o aviso diz em letras qual dos dois
   *    aconteceu. O que não pode é a recepção achar que mandou
   *    quando só enfileirou, ou achar que enfileirou quando só
   *    abriu uma aba.
   */
  async function aoWhatsApp(c: Consulta) {
    const temModelo = modelos.some(m => m.chave === 'confirmacao' && m.ativo);

    if (temModelo) {
      try {
        // ⭐ 22/10: pelo BANCO — as variáveis são preenchidas lá, igual
        //    ao motor de avisos (antes a tela montava 5, e o modelo
        //    aprovado do St James tem 4). E conta como a confirmação do
        //    motor: quem foi avisado aqui não recebe de novo.
        const r = await avisarPacienteAgora(clienteId, c.id);
        avisar(r.mensagem, r.ok);
        // ⭐ Recusa do banco NÃO cai no link manual. Se o número
        //   é inválido ou o modelo não bate, abrir o WhatsApp
        //   por cima faria a recepção mandar à mão achando que
        //   o automático funcionou.
        return;
      } catch (e) {
        avisar((e as Error).message ?? String(e), false);
        return;
      }
    }

    const url = linkWhatsApp(c, nomeDoHospital);
    if (!url) {
      avisar(
        `${c.paciente} está sem telefone válido no cadastro. ` +
        `Corrija no lápis (precisa de DDD + número).`, false);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const acoes: AcoesConsulta = {
    aoAbrir: setAberta,
    aoWhatsApp: c => { void aoWhatsApp(c); },
    aoCorrigir: c => { setAberta(null); setCorrigindo(c); },
    aoReagendar: c => { setAberta(null); setMovendo({ c, modo: 'reagendar' }); },
    aoConfirmarPorTelefone: c => { void aplicar(c, 'CONFIRMADO'); },
    aoMudarStatus: (c, novo) => {
      // Cancelar não é uma mudança de status como as outras: abre
      // o modal, porque sem motivo o banco recusa.
      if (novo === 'CANCELADO') { setAberta(null); setCancelando(c); return; }
      void aplicar(c, novo);
    },
    aoRetorno: c => { setAberta(null); setMovendo({ c, modo: 'retorno' }); }
  };

  const rotuloPeriodo = dataEspecifica
    ? new Date(`${dataEspecifica}T12:00:00`).toLocaleDateString('pt-BR')
    : (ABAS.find(a => a.id === aba)?.rotulo ?? '');

  const hoje = hojeNoFuso(fuso);

  return (
    <>
      <div className="page-header">
        <h2>Agendamentos</h2>
        <div className="page-actions">
          <button className="btn-secondary" onClick={() => porvir('Importar agenda')}>
            <i className="fas fa-file-import" /> Importar agenda
          </button>
          {/* Era `setAba(a => a)`, que põe o MESMO valor no estado —
              o React vê que nada mudou e não refaz nada. O botão
              existia, piscava, e não atualizava coisa nenhuma. */}
          <button className="btn-primary" onClick={() => setRecarga(n => n + 1)}>
            <i className="fas fa-sync-alt" /> Atualizar
          </button>
        </div>
      </div>

      {/* As cores são as mesmas dos selos de status da lista de
          baixo. Número e selo da mesma cor: o olho liga os dois
          sem esforço. */}
      <div className="ag-stats-row">
        <Numero cor="var(--primary)" fundo="var(--primary-bg)" icone="fa-calendar-check"
                n={contas.ativos} rotulo={`Agendamentos · ${rotuloPeriodo}`} />
        <Numero cor="#F59E0B" fundo="#FFFBEB" icone="fa-clock"        n={contas.aguardando}   rotulo="Aguardando confirmação" />
        <Numero cor="#059669" fundo="#ECFDF5" icone="fa-circle-check" n={contas.confirmados}  rotulo="Confirmados" />
        <Numero cor="#2563EB" fundo="#EFF6FF" icone="fa-user-check"   n={contas.compareceram} rotulo="Compareceram" />
        <Numero cor="#DC2626" fundo="#FEF2F2" icone="fa-user-xmark"   n={contas.faltaram}     rotulo="Faltaram" />
        <Numero cor="#6B7280" fundo="#F3F4F6" icone="fa-ban"          n={contas.cancelados}   rotulo="Cancelados" />
        <Numero cor="#1E40AF" fundo="#EFF6FF" icone="fa-calendar-alt" n={contas.reagendados}  rotulo="Reagendados" />
      </div>

      <div className="ag-filters-bar">
        <div className="ag-filter-tabs">
          {ABAS.map(a => (
            <button key={a.id}
                    className={'ag-filter-tab' + (aba === a.id && !dataEspecifica ? ' active' : '')}
                    onClick={() => { setAba(a.id); setDataEspecifica(''); }}>
              <i className={`fas ${a.icone}`} /> {a.rotulo}
            </button>
          ))}
        </div>

        <div className="ag-filters-advanced">
          <div className="ag-search-box">
            <i className="fas fa-search" />
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
                   placeholder="Buscar paciente, CPF ou telefone..." />
          </div>

          {/* ⭐⭐ CONSULTA | EXAME — botões, não um <select> a mais.
              ────────────────────────────────────────────────────
              É a repartição mais grossa da tela e a que a recepção
              troca o dia inteiro ("agora vou olhar os exames").
              Escondida dentro do quarto menu suspenso ela seria
              usada uma vez por semana.

              E é o mesmo desenho do campo Atendimento do Novo
              Agendamento — a mesma pergunta, com a mesma cara nas
              duas telas. */}
          <div className="ag-tipo-switch" role="group" aria-label="Tipo de atendimento">
            {([['', 'Tudo'], ['consulta', 'Consultas'], ['exame', 'Exames']] as const)
              .map(([v, rot]) => (
              <button key={v || 'tudo'} type="button"
                      data-tipo={v || 'tudo'}
                      className={'ag-tipo-btn' + (fTipo === v ? ' active' : '')}
                      onClick={() => { setFTipo(v); if (v === 'consulta') setFExame(''); }}>
                {rot}
              </button>
            ))}
          </div>

          <select className="input-select" value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {FILTRO_STATUS.map(s => <option key={s.valor} value={s.valor}>{s.texto}</option>)}
          </select>

          <select className="input-select" value={fMedico} onChange={e => setFMedico(e.target.value)}>
            <option value="">Todos médicos</option>
            {medicos.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select className="input-select" value={fConvenio} onChange={e => setFConvenio(e.target.value)}>
            <option value="">Todos convênios</option>
            {convenios.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* ⭐ "Por tipo também", o segundo pedido do Tom: qual
              EXAME. Só aparece quando há exame no período — um
              menu permanentemente vazio é ruído que ensina a
              recepção a ignorar aquele canto da tela. */}
          {!!exames.length && (
            <select className="input-select" data-filtro="exame"
                    value={fExame} onChange={e => setFExame(e.target.value)}>
              <option value="">Todos os exames</option>
              {exames.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          )}

          <input type="date" className="input-date" title="Data específica"
                 value={dataEspecifica}
                 onChange={e => setDataEspecifica(e.target.value)} />
        </div>
      </div>

      {erro && <div className="erro-caixa">{erro}</div>}

      {/* ⭐⭐⭐ O QUE ESTA TELA ESTÁ MOSTRANDO, DITO EM VOZ ALTA.
          Teto que corta em silêncio é pior que tela lenta: quem
          olha acredita que viu tudo. As três frases abaixo são a
          diferença entre "a agenda acabou" e "a página acabou". */}
      {!carregando && !erro && aba === 'todos' && !dataEspecifica && (
        <div className="ag-recorte">
          <i className="fas fa-circle-info" />
          {buscandoNoBanco ? (
            <span>
              Procurando <b>“{buscaNoBanco}”</b> em <b>toda a agenda</b>, do
              passado ao futuro.
              {lista.length >= TETO_TODOS &&
                <> São mais de {TETO_TODOS} — mostrando os {TETO_TODOS} mais
                   recentes. Escreva mais do nome para estreitar.</>}
            </span>
          ) : lista.length >= TETO_TODOS ? (
            <span>
              Mostrando os <b>próximos {TETO_TODOS}</b> agendamentos a partir de
              hoje. Para achar alguém no passado, <b>procure pelo nome, CPF ou
              telefone</b> — a busca olha a agenda inteira. Para um dia certo,
              escolha a data.
            </span>
          ) : (
            <span>
              Mostrando <b>de hoje em diante</b>. Para o passado, procure pelo
              nome, CPF ou telefone, ou escolha a data.
            </span>
          )}
        </div>
      )}

      {carregando && (
        <div className="loading-placeholder">
          <div className="spinner" /><p>Carregando agendamentos...</p>
        </div>
      )}

      {!carregando && !erro && !filtrada.length && (
        <div className="ag-empty">
          <i className="fas fa-calendar-times" />
          <h3>Nenhum agendamento encontrado</h3>
          <p>Tente ajustar os filtros</p>
        </div>
      )}

      {!carregando && agruparPorDia(filtrada).map(([chave, doDia]) => {
        const d = new Date(`${chave}T12:00:00`);
        const ehHoje = chave === hoje;
        return (
          <div className="ag-day-group" key={chave}>
            <div className="ag-day-header">
              <span className={'ag-day-badge' + (ehHoje ? ' hoje' : '')}>
                {rotuloDoDia(chave, hoje)}
              </span>
              <span className="ag-day-title">
                {d.getDate()} de {MESES[d.getMonth()]} de {d.getFullYear()}
              </span>
              <span className="ag-day-count">{doDia.length} neste dia</span>
            </div>
            {doDia.map(c => (
              <CardConsulta key={c.id} c={c} acoes={acoes} ocupado={agindo === c.id} />
            ))}
          </div>
        );
      })}

      {aberta && (
        <DetalhesConsulta c={aberta} acoes={acoes} aoFechar={() => setAberta(null)} />
      )}

      {cancelando && (
        <Cancelar
          c={cancelando}
          clienteId={clienteId}
          aoConfirmar={confirmarCancelamento}
          aoFechar={() => setCancelando(null)}
        />
      )}

      {movendo && (
        <MoverConsulta
          c={movendo.c}
          modo={movendo.modo}
          aoPronto={m => { setMovendo(null); avisar(m, true); setRecarga(n => n + 1); }}
          aoFechar={() => setMovendo(null)}
        />
      )}

      {corrigindo && (
        <CorrigirPaciente
          c={corrigindo}
          aoPronto={m => { setCorrigindo(null); avisar(m, true); setRecarga(n => n + 1); }}
          aoFechar={() => setCorrigindo(null)}
        />
      )}

      <Aviso recado={recado} aoFechar={fechar} />
    </>
  );
}

export { infoStatus };
