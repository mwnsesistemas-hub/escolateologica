import { pegarBuscaPendente } from './ponte';
import { useEffect, useMemo, useState } from 'react';
import {
  medicosDoCliente, servicosDoCliente, conveniosDoCliente,
  primeiraDataPossivel, diasTravadosDoRetorno, gradeDoPeriodo, marcarConsulta,
  medicosQueAtendem, limiteDoConvenioNoDia, faixaEtariaNoDia,
  especialidadesDoCliente, examesDoCliente, subtiposDoExame,
  recursosQueFazem, marcarExame, examesQueOConvenioNaoCobre,
  type Medico, type Servico, type Convenio, type Paciente,
  type Grade, type DataMinima, type MedicoQueAtende,
  type LimiteDoConvenio, type FaixaEtaria,
  type Especialidade, type Exame, type SubtipoDeExame, type QuemFaz
} from './dados';
// `vagasManuaisDoDia`, e não `vagasDoDiaDaGrade`: este é o
// caminho da recepção marcando à mão, e por isso ele enxerga os
// encaixes abertos na Agenda do Médico. O chat do paciente
// continua na outra função, sem encaixe nenhum.
import { vagasManuaisDoDia, vagasDoPedidoNoDia, vagasPorDia, comoHora,
         instanteNoFuso, type VagaDoPedido } from './grade';
import { Aviso, useAviso } from './Aviso';
import { BuscaPaciente } from './BuscaPaciente';
import { formatarCPF, formatarTelefone, somarDias, comoISO, hojeNoFuso }
  from '../../nucleo/formato';
import { PedirExame } from './PedirExame';

/**
 * ============================================================
 *  NOVO AGENDAMENTO — o assistente de 4 passos
 *
 *     1. paciente    achar, ou cadastrar ali mesmo
 *     2. atendimento  serviço + CONVÊNIO + médico
 *     3. horário      o calendário e a lista
 *     4. confirmar    o resumo, antes de gravar
 *
 *  ------------------------------------------------------------
 *  ⭐ O CONVÊNIO VEM ANTES DO MÉDICO   (08/10/2026)
 *
 *  Era o contrário: serviço, médico, e o convênio por último,
 *  só para registrar. A ordem mudou porque o convênio DECIDE
 *  quais médicos aparecem — é assim que o sistema de hoje
 *  funciona, e é o que impede o paciente da Bradesco de gastar
 *  a vaga de um médico que só atende Unimed.
 *
 *  Perguntar depois seria oferecer a lista inteira e descobrir o
 *  problema no balcão, com o paciente na frente.
 *
 *  Quem decide quais médicos entram é `medicos_que_atendem`, no
 *  banco — a MESMA função que o chat do WhatsApp vai chamar. A
 *  tela não refaz a conta: ela pergunta. Médico sem nenhum
 *  convênio cadastrado atende todos, e essa regra mora lá, não
 *  aqui.
 *
 *  ------------------------------------------------------------
 *  POR QUE QUATRO TELAS E NÃO UM FORMULÁRIO SÓ
 *
 *  Porque a resposta de cada passo MUDA o passo seguinte. O
 *  médico escolhido decide quais dias têm vaga; o paciente
 *  escolhido decide a partir de quando a agenda abre. Um
 *  formulário único teria que recalcular tudo a cada tecla, ou
 *  — o que é pior — deixar a pessoa preencher e só reclamar no
 *  fim.
 *
 *  ------------------------------------------------------------
 *  A REGRA DOS 30 DIAS NÃO APARECE COMO ERRO
 *
 *  Ela move o calendário. Se o paciente consultou com o mesmo
 *  médico há 12 dias, o mês abre já na data em que a agenda
 *  libera, e os dias anteriores ficam cinzas como qualquer dia
 *  sem vaga. Uma faixa azul explica por quê.
 *
 *  É a mesma régua dos botões da agenda: a tela não oferece o
 *  impossível para depois dizer não.
 * ============================================================
 */

type Passo = 1 | 2 | 3 | 4;

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_CURTOS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function soDigitos(s: string) { return (s ?? '').replace(/\D/g, ''); }

/** A trilha de passos no topo. */
function Trilha({ passo, aoVoltar }: { passo: Passo; aoVoltar: (p: Passo) => void }) {
  const nomes = ['Paciente', 'Atendimento', 'Horário', 'Confirmar'];
  return (
    <div className="wiz-trilha">
      {nomes.map((n, i) => {
        const num = (i + 1) as Passo;
        const estado = num < passo ? 'feito' : num === passo ? 'atual' : 'porvir';
        return (
          <button key={n}
                  className={`wiz-passo ${estado}`}
                  disabled={num >= passo}
                  onClick={() => num < passo && aoVoltar(num)}>
            <span className="wiz-bolinha">{num < passo ? '✓' : num}</span>
            <span className="wiz-rotulo">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

export function NovoAgendamento({ clienteId, atendeConvenios = true }: {
  clienteId: string;
  /** ⭐ 21/10: clínica sem convênio — tudo é particular. */
  atendeConvenios?: boolean;
}) {
  const [passo, setPasso] = useState<Passo>(1);
  const { recado, avisar, fechar } = useAviso();

  // ---------- as listas, carregadas uma vez ----------
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [exames, setExames] = useState<Exame[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let valido = true;
    setCarregando(true);
    // As três de uma vez. Em sequência seriam três esperas
    // empilhadas antes de a tela desenhar qualquer coisa.
    // As cinco de uma vez. Em sequência seriam cinco esperas
    // empilhadas antes de a tela desenhar qualquer coisa.
    Promise.all([
      medicosDoCliente(clienteId),
      servicosDoCliente(clienteId, 'consulta'),
      conveniosDoCliente(clienteId),
      especialidadesDoCliente(clienteId, true),
      examesDoCliente(clienteId)
    ]).then(([m, s, c, e, x]) => {
      if (!valido) return;
      setMedicos(m); setServicos(s); setConvenios(c);
      setEspecialidades(e); setExames(x);
      setCarregando(false);
    }).catch(e => {
      if (valido) { setErro(e.message ?? String(e)); setCarregando(false); }
    });
    return () => { valido = false; };
  }, [clienteId]);

  /* ========================================================
   *  PASSO 1 — o paciente
   * ======================================================== */
  // ⭐ 21/10: vindo do "Agendar" de uma conversa, a busca já abre preenchida.
  const [busca, setBusca] = useState(() => pegarBuscaPendente());
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [novo, setNovo] = useState(false);
  const [nNome, setNNome] = useState('');
  const [nCpf, setNCpf] = useState('');
  const [nTel, setNTel] = useState('');
  const [nEmail, setNEmail] = useState('');
  const [nNasc, setNNasc] = useState('');

  // A busca mora em `BuscaPaciente.tsx`, porque o encaixe usa a
  // mesma. Ver o cabeçalho de lá: duas buscas copiadas
  // divergiriam no acento, e acento escondendo paciente é como
  // nasce duplicata.
  const falhouBusca = useMemo(() => (m: string) => avisar(m, false), [avisar]);

  const cpfNovoValido = !nCpf || soDigitos(nCpf).length === 11;
  const podePasso1 = !!paciente || (novo && nNome.trim().length >= 3 && cpfNovoValido);

  /* ========================================================
   *  PASSO 2 — o atendimento
   * ======================================================== */
  /* ════════════════════════════════════════════════════════
   *  ⭐⭐ CONSULTA OU EXAME — O CAMPO QUE RAMIFICA
   *
   *  09/10/2026, o Tom:
   *
   *    "na tela de agendamento o campo serviço deveria ser
   *     consulta ou exame. Selecionado consulta abre abaixo
   *     especialidades, se selecionar uma especialidade que tem
   *     subespecialidade abre as sub... Mas se no campo serviço
   *     for selecionado Exame abre o campo tipo ao invés de
   *     especialidades, o Tipo são os exames. Se algum dos
   *     exames tiver sub-tipo como Ultrassom abre a baixo a
   *     opção para marcar todos os subtipos do pedido médico."
   *
   *  Os dois lados são a MESMA estrutura — pai e filho — e é
   *  por isso que subtipo de exame virou serviço com `pai_id`,
   *  igual a subárea de especialidade. Duas árvores diferentes
   *  para a mesma ideia seria o defeito de sempre.
   *
   *    Consulta →  Especialidade  →  Subárea (se houver)
   *    Exame    →  Tipo           →  Subtipos (vários, do pedido)
   * ════════════════════════════════════════════════════════ */
  const [atend, setAtend] = useState<'consulta' | 'exame'>('consulta');

  // ---- o lado da consulta ----
  const [espId, setEspId] = useState('');     // a especialidade de cima
  const [subId, setSubId] = useState('');     // a subárea, quando há

  // ---- o lado do exame ----
  const [exameId, setExameId] = useState('');
  const [listaSub, setListaSub] = useState<SubtipoDeExame[]>([]);
  const [carregandoSub, setCarregandoSub] = useState(false);
  /** Os subtipos marcados — é o PEDIDO MÉDICO. */
  const [pedido, setPedido] = useState<string[]>([]);
  /** ⭐ O pedido de exame com entrevista sai por outra porta. */
  const [pedindo, setPedindo] = useState(false);

  const [medicoId, setMedicoId] = useState('');
  const [convenioId, setConvenioId] = useState('');
  const [obs, setObs] = useState('');

  const exame = exames.find(e => e.id === exameId) ?? null;
  const especialidadesDeCima = useMemo(
    () => especialidades.filter(e => !e.pai_id), [especialidades]);
  const subareas = useMemo(
    () => especialidades.filter(e => e.pai_id === espId), [especialidades, espId]);

  /* ⭐ O SERVIÇO DA CONSULTA É DERIVADO, NÃO ESCOLHIDO.
   *
   *  O importador cria um serviço por especialidade
   *  ("Consulta — Cardiologia"). A recepção escolhe a
   *  especialidade; o serviço vem dela. Pedir as duas coisas
   *  seria pedir a mesma informação duas vezes — e no dia em que
   *  discordassem, a consulta entraria no serviço errado.
   *
   *  A subárea tem serviço próprio quando alguém o cadastrou;
   *  senão vale o do pai, que é o caso do St James.
   */
  const servicoId = useMemo(() => {
    if (atend === 'exame') return '';
    const daSub = subId
      ? servicos.find(s => s.especialidade_id === subId)?.id
      : undefined;
    return daSub
        ?? servicos.find(s => s.especialidade_id === espId)?.id
        ?? '';
  }, [atend, servicos, espId, subId]);

  /** ⭐ O que vai ser marcado, no lado do exame. Um ou vários. */
  const servicosDoPedido = useMemo(() => {
    if (atend !== 'exame' || !exameId) return [];
    if (exame && exame.subtipos > 0) return pedido;
    return [exameId];
  }, [atend, exameId, exame, pedido]);

  const servico = servicos.find(s => s.id === servicoId) ?? null;
  const [quemFaz, setQuemFaz] = useState<QuemFaz[] | null>(null);
  const [buscandoQuem, setBuscandoQuem] = useState(false);

  const medico = medicos.find(m => m.id === medicoId) ?? null;

  /* ⭐ QUEM FOI ESCOLHIDO — PESSOA **OU** APARELHO.
   *
   *  `medicos` vem de `public.medicos`, que só mostra
   *  `tipo = 'profissional'`. O Holter, o Mapa e o
   *  Eletrocardiograma do St James são `equipamento` e não estão
   *  lá — então, num exame feito por aparelho, `medico` é nulo e
   *  a tela mostraria "undefined" no resumo.
   *
   *  Este é o objeto que a tela usa para NOME e DURAÇÃO, nos
   *  dois caminhos. */
  const escolhido = useMemo(() => {
    if (medico) return { nome: medico.nome, duracao_min: medico.duracao_min,
                         aparelho: false };
    const q = quemFaz?.find(x => x.id === medicoId);
    return q ? { nome: q.nome, duracao_min: q.duracao_min,
                 aparelho: q.tipo !== 'profissional' } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medico, quemFaz, medicoId]);
  const convenio = convenios.find(c => c.id === convenioId) ?? null;

  /* ⭐ Os subtipos do exame escolhido. Uma consulta, e só quando
   *    o exame realmente tem filhos — perguntar por um exame sem
   *    subtipo é um round-trip para receber lista vazia. */
  useEffect(() => {
    if (atend !== 'exame' || !exameId || !exame || exame.subtipos === 0) {
      setListaSub([]); setPedido([]); return;
    }
    let valido = true;
    setCarregandoSub(true);
    subtiposDoExame(clienteId, exameId)
      .then(l => { if (valido) { setListaSub(l); setCarregandoSub(false); } })
      .catch(() => { if (valido) { setListaSub([]); setCarregandoSub(false); } });
    return () => { valido = false; };
  }, [clienteId, atend, exameId, exame]);

  /* ⭐ TROCAR DE RAMO LIMPA O OUTRO LADO.
   *
   *  Sem isto, escolher Exame depois de ter escolhido uma
   *  especialidade deixaria a consulta "meio montada" por baixo —
   *  e o passo 2 liberaria com os dois caminhos preenchidos. */
  useEffect(() => {
    setMedicoId('');
    if (atend === 'consulta') { setExameId(''); setPedido([]); setListaSub([]); }
    else { setEspId(''); setSubId(''); }
  }, [atend]);

  /* Trocar a especialidade invalida a subárea escolhida. */
  useEffect(() => { setSubId(''); }, [espId]);

  /* ---------- ⭐ quem atende ESTE convênio ----------
   *
   * Pergunta ao banco. A regra "lista vazia quer dizer todos"
   * mora em `medicos_que_atendem`, junto da herança de
   * subespecialidade, e o chat do WhatsApp vai chamar a mesma
   * função. Refazer o filtro aqui seria a segunda implementação
   * que este projeto persegue desde setembro.
   *
   * `null` enquanto não respondeu, e isso é diferente de lista
   * vazia: um `[]` enquanto carrega diria "nenhum médico atende
   * este convênio", que é falso.
   */
  const [doConvenio, setDoConvenio] = useState<Set<string> | null>(null);
  const [filtrandoConv, setFiltrandoConv] = useState(false);

  /* ------------------------------------------------------------
   *  ⭐ QUEM NÃO ATENDE A IDADE TAMBÉM SOME   (08/10/2026)
   *
   *  Pergunta do Tom: "seria mais inteligente não aparecer o
   *  médico que não atende a idade?". Sim — e com uma ressalva
   *  que é o motivo de isto não ser uma linha só.
   *
   *  A idade MUDA no meio do período que a tela mostra. A criança
   *  de 13 anos e 11 meses não cabe hoje no clínico que atende de
   *  14 para cima, e cabe daqui a um mês — dentro do mesmo
   *  calendário que ela está olhando.
   *
   *  Então some quem não cabe em dia NENHUM dos 90 dias à frente.
   *  Quem cabe em parte do período fica na lista, e é o
   *  CALENDÁRIO que apaga os dias, dizendo a partir de quando.
   *
   *  ------------------------------------------------------------
   *  E POR QUE EXISTE UM JEITO DE TRAZÊ-LOS DE VOLTA
   *
   *  O pediatra que recebe o irmão de 19 anos existe. Se o médico
   *  simplesmente some, a recepção não tem o que clicar — e a
   *  exceção vira telefonema, que o sistema não registra.
   *
   *  Some por padrão, com um link que os traz de volta marcados.
   *  O banco continua recusando e pedindo confirmação; o que a
   *  tela faz é só parar de oferecer o improvável primeiro.
   *
   *  ------------------------------------------------------------
   *  DUAS CHAMADAS, DE PROPÓSITO
   *
   *  Uma com o período (a lista que aparece) e outra sem (para
   *  saber QUEM foi escondido e tê-los prontos para o link).
   *
   *  A alternativa era a tela refazer a regra "nunca cabe" sobre
   *  as datas — uma segunda implementação da mesma decisão, que é
   *  o defeito que este projeto persegue desde setembro. Duas
   *  consultas indexadas custam menos que isso.
   * ------------------------------------------------------------ */
  const [semIdade, setSemIdade] = useState<MedicoQueAtende[]>([]);
  const [mostrarForaIdade, setMostrarForaIdade] = useState(false);
  const [janelas, setJanelas] = useState<Map<string, MedicoQueAtende>>(new Map());

  // O período que o passo 3 mostra. Precisa ser o MESMO número
  // dos 60 dias da grade mais a folga do piso de 30 dias — senão
  // a lista esconde um médico que o calendário ofereceria.
  const DIAS_A_FRENTE = 90;

  useEffect(() => {
    if (!convenioId) {
      setDoConvenio(null); setSemIdade([]); setJanelas(new Map());
      return;
    }
    let valido = true;
    setFiltrandoConv(true);
    setMostrarForaIdade(false);

    const hoje = hojeNoFuso('America/Sao_Paulo');
    const nasc = paciente?.nascimento ?? null;

    Promise.all([
      medicosQueAtendem({
        clienteId, tipo: 'consulta', convenio: convenioId,
        nascimento: nasc, dia: hoje, ate: somarDias(hoje, DIAS_A_FRENTE)
      }),
      // Sem `dia`: o filtro de idade não se aplica, e as janelas
      // vêm preenchidas do mesmo jeito.
      medicosQueAtendem({
        clienteId, tipo: 'consulta', convenio: convenioId, nascimento: nasc
      })
    ])
      .then(([cabem, todos]) => {
        if (!valido) return;
        const ids = new Set(cabem.map(m => m.id));
        setDoConvenio(ids);
        setSemIdade(todos.filter(m => !ids.has(m.id)));
        setJanelas(new Map(todos.map(m => [m.id, m])));
        setFiltrandoConv(false);
      })
      .catch(() => {
        if (!valido) return;
        // Falhou a pergunta: NÃO filtra, e avisa.
        //
        // A alternativa seria lista vazia, e lista vazia aqui
        // parece "nenhum médico atende" — a recepção ligaria
        // para o convênio por causa de uma rede instável.
        setDoConvenio(null); setSemIdade([]); setJanelas(new Map());
        setFiltrandoConv(false);
        avisar('Não deu para conferir quais médicos atendem este convênio. ' +
               'A lista está completa; o banco confere ao marcar.', false);
      });
    return () => { valido = false; };
  }, [clienteId, convenioId, paciente?.nascimento, avisar]);

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐ QUEM FAZ OS EXAMES ESCOLHIDOS
   *
   *  Pergunta ao banco, com o convênio e a idade junto — as
   *  MESMAS regras da lista de consulta, pelas mesmas funções
   *  (`recurso_atende_convenio`, `recurso_cabe_no_periodo`).
   *
   *  ⚠️ Não dá para reusar o `medicos_que_atendem`: ele lê
   *     `public.medicos`, que só mostra `tipo = 'profissional'`,
   *     e sumiriam os oito APARELHOS do St James — Holter, Mapa,
   *     Eletrocardiograma, Espirometria, Teste Ergométrico,
   *     Polissonografia, Eletroencefalograma.
   *
   *  ⭐ E a lista traz só quem faz TODOS os escolhidos, porque o
   *     pedido é marcado em sequência com o mesmo profissional.
   *     Quem faz só um não serve — e mostrá-lo para depois
   *     falhar ao gravar é a tela prometendo o que o banco vai
   *     recusar.
   */
  const chaveDoPedido = servicosDoPedido.join(',');
  useEffect(() => {
    if (atend !== 'exame' || !servicosDoPedido.length) {
      setQuemFaz(null); return;
    }
    let valido = true;
    setBuscandoQuem(true);
    const hoje = hojeNoFuso('America/Sao_Paulo');
    recursosQueFazem({
      clienteId, servicos: servicosDoPedido,
      convenio: convenioId || null,
      nascimento: paciente?.nascimento ?? null,
      dia: hoje, ate: somarDias(hoje, DIAS_A_FRENTE)
    })
      .then(l => { if (valido) { setQuemFaz(l); setBuscandoQuem(false); } })
      .catch(e => {
        if (!valido) return;
        setQuemFaz(null); setBuscandoQuem(false);
        avisar('Não deu para ver quem faz este exame. ' + (e.message ?? ''), false);
      });
    return () => { valido = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, atend, chaveDoPedido, convenioId, paciente?.nascimento, avisar]);

  // Serviço com lista de médicos própria filtra; lista vazia
  // quer dizer "todos atendem", que é como o cadastro de hoje
  // funciona.
  const medicosDoServico = useMemo(() => {
    const base = (!servico || !servico.recursos?.length)
      ? medicos
      : medicos.filter(m => servico.recursos.includes(m.id));
    if (!doConvenio) return base;
    const fora = new Set(semIdade.map(m => m.id));
    return base.filter(m =>
      doConvenio.has(m.id) || (mostrarForaIdade && fora.has(m.id)));
  }, [servico, medicos, doConvenio, semIdade, mostrarForaIdade]);

  /** Quantos deste serviço sumiram só por causa da idade. */
  const escondidosPelaIdade = useMemo(() => {
    if (!doConvenio) return [];
    const base = (!servico || !servico.recursos?.length)
      ? medicos
      : medicos.filter(m => servico.recursos.includes(m.id));
    const fora = new Set(semIdade.map(m => m.id));
    return base.filter(m => fora.has(m.id));
  }, [servico, medicos, doConvenio, semIdade]);

  // Trocar de serviço OU DE CONVÊNIO pode deixar um médico
  // escolhido que não atende mais.
  //
  // ⭐ Limpar calado seria o defeito: a pessoa escolheu o Dr.
  //    Rafael, trocou o convênio, e o campo esvaziou sozinho sem
  //    dizer por quê — ela escolheria de novo e tentaria de novo.
  //    Então limpa E conta.
  const [saiuDaLista, setSaiuDaLista] = useState('');

  /* ⭐⭐⭐ 20/10, noite: O CONVÊNIO COBRE ESTE EXAME?
     A regra mora no banco (`servico_aceita_convenio`) e a trava
     também. Aqui a tela só PERGUNTA, para dizer o motivo ANTES
     do horário — e não deixar a recepção chegar ao fim e
     receber a recusa no "Confirmar". */
  const [naoCobre, setNaoCobre] = useState<{ id: string; nome: string }[]>([]);
  const chaveDaCobertura = atend === 'exame' ? servicosDoPedido.join(',') + '|' + convenioId : '';
  useEffect(() => {
    if (atend !== 'exame' || !convenioId || !servicosDoPedido.length) {
      setNaoCobre([]); return;
    }
    let valido = true;
    examesQueOConvenioNaoCobre(servicosDoPedido, convenioId)
      .then(l => { if (valido) setNaoCobre(l); })
      .catch(() => { if (valido) setNaoCobre([]); });  // a trava do banco segue valendo
    return () => { valido = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaCobertura]);

  /** A lista do campo, no lado do exame. */
  const fazemOPedido: QuemFaz[] = atend === 'exame' ? (quemFaz ?? []) : [];

  /** Quantos aparecem, nos dois caminhos — só para contar. */
  const quantosAparecem = atend === 'exame'
    ? fazemOPedido.length : medicosDoServico.length;

  /* ⭐ UM SÓ: a tela escolhe e nem mostra o campo. */
  const soUm: QuemFaz | null =
    atend === 'exame' && !buscandoQuem && fazemOPedido.length === 1
      ? fazemOPedido[0] : null;

  /* ════════════════════════════════════════════════════════
   *  ⚠️⚠️ ESTA GUARDA TEM QUE OLHAR A LISTA QUE ESTÁ NA TELA
   *
   *  ⚠️ DEFEITO EM PRODUÇÃO, 09/10/2026. O Tom:
   *
   *    *"quando seleciono exames (...) ao preencher o convênio a
   *     tela fica tremendo como se fosse um bug, não dá nem para
   *     selecionar o médico. fica tudo pulando..."*
   *
   *  Era um PING-PONG entre dois efeitos, e levava a tela a
   *  64 mil mutações de DOM em três segundos — medido na prévia,
   *  com o Holter:
   *
   *    1. o exame tem um recurso só, então o efeito do `soUm`
   *       escolhe sozinho:        setMedicoId('aparelho-holter')
   *    2. ESTA guarda conferia contra `medicosDoServico`, que é
   *       a lista de CONSULTA — e um aparelho nunca esteve lá.
   *       Então: setMedicoId('')
   *    3. o `soUm` põe de volta. 1, 2, 3, 1, 2, 3…
   *
   *  ------------------------------------------------------------
   *  POR QUE SÓ DEPOIS DO CONVÊNIO
   *
   *  Antes do convênio, `doConvenio` é nulo e `medicosDoServico`
   *  devolve TODOS os médicos — e um médico de exame que também
   *  atende consulta está entre eles, então a guarda deixava
   *  passar e nada tremia.
   *
   *  Depois do convênio, `doConvenio` vem de
   *  `medicos_que_atendem(tipo: 'consulta')` — **só quem atende
   *  consulta**. O profissional de exame some da lista, e o
   *  ping-pong começa. Por isso o Tom viu o tremor exatamente ao
   *  preencher o convênio.
   *
   *  ------------------------------------------------------------
   *  ⭐ E POR QUE A PROVA NÃO PEGOU
   *
   *  Porque ela marcava Abdômen + Doppler, e quem sobra ali é a
   *  Dra. Ana — que atende consulta, logo está em `doConvenio`,
   *  logo a guarda não disparava. O caminho do APARELHO e o do
   *  médico que SÓ faz exame nunca foram clicados com convênio.
   *
   *  Agora a prova mede mutações de DOM e exige que a tela PARE.
   * ════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!medicoId || filtrandoConv || buscandoQuem) return;

    // ⭐ A lista que o campo está mostrando AGORA.
    const naTela = atend === 'exame' ? fazemOPedido : medicosDoServico;

    // Ainda não perguntamos quem faz: não dá para julgar.
    if (atend === 'exame' && quemFaz === null) return;

    if (naTela.some(m => m.id === medicoId)) return;

    const quem = medicos.find(m => m.id === medicoId)?.nome
              ?? quemFaz?.find(m => m.id === medicoId)?.nome
              ?? (atend === 'exame' ? 'Quem estava escolhido' : 'O médico escolhido');
    setMedicoId('');
    setSaiuDaLista(
      atend === 'exame'
        ? (convenio
            ? `${quem} não faz este pedido para ${convenio.nome}. Escolha outro.`
            : `${quem} não faz todos os exames escolhidos. Escolha outro.`)
        : (doConvenio && convenio
            ? `${quem} não atende ${convenio.nome}. Escolha outro médico.`
            : `${quem} não atende este serviço. Escolha outro.`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicosDoServico, fazemOPedido, quemFaz, atend, medicoId,
      filtrandoConv, buscandoQuem, doConvenio, convenio, medicos]);

  // O convênio é obrigatório QUANDO HÁ convênio cadastrado.
  //
  // Sem esta condição, um hospital que ainda não cadastrou
  // nenhum convênio ficaria com o campo de médico travado para
  // sempre — a tela exigindo uma escolha que não existe.
  // ⭐ 21/10: clínica sem convênio nunca exige (e nem mostra) o campo.
  const exigeConvenio = atendeConvenios && convenios.length > 0;

  /* ⭐ O QUE TEM QUE ESTAR ESCOLHIDO PARA SEGUIR.
   *
   *  No exame o "serviço" é o pedido — um exame sem subtipos, ou
   *  pelo menos um subtipo marcado. Pedido vazio não é
   *  agendamento nenhum.
   *
   *  E o exame que passa por ENTREVISTA não segue por aqui: ele
   *  não tem horário até a equipe avaliar. Travar no passo 2, com
   *  a explicação na tela, é melhor que deixar escolher horário
   *  para receber a recusa do banco três cliques depois.
   */
  const precisaEntrevista = atend === 'exame' && !!exame?.requer_entrevista;

  const escolheuOAtendimento = atend === 'consulta'
    ? !!servicoId
    : servicosDoPedido.length > 0 && !precisaEntrevista;

  const podePasso2 = escolheuOAtendimento && !!medicoId
    && (!exigeConvenio || !!convenioId)
    && !naoCobre.length;

  /* ⭐ O RÓTULO MUDA PORQUE A COISA MUDA.
   *
   *  "Médico" em cima de uma lista que contém o aparelho de
   *  Holter é a tela mentindo baixinho — e é essa mentira que,
   *  no relatório de produtividade, conta o Holter como gente. */
  const rotuloDeQuem = atend === 'exame' ? 'Onde · com quem' : 'Médico';

  /** O nome do que vai ser atendido, para os resumos. */
  const nomeDoAtendimento = useMemo(() => {
    if (atend === 'consulta') return servico?.nome ?? '';
    if (!exame) return '';
    if (!listaSub.length) return exame.nome;
    const nomes = listaSub.filter(x => pedido.includes(x.id)).map(x => x.nome);
    return nomes.length ? `${exame.nome} — ${nomes.join(', ')}` : exame.nome;
  }, [atend, servico, exame, listaSub, pedido]);


  /* ⭐ UM SÓ: A TELA ESCOLHE E NÃO PERGUNTA.
   *
   *  Decisão do Tom, 09/10/2026. Holter, Mapa e Espirometria têm
   *  um aparelho só — perguntar "com quem?" quando não há escolha
   *  é um clique que não decide nada.
   *
   *  Onde há vários (Ultrassom, Endoscopia) o campo aparece
   *  normalmente.
   */
  useEffect(() => {
    if (soUm && medicoId !== soUm.id) setMedicoId(soUm.id);
  }, [soUm, medicoId]);

  /* ========================================================
   *  PASSO 3 — o horário
   * ======================================================== */
  const [minima, setMinima] = useState<DataMinima | null>(null);
  /* ⭐ 19/10: os dias que a janela dos 30 dias apaga. Chave =
     dia ISO, valor = o motivo em português, que a tela mostra.
     Vazio quando não há paciente escolhido ainda. */
  const [travados, setTravados] = useState<Map<string, string>>(new Map());
  const [grade, setGrade] = useState<Grade | null>(null);
  const [mes, setMes] = useState('');            // aaaa-mm
  const [dia, setDia] = useState('');            // aaaa-mm-dd
  const [horario, setHorario] = useState<number | null>(null);
  const [buscandoGrade, setBuscandoGrade] = useState(false);

  // Ao entrar no passo 3: pergunta a partir de quando a agenda
  // abre e já posiciona o mês ali. DUAS idas ao banco, não uma
  // por dia.
  useEffect(() => {
    if (passo !== 3 || !medicoId) return;
    let valido = true;
    setBuscandoGrade(true);
    setHorario(null);

    primeiraDataPossivel(medicoId, paciente?.id ?? null)
      .then(async m => {
        if (!valido) return;
        setMinima(m);
        const inicio = m?.data_minima ?? hojeNoFuso('America/Sao_Paulo');
        const mesAlvo = inicio.slice(0, 7);
        setMes(mesAlvo);
        const g = await gradeDoPeriodo(medicoId, inicio, somarDias(inicio, 60));
        if (!valido) return;
        setGrade(g);
        /* ⭐ Mesma janela da grade, uma ida só. Se falhar, a tela
           segue sem os dias travados — o banco ainda recusa na
           hora de gravar, então o pior caso é um "não" tardio,
           nunca um agendamento errado gravado. */
        try {
          const t = await diasTravadosDoRetorno(
            medicoId, paciente?.id ?? null, inicio, somarDias(inicio, 60));
          if (valido) setTravados(t);
        } catch { if (valido) setTravados(new Map()); }
        setBuscandoGrade(false);
        if (g?.erro) avisar(g.erro, false);
      })
      .catch(e => { if (valido) { avisar(e.message ?? String(e), false); setBuscandoGrade(false); } });

    return () => { valido = false; };
  }, [passo, medicoId, paciente?.id, avisar]);

  const porDia = useMemo(() => grade ? vagasPorDia(grade) : new Map<string, number>(),
                         [grade]);
  /* ════════════════════════════════════════════════════════════
   *  ⭐⭐⭐ OS HORÁRIOS SABENDO O TAMANHO DO PEDIDO (09/10/2026)
   *
   *  O Tom perguntou se os horários "ficavam fechados" com vários
   *  subtipos. A medição respondeu o contrário, e pior: a tela
   *  oferecia 11:40 num aparelho que trabalha até as 12:00, e o
   *  pedido de três exames ia até 12:40.
   *
   *  A causa não foi um `if` esquecido. Foi a tela respondendo
   *  uma pergunta DIFERENTE da que estava sendo feita: ela sabe
   *  dizer "cabe UM atendimento aqui?" e foi usada para "cabe o
   *  PEDIDO aqui?".
   *
   *  As durações vão na ORDEM do pedido, porque é nessa ordem que
   *  o laço do `marcar_exame` anda. Uma soma só não bastaria: com
   *  uma consulta ocupando o meio do caminho, o que decide é onde
   *  CADA exame cai.
   * ════════════════════════════════════════════════════════════ */
  const duracoesDoPedido = useMemo(() => {
    if (atend !== 'exame' || servicosDoPedido.length < 2) return null;
    const doMedico = grade?.duracao_min ?? 0;
    return servicosDoPedido.map(id =>
      listaSub.find(x => x.id === id)?.duracao_efetiva
      ?? exame?.duracao_efetiva
      ?? doMedico);
  }, [atend, servicosDoPedido, listaSub, exame, grade?.duracao_min]);

  const vagas = useMemo(() => {
    if (!grade || !dia) return [];
    // Pedido de um exame só, ou consulta: a pergunta antiga
    // continua certa, e a lista é a mesma de sempre.
    if (!duracoesDoPedido) return vagasManuaisDoDia(grade, dia);
    return vagasDoPedidoNoDia(grade, dia, duracoesDoPedido);
  }, [grade, dia, duracoesDoPedido]);

  /** Quantos horários do dia não comportam o pedido inteiro. */
  const vagasCurtas = useMemo(
    () => vagas.filter(v => {
      if (!('cabem' in v)) return false;
      const p = v as VagaDoPedido;
      return p.cabem < p.pedidos;
    }).length,
    [vagas]);

  /** As casinhas do mês, com domingo na primeira coluna. */
  /**
   * ⭐ A JANELA DE IDADE DO MÉDICO ESCOLHIDO, PARA ESTE PACIENTE
   *
   * Duas datas que vieram do banco. A tela COMPARA datas — não
   * refaz conta de idade. Aniversário, 29 de fevereiro e "anos
   * completos" são uma conta só, e ela mora em
   * `public.idade_na_data`.
   */
  const janela = medicoId ? janelas.get(medicoId) ?? null : null;

  const casinhas = useMemo(() => {
    if (!mes) return [];
    const [ano, m] = mes.split('-').map(Number);
    const primeiro = new Date(ano, m - 1, 1);
    const ultimo = new Date(ano, m, 0).getDate();
    const fora: ({ iso: string; dia: number; vagas: number;
                  foraIdade: boolean; travado: string | null } | null)[] = [];
    for (let i = 0; i < primeiro.getDay(); i++) fora.push(null);
    for (let d = 1; d <= ultimo; d++) {
      const iso = comoISO(new Date(ano, m - 1, d));
      // Comparação de texto 'AAAA-MM-DD' é comparação de data:
      // o formato é ordenável por desenho, e não envolve fuso.
      // ⭐ UMA CHAVE SÓ, DOIS EFEITOS.
      //
      // `mostrarForaIdade` é o mesmo interruptor que traz os
      // médicos escondidos de volta à lista do passo 2. Ligado,
      // ele também destrava os dias aqui.
      //
      // Sem isso o escape não existiria de verdade: a recepção
      // traria o pediatra de volta, escolheria, e encontraria o
      // mês inteiro cinza — um botão que promete e não entrega.
      // A confirmação continua obrigatória na hora de gravar.
      const foraIdade = !mostrarForaIdade && !!janela && (
        (!!janela.atende_de && iso < janela.atende_de) ||
        (!!janela.atende_ate && iso > janela.atende_ate));
      fora.push({ iso, dia: d, vagas: porDia.get(iso) ?? 0, foraIdade,
                  travado: travados.get(iso) ?? null });
    }
    return fora;
  }, [mes, porDia, janela, mostrarForaIdade, travados]);

  /** Algum dia deste mês está cinza por causa da idade? */
  const temDiaForaIdade = useMemo(
    () => casinhas.some(c => c?.foraIdade), [casinhas]);

  /** A frase que explica o cinza, quando há cinza por idade. */
  const avisoJanela = useMemo(() => {
    if (!janela || !paciente) return null;
    if (!janela.atende_de && !janela.atende_ate) return null;
    const br = (d: string) => d.split('-').reverse().join('/');
    const nome = paciente.nome.split(' ')[0];
    if (janela.atende_de && janela.atende_ate) {
      return `${escolhido?.nome} atende ${nome} de ${br(janela.atende_de)} ` +
             `a ${br(janela.atende_ate)}. Fora disso o dia fica cinza.`;
    }
    if (janela.atende_de) {
      return `${escolhido?.nome} atende ${nome} a partir de ` +
             `${br(janela.atende_de)}, quando ele(a) entra na faixa etária.`;
    }
    return `${escolhido?.nome} atende ${nome} até ${br(janela.atende_ate!)}, ` +
           `quando ele(a) passa da faixa etária.`;
  }, [janela, paciente, escolhido]);

  function andarMes(passos: number) {
    const [ano, m] = mes.split('-').map(Number);
    const d = new Date(ano, m - 1 + passos, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const podePasso3 = !!dia && horario !== null;

  /* ========================================================
   *  ⭐ O LIMITE DO CONVÊNIO E A FAIXA ETÁRIA, ANTES DE GRAVAR
   *
   *  ⚠️ Nenhuma das duas é a trava. A trava é um gatilho no
   *     banco, e ele roda de qualquer jeito. Estas duas chamam a
   *     MESMA função que o gatilho chama, e existem só para a
   *     recepção ver o número e o aviso ANTES de clicar — em vez
   *     de levar um não depois de montar a consulta inteira.
   * ======================================================== */
  const [limite, setLimite] = useState<LimiteDoConvenio | null>(null);
  const [faixa, setFaixa] = useState<FaixaEtaria | null>(null);

  useEffect(() => {
    if (!medicoId || !dia) { setLimite(null); setFaixa(null); return; }
    let valido = true;

    // As duas de uma vez: são independentes.
    //
    // ⚠️ A faixa etária só é conferível quando o paciente JÁ
    //    EXISTE — ela precisa da data de nascimento dele, e o
    //    paciente novo só nasce no momento de gravar. Nesse caso
    //    quem avisa é a própria `marcar_consulta`, com a recusa
    //    classificada em `motivo`. Dois caminhos, uma regra só.
    Promise.all([
      limiteDoConvenioNoDia({ recurso: medicoId, convenio: convenioId || null, dia }),
      paciente?.id
        ? faixaEtariaNoDia({ recurso: medicoId, paciente: paciente.id, dia })
        : Promise.resolve(null)
    ]).then(([l, fx]) => {
      if (!valido) return;
      setLimite(l); setFaixa(fx);
    }).catch(() => {
      // Falhou a conferência prévia: não inventa resposta. O
      // gatilho decide na hora de gravar.
      if (valido) { setLimite(null); setFaixa(null); }
    });

    return () => { valido = false; };
  }, [medicoId, convenioId, dia, paciente?.id]);

  /** O aviso das duas regras, pronto para a tela. */
  const avisoRegras = useMemo(() => {
    const linhas: { tipo: 'limite' | 'idade'; cheio: boolean; texto: string }[] = [];
    if (limite?.mensagem) {
      linhas.push({ tipo: 'limite', cheio: !limite.cabe, texto: limite.mensagem });
    }
    if (faixa?.mensagem) {
      linhas.push({ tipo: 'idade', cheio: !faixa.cabe, texto: faixa.mensagem });
    }
    return linhas;
  }, [limite, faixa]);

  /* ========================================================
   *  PASSO 4 — gravar
   * ======================================================== */
  const [gravando, setGravando] = useState(false);
  const [pronto, setPronto] = useState<
    { quando: string; paciente: string; quantos: number } | null>(null);

  /* ⭐ As duas confirmações, separadas.
   *
   * Um `confirmar` só faria a recepção, ao autorizar o furo do
   * limite, autorizar de bônus uma criança de 8 anos num
   * geriatra — sem nunca ter visto o aviso de idade. São duas
   * decisões, por motivos diferentes, e o banco também as separa.
   */
  const [confLimite, setConfLimite] = useState(false);
  const [confIdade, setConfIdade] = useState(false);
  const [recusa, setRecusa] = useState<{ motivo: 'LIMITE' | 'IDADE'; texto: string } | null>(null);

  // Mexer no horário, no dia ou no médico invalida a
  // confirmação: ela era sobre OUTRA consulta.
  useEffect(() => {
    setConfLimite(false); setConfIdade(false); setRecusa(null);
  }, [medicoId, convenioId, dia, horario, paciente?.id]);

  async function gravar() {
    if (!podePasso3 || gravando || !grade || !escolhido) return;
    if (atend === 'consulta' && !servico) return;
    setGravando(true);
    try {
      const comum = {
        clienteId,
        recursoId: medicoId,
        inicio: instanteNoFuso(dia, horario!, grade.fuso),
        pacienteId: paciente?.id ?? null,
        nome: paciente ? undefined : nNome.trim(),
        cpf: paciente ? undefined : soDigitos(nCpf),
        telefone: paciente ? undefined : nTel,
        email: paciente ? undefined : nEmail,
        nascimento: paciente ? undefined : (nNasc || null),
        convenioId: convenioId || null,
        observacoes: obs,
        confirmarLimite: confLimite,
        confirmarIdade: confIdade
      };

      /* ⭐⭐ DUAS PORTAS, E A DO EXAME MARCA O PEDIDO INTEIRO.
       *
       *  O `marcar_exame` grava os subtipos em sequência, com o
       *  mesmo profissional e um `pedido_id` só — e se um
       *  horário for tomado no meio, DESFAZ os que já tinham
       *  entrado. Meio pedido agendado é pior que pedido nenhum:
       *  o paciente vem, faz dois exames e descobre no balcão
       *  que o terceiro não existe.
       *
       *  Ele não tem um `insert` sequer: chama o mesmo
       *  `marcar_consulta` N vezes, com as mesmas travas. */
      const r = atend === 'exame'
        ? await marcarExame({ ...comum, servicos: servicosDoPedido })
        : await marcarConsulta({ ...comum, servicoId });

      if (!r.ok) {
        // ⭐ O `motivo` vem classificado pelo BANCO. A tela não
        //    lê a frase para decidir o que oferecer — se alguém
        //    melhorar o texto da recusa amanhã, o botão de
        //    confirmar continua aparecendo.
        if (r.motivo === 'LIMITE' || r.motivo === 'IDADE') {
          setRecusa({ motivo: r.motivo, texto: r.mensagem });
          if (r.motivo === 'LIMITE') setConfLimite(true);
          else setConfIdade(true);
          setGravando(false);
          return;
        }
        avisar(r.mensagem, false);
        // Horário tomado no meio do caminho: volta para a lista
        // e recarrega, em vez de deixar a pessoa clicar de novo
        // no mesmo horário que não existe mais.
        if (/ocupado/i.test(r.mensagem)) {
          setHorario(null);
          setPasso(3);
          const g = await gradeDoPeriodo(medicoId, dia, somarDias(dia, 60));
          setGrade(g);
        }
        setGravando(false);
        return;
      }

      setPronto({
        quando: `${dia.split('-').reverse().join('/')} às ${comoHora(horario!)}`,
        paciente: paciente?.nome ?? nNome.trim(),
        // ⭐ Quantos entraram. Para um pedido de três, "marcado"
        //    no singular esconderia os outros dois.
        quantos: ('marcados' in r ? r.marcados : 1)
      });
      avisar(r.mensagem, true);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setGravando(false);
    }
  }

  function recomeçar() {
    setPronto(null); setPasso(1);
    // A lista de achados não é zerada aqui porque não mora mais
    // aqui: `BuscaPaciente` refaz a busca sozinho quando o termo
    // vira vazio.
    setBusca(''); setPaciente(null); setNovo(false);
    setNNome(''); setNCpf(''); setNTel(''); setNEmail(''); setNNasc('');
    setEspId(''); setSubId(''); setExameId(''); setPedido([]);
    setMedicoId(''); setConvenioId(''); setObs('');
    setDia(''); setHorario(null); setGrade(null); setMinima(null);
    setDoConvenio(null); setSaiuDaLista('');
    setLimite(null); setFaixa(null);
    setConfLimite(false); setConfIdade(false); setRecusa(null);
  }

  /* ======================================================== */

  if (carregando) {
    return (
      <div className="loading-placeholder">
        <div className="spinner" /><p>Carregando médicos e serviços...</p>
      </div>
    );
  }

  if (erro) return <div className="erro-caixa">{erro}</div>;

  if (pronto) {
    return (
      <>
        <div className="page-header"><h2>Novo Agendamento</h2></div>
        <div className="wiz-pronto">
          <div className="wiz-pronto-icone"><i className="fas fa-circle-check" /></div>
          {/* ⭐ "Consulta marcada" num pedido de três exames
              esconderia os outros dois. O número vem do banco. */}
          <h3>
            {pronto.quantos > 1
              ? `${pronto.quantos} exames marcados, em sequência`
              : atend === 'exame' ? 'Exame marcado' : 'Consulta marcada'}
          </h3>
          <p><strong>{pronto.paciente}</strong></p>
          <p className="wiz-pronto-quando">{pronto.quando}</p>
          <p className="wiz-pronto-med">{escolhido?.nome} · {nomeDoAtendimento}</p>

          <div className="wiz-aviso-amarelo" style={{ marginTop: 18, textAlign: 'left' }}>
            <strong>O paciente ainda não foi avisado.</strong> A confirmação
            por WhatsApp vem na próxima etapa. Até lá, ligue ou mande a
            mensagem à mão.
          </div>

          <button className="btn-primary" style={{ marginTop: 20 }} onClick={recomeçar}>
            <i className="fas fa-plus" /> Marcar outra
          </button>
        </div>
        <Aviso recado={recado} aoFechar={fechar} />
      </>
    );
  }

  return (
    <>
      <div className="page-header"><h2>Novo Agendamento</h2></div>

      <Trilha passo={passo} aoVoltar={setPasso} />

      <div className="wiz-caixa">

        {/* ---------------- 1 · PACIENTE ---------------- */}
        {passo === 1 && (
          <>
            <h3 className="wiz-titulo">Quem é o paciente?</h3>

            {!novo && (
              <BuscaPaciente
                clienteId={clienteId}
                termo={busca}
                aoTermo={setBusca}
                escolhido={paciente}
                aoEscolher={setPaciente}
                aoNovo={() => { setNovo(true); setNNome(busca); }}
                aoFalhar={falhouBusca}
              />
            )}

            {novo && (
              <>
                {/* A busca continua à mostra. Quem chegou aqui
                    digitando um nome parecido ainda pode voltar
                    e escolher o cadastro que já existe — é o que
                    evita o segundo cadastro do mesmo paciente. */}
                <div className="wiz-aviso-azul">
                  Cadastrando <strong>paciente novo</strong>.{' '}
                  <button className="wiz-link" onClick={() => setNovo(false)}>
                    procurar de novo
                  </button>
                </div>

                <div className="form-group">
                  <label>Nome completo *</label>
                  <input type="text" autoFocus value={nNome} maxLength={120}
                         onChange={e => setNNome(e.target.value)} />
                </div>

                <div className="form-row" style={{ display: 'flex', gap: 14 }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>CPF</label>
                    <input type="text" value={nCpf} maxLength={14}
                           onChange={e => setNCpf(e.target.value)}
                           placeholder="só números" />
                    {!cpfNovoValido && (
                      <small style={{ color: 'var(--danger)' }}>
                        CPF tem 11 dígitos — faltam {11 - soDigitos(nCpf).length}.
                      </small>
                    )}
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Telefone</label>
                    <input type="text" value={nTel} maxLength={20}
                           onChange={e => setNTel(e.target.value)}
                           placeholder="(11) 90000-0000" />
                  </div>
                </div>

                <div className="form-row" style={{ display: 'flex', gap: 14 }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Nascimento</label>
                    <input type="date" value={nNasc} onChange={e => setNNasc(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>E-mail</label>
                    <input type="email" value={nEmail} maxLength={120}
                           onChange={e => setNEmail(e.target.value)} />
                  </div>
                </div>

                <small className="wiz-dica">
                  O cadastro é criado junto com a consulta — se uma falhar,
                  nenhuma das duas acontece.
                </small>
              </>
            )}
          </>
        )}

        {/* ---------------- 2 · ATENDIMENTO ---------------- */}
        {passo === 2 && (
          <>
            <h3 className="wiz-titulo">O que vai ser atendido?</h3>

            {/* ---------- ⭐⭐ CONSULTA OU EXAME ---------- */}
            <div className="form-group">
              <label>Serviço *</label>
              <select value={atend} data-campo="atendimento"
                      onChange={e => setAtend(e.target.value as 'consulta' | 'exame')}>
                <option value="consulta">Consulta</option>
                <option value="exame">Exame</option>
              </select>
            </div>

            {/* ---------- o lado da CONSULTA ---------- */}
            {atend === 'consulta' && (
              <>
                <div className="form-group">
                  <label>Especialidade *</label>
                  <select value={espId} data-campo="especialidade"
                          onChange={e => setEspId(e.target.value)}>
                    <option value="">Escolha…</option>
                    {especialidadesDeCima.map(e => (
                      <option key={e.id} value={e.id}>{e.nome}</option>
                    ))}
                  </select>
                </div>

                {/* ⭐ A subárea só aparece quando existe. Campo
                    vazio em tela é campo que alguém tenta
                    preencher. */}
                {!!subareas.length && (
                  <div className="form-group" data-bloco="subarea">
                    <label>Subespecialidade</label>
                    <select value={subId} data-campo="subarea"
                            onChange={e => setSubId(e.target.value)}>
                      <option value="">
                        Qualquer uma ({especialidades.find(x => x.id === espId)?.nome})
                      </option>
                      {subareas.map(e => (
                        <option key={e.id} value={e.id}>{e.nome}</option>
                      ))}
                    </select>
                    {/* ⭐ Vazio é TODOS, e vale dizer: quem trata
                        de coluna é ortopedista, e tem que
                        aparecer em "Ortopedia" sem subárea. */}
                    <small className="wiz-dica">
                      Deixar em branco traz <strong>todos</strong>, inclusive quem
                      não tem subárea cadastrada.
                    </small>
                  </div>
                )}

                {!!espId && !servicoId && (
                  <small style={{ color: 'var(--danger)' }} data-aviso="sem-servico">
                    Não há serviço de consulta cadastrado para esta especialidade.
                    Importe a planilha ou cadastre em Configurações → Serviços.
                  </small>
                )}
              </>
            )}

            {/* ---------- o lado do EXAME ---------- */}
            {atend === 'exame' && (
              <>
                <div className="form-group">
                  <label>Tipo *</label>
                  <select value={exameId} data-campo="exame"
                          onChange={e => setExameId(e.target.value)}>
                    <option value="">Escolha…</option>
                    {exames.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                        {e.subtipos > 0 ? ` (${e.subtipos} subtipos)` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* ⭐⭐ O EXAME QUE PASSA POR ENTREVISTA PARA AQUI.
                    Endoscopia e colonoscopia são feitas com
                    sedação, e as dez perguntas são triagem de
                    risco anestésico. Marcar direto poria na
                    agenda um paciente que a equipe talvez não
                    possa sedar — e ele descobriria isso em jejum,
                    no dia, no balcão. */}
                {precisaEntrevista && (
                  <div className="dia-nota amarela" data-aviso="entrevista">
                    <strong>
                      <i className="fas fa-clipboard-question" />{' '}
                      {exame?.nome} passa por entrevista
                    </strong>
                    <p>
                      Este exame não é marcado direto: o paciente responde a
                      entrevista de risco, <strong>a equipe avalia</strong> e
                      agenda em seguida.
                    </p>
                    <p style={{ marginTop: 8 }}>
                      <button className="btn-primary btn-sm"
                              data-acao="abrir-pedido"
                              onClick={() => setPedindo(true)}>
                        <i className="fas fa-clipboard-question" />{' '}
                        Responder entrevista e enviar ao setor
                      </button>
                    </p>
                  </div>
                )}

                {/* ⭐⭐ OS SUBTIPOS DO PEDIDO MÉDICO.
                    Vários de uma vez, porque é assim que o pedido
                    chega: Abdômen Total + Tireoide + Pélvica numa
                    folha só. Eles viram horários em sequência,
                    com o mesmo profissional. */}
                {!precisaEntrevista && !!exame && exame.subtipos > 0 && (
                  <div className="form-group" data-bloco="subtipos">
                    <label>
                      O que o pedido médico pede *
                      {pedido.length > 1 && (
                        <span className="wiz-dica">
                          {' '}— {pedido.length} exames, em sequência
                        </span>
                      )}
                    </label>
                    {carregandoSub ? (
                      <small className="wiz-dica">
                        <i className="fas fa-circle-notch fa-spin" /> carregando…
                      </small>
                    ) : (
                      <div className="imp-achados" data-lista="subtipos">
                        {listaSub.map(x => (
                          <label key={x.id} className="chk-linha"
                                 data-subtipo={x.id}>
                            <input type="checkbox"
                                   checked={pedido.includes(x.id)}
                                   onChange={ev => setPedido(p =>
                                     ev.target.checked
                                       ? [...p, x.id]
                                       : p.filter(i => i !== x.id))} />
                            <span>{x.nome}</span>
                            {x.codigo_tuss && (
                              <em className="wiz-dica"> TUSS {x.codigo_tuss}</em>
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                    <small className="wiz-dica">
                      Marque <strong>todos</strong> os do pedido. Eles entram em
                      horários seguidos, com a mesma pessoa — o paciente deita,
                      faz todos, levanta.
                    </small>
                  </div>
                )}

                {/* ⭐ O exame que ninguém faz: dizer POR QUÊ.
                    É o caso real da Ultrassonografia do St James,
                    com os três ultrassonografistas desativados na
                    planilha. */}
                {!!exame && exame.quem_faz === 0 && (
                  <small style={{ color: 'var(--danger)' }} data-aviso="sem-ninguem">
                    Nenhum profissional ou aparelho <strong>ativo</strong> faz{' '}
                    {exame.nome} hoje. Ative alguém no cadastro de médicos, ou
                    ligue-o a este exame, para ele voltar a aparecer aqui.
                  </small>
                )}
              </>
            )}

            {/* ---------- ⭐ o convênio, ANTES do médico ---------- */}
            {atendeConvenios && (
            <div className="form-group">
              <label>Convênio {exigeConvenio ? '*' : ''}</label>
              <select value={convenioId} data-campo="convenio"
                      onChange={e => { setConvenioId(e.target.value);
                                       setSaiuDaLista(''); }}>
                <option value="">
                  {exigeConvenio ? 'Escolha…' : 'Particular'}
                </option>
                {convenios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <small className="wiz-dica">
                Ele vem antes porque <strong>decide quais médicos aparecem</strong>.
                {' '}Particular não filtra ninguém.
              </small>
            </div>
            )}

            {/* ⭐ UM SÓ: a tela escolhe e nem mostra o campo.
                Holter, Mapa e Espirometria têm um aparelho só —
                perguntar "com quem?" quando não há escolha é um
                clique que não decide nada. Decisão do Tom,
                09/10/2026. */}
            {soUm && (
              <div className="form-group" data-bloco="unico">
                <label>{rotuloDeQuem}</label>
                <p className="wiz-dica" data-unico="1">
                  <strong>{soUm.nome}</strong>
                  {soUm.tipo !== 'profissional' && ' (aparelho)'}
                  {' '}— é o único que faz. Já está escolhido.
                </p>
              </div>
            )}

            <div className="form-group"
                 style={soUm ? { display: 'none' } : undefined}>
              <label>{rotuloDeQuem} *</label>
              <select value={medicoId} data-campo="medico"
                      onChange={e => { setMedicoId(e.target.value);
                                       setSaiuDaLista(''); }}
                      disabled={!escolheuOAtendimento
                                || (exigeConvenio && !convenioId)
                                || filtrandoConv || buscandoQuem}>
                <option value="">
                  {!escolheuOAtendimento
                    ? (atend === 'exame'
                        ? 'escolha o exame primeiro'
                        : 'escolha a especialidade primeiro')
                    : exigeConvenio && !convenioId
                      ? 'escolha o convênio primeiro'
                      : (filtrandoConv || buscandoQuem)
                        ? 'vendo quem atende…'
                        : 'Escolha…'}
                </option>
                {atend === 'exame'
                  ? fazemOPedido.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.nome}
                        {m.tipo !== 'profissional' ? ' (aparelho)' : ''}
                        {/* ⭐ "geral" quer dizer que ele faz o exame
                            INTEIRO, e não só aquele subtipo — a
                            mesma marca do ortopedista geral. */}
                        {m.geral ? ' — faz o exame inteiro' : ''}
                      </option>
                    ))
                  : medicosDoServico.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.nome}{m.especialidades ? ` — ${m.especialidades}` : ''}
                      </option>
                    ))}
              </select>

              {/* ⭐⭐ NINGUÉM FAZ OS DOIS: a recusa explica e
                  oferece a saída, em vez de uma lista vazia. */}
              {atend === 'exame' && !buscandoQuem && !!quemFaz
                && quemFaz.length === 0 && servicosDoPedido.length > 1 && (
                <small style={{ color: 'var(--danger)' }} data-aviso="ninguem-os-dois">
                  Ninguém faz <strong>todos</strong> os subtipos marcados. Marque
                  menos de uma vez, ou desmarque e faça um pedido por vez — eles
                  precisam ser do mesmo profissional para ficarem em sequência.
                </small>
              )}

              {/* ⭐⭐⭐ O convênio que não cobre é NOMEADO, e o exame também. */}
              {!!naoCobre.length && (
                <div className="dia-nota amarela" data-aviso="convenio-nao-cobre">
                  <strong>
                    {convenio?.nome ?? 'Este convênio'} não cobre{' '}
                    {naoCobre.map(x => x.nome).join(', ')}.
                  </strong>
                  <p>Escolha um convênio que cubra este exame. Os convênios
                     de cada exame ficam na Gestão de Exames.</p>
                </div>
              )}

              {/* ⭐ O médico que saiu da lista é NOMEADO. */}
              {saiuDaLista && (
                <small style={{ color: 'var(--danger)' }} data-aviso="saiu-da-lista">
                  {saiuDaLista}
                </small>
              )}

              {atend === 'consulta' && servicoId && !filtrandoConv
                && !medicosDoServico.length && (
                <small style={{ color: 'var(--danger)' }} data-aviso="ninguem">
                  {convenio
                    ? `Nenhum médico deste serviço atende ${convenio.nome}. ` +
                      'Confira os convênios no cadastro do médico — lá, nenhum ' +
                      'marcado quer dizer "atende todos".'
                    : 'Nenhum médico cadastrado para este serviço.'}
                </small>
              )}

              {/* A contagem existe para a recepção perceber que a
                  lista encurtou, e por quê. */}
              {atend === 'consulta' && !!convenio && !!doConvenio
                && !!medicosDoServico.length && (
                <small className="wiz-dica" data-contagem="medicos">
                  <strong>{medicosDoServico.length}</strong> médico(s) atendem{' '}
                  {convenio.nome} neste serviço.
                </small>
              )}

              {/* A mesma contagem, do lado do exame. Ela existe
                  para a recepção perceber que a lista encurtou, e
                  por quê. */}
              {atend === 'exame' && !buscandoQuem && !!quemFaz
                && quantosAparecem > 1 && (
                <small className="wiz-dica" data-contagem="quem-faz">
                  <strong>{quantosAparecem}</strong> fazem{' '}
                  {servicosDoPedido.length > 1
                    ? `os ${servicosDoPedido.length} exames do pedido`
                    : 'este exame'}
                  {convenio ? ` e atendem ${convenio.nome}` : ''}.
                </small>
              )}

              {/* ⭐ Quem sumiu pela IDADE é contado, e tem volta.
                  Sumir calado transformaria a exceção legítima —
                  o pediatra que recebe o irmão de 19 — em
                  telefonema. */}
              {!!escondidosPelaIdade.length && !mostrarForaIdade && (
                <small className="wiz-dica" data-escondidos="idade">
                  <i className="fas fa-child" />{' '}
                  <strong>{escondidosPelaIdade.length}</strong> médico(s) não
                  aparecem porque não atendem a idade de{' '}
                  {(paciente?.nome ?? '').split(' ')[0]} em nenhum dia dos
                  próximos {DIAS_A_FRENTE} dias.{' '}
                  <button type="button" className="link-botao"
                          data-acao="mostrar-fora-idade"
                          onClick={() => setMostrarForaIdade(true)}>
                    mostrar mesmo assim
                  </button>
                </small>
              )}

              {mostrarForaIdade && !!escondidosPelaIdade.length && (
                <small className="wiz-dica" data-escondidos="mostrando">
                  Mostrando também quem não atende esta idade. O banco vai
                  pedir confirmação ao marcar.{' '}
                  <button type="button" className="link-botao"
                          data-acao="esconder-fora-idade"
                          onClick={() => setMostrarForaIdade(false)}>
                    esconder de novo
                  </button>
                </small>
              )}
            </div>

            <div className="form-group">
              <label>Observações</label>
              <input type="text" value={obs} maxLength={300}
                     onChange={e => setObs(e.target.value)}
                     placeholder="opcional — fica no card da consulta" />
            </div>

            {escolhido && (
              <div className="wiz-aviso-azul">
                Atendimentos de <strong>{escolhido.duracao_min} minutos</strong>.
                Os horários do passo seguinte seguem essa duração.
              </div>
            )}
          </>
        )}

        {/* ---------------- 3 · HORÁRIO ---------------- */}
        {passo === 3 && (
          <>
            <h3 className="wiz-titulo">Quando?</h3>

            {/* A regra dos 30 dias, explicada ANTES de a pessoa
                procurar um dia que não existe. */}
            {minima?.ultima_em && (
              <div className="wiz-aviso-azul">
                <i className="fas fa-circle-info" />{' '}
                <strong>{paciente?.nome}</strong> consultou com {escolhido?.nome} em{' '}
                {new Date(minima.ultima_em).toLocaleDateString('pt-BR')}. Pela regra
                dos {minima.dias_retorno} dias, a agenda abre em{' '}
                <strong>{minima.data_minima.split('-').reverse().join('/')}</strong> —
                o calendário já começa ali.
              </div>
            )}

            {buscandoGrade && (
              <div className="loading-placeholder">
                <div className="spinner" /><p>Montando a agenda…</p>
              </div>
            )}

            {!buscandoGrade && grade && (
              <div className="wiz-horario">
                <div className="wiz-calendario">
                  <div className="wiz-cal-topo">
                    <button onClick={() => andarMes(-1)} aria-label="Mês anterior">
                      <i className="fas fa-chevron-left" />
                    </button>
                    <span>
                      {MESES[Number(mes.split('-')[1]) - 1]} de {mes.split('-')[0]}
                    </span>
                    <button onClick={() => andarMes(1)} aria-label="Próximo mês">
                      <i className="fas fa-chevron-right" />
                    </button>
                  </div>

                  <div className="wiz-cal-grade">
                    {DIAS_CURTOS.map((d, i) => (
                      <div key={i} className="wiz-cal-cab">{d}</div>
                    ))}
                    {casinhas.map((c, i) => c === null
                      ? <div key={`v${i}`} />
                      : (
                        <button key={c.iso}
                                className={'wiz-cal-dia' +
                                  (c.vagas && !c.foraIdade && !c.travado ? ' tem' : ' sem') +
                                  (c.foraIdade ? ' fora-idade' : '') +
                                  (c.travado ? ' travado-retorno' : '') +
                                  (dia === c.iso ? ' escolhido' : '')}
                                data-dia={c.iso}
                                data-fora-idade={c.foraIdade ? 'sim' : 'nao'}
                                data-travado={c.travado ? 'sim' : 'nao'}
                                disabled={!c.vagas || c.foraIdade || !!c.travado}
                                title={c.travado ?? (c.foraIdade
                                  ? 'Fora da faixa etária do médico neste dia'
                                  : undefined)}
                                onClick={() => { setDia(c.iso); setHorario(null); }}>
                          <span>{c.dia}</span>
                          {!!c.vagas && !c.foraIdade && !c.travado && <em>{c.vagas}</em>}
                        </button>
                      ))}
                  </div>
                  <p className="wiz-dica">
                    O número embaixo do dia é quantos horários ainda há.
                  </p>

                  {/* ⭐⭐⭐ O CINZA DOS 30 DIAS É EXPLICADO, COM DATA.
                      Mesma régua do cinza por idade: dia cinza sem
                      motivo é a recepção ligando para perguntar por
                      que não dá para marcar. */}
                  {(() => {
                    const primeiro = casinhas.find(c => c?.travado);
                    if (!primeiro) return null;
                    return (
                      <p className="wiz-aviso-idade" data-aviso="travado-retorno">
                        <i className="fas fa-circle-info" />{' '}
                        Alguns dias estão cinza pela regra dos 30 dias:{' '}
                        {primeiro.travado}. Entre duas consultas do mesmo
                        paciente com o mesmo profissional precisa haver esse
                        intervalo — antes disso o convênio conta como a mesma
                        consulta.
                      </p>
                    );
                  })()}

                  {/* ⭐ O cinza por idade é EXPLICADO, com data.
                      Dia cinza sem motivo é a recepção ligando
                      para perguntar por que não dá para marcar. */}
                  {avisoJanela && !mostrarForaIdade && (
                    <p className="wiz-dica" data-aviso="janela-idade">
                      <i className="fas fa-child" /> {avisoJanela}
                      {temDiaForaIdade && (
                        <>
                          {' '}
                          <button type="button" className="link-botao"
                                  data-acao="destravar-fora-idade"
                                  onClick={() => setMostrarForaIdade(true)}>
                            destravar esses dias
                          </button>
                        </>
                      )}
                    </p>
                  )}

                  {mostrarForaIdade && janela
                   && (janela.atende_de || janela.atende_ate) && (
                    <p className="wiz-dica" data-aviso="janela-destravada">
                      <i className="fas fa-triangle-exclamation" /> Os dias fora
                      da faixa etária estão destravados. Ao gravar, o sistema
                      pede confirmação e registra.
                    </p>
                  )}

                  {/* ⭐ O contador do convênio, no dia escolhido.
                      Mostrar ANTES de escolher a hora é o que
                      evita a recepção montar a consulta inteira
                      para levar um não no fim. */}
                  {!!dia && avisoRegras.map(l => (
                    <p key={l.tipo}
                       className={'wiz-limite' + (l.cheio ? ' cheio' : '')}
                       data-regra={l.tipo}>
                      <i className={l.cheio
                          ? 'fas fa-triangle-exclamation'
                          : 'fas fa-circle-info'} />
                      {l.texto}
                    </p>
                  ))}
                </div>

                <div className="wiz-horarios">
                  {!dia && <p className="wiz-dica">Escolha um dia ao lado.</p>}
                  {dia && !vagas.length && (
                    <p className="wiz-dica">Nenhum horário livre neste dia.</p>
                  )}
                  {/* ⭐⭐⭐ O HORÁRIO CURTO APARECE APAGADO, COM O MOTIVO.
                      ────────────────────────────────────────────────
                      Escolha do Tom em 09/10/2026, e a certa: sumir
                      com ele deixaria a recepção olhando um dia
                      vazio sem entender por quê, e a saída real —
                      partir o pedido ou abrir encaixe — não ocorre a
                      ninguém que não sabe qual é o problema.

                      ⚠️ O botão fica DESLIGADO, não só cinza. Um
                         cinza clicável seria a tela avisando e
                         deixando errar assim mesmo. */}
                  {dia && vagas.map(v => {
                    const p = 'cabem' in v ? (v as VagaDoPedido) : null;
                    const curto = !!p && p.cabem < p.pedidos;
                    return (
                      <button key={v.ini}
                              data-hora={comoHora(v.ini)}
                              data-curto={curto ? '1' : undefined}
                              disabled={curto}
                              title={curto
                                ? (p!.cabem === 0
                                    ? `Não cabe nem o 1º exame: o pedido precisa de ${p!.precisa} min.`
                                    : `Cabe só ${p!.cabem} de ${p!.pedidos} — o pedido precisa de ${p!.precisa} min seguidos.`)
                                : undefined}
                              className={'wiz-hora'
                                + (horario === v.ini ? ' escolhido' : '')
                                + (curto ? ' curto' : '')}
                              onClick={() => { if (!curto) setHorario(v.ini); }}>
                        {comoHora(v.ini)}
                        {curto && (
                          <small>
                            {p!.cabem === 0 ? 'não cabe' : `cabe ${p!.cabem} de ${p!.pedidos}`}
                          </small>
                        )}
                      </button>
                    );
                  })}

                  {/* A frase que explica o dia inteiro, uma vez só. */}
                  {dia && !!vagasCurtas && (
                    <p className="wiz-dica" data-aviso="pedido-nao-cabe">
                      <i className="fas fa-circle-info" />{' '}
                      <strong>{vagasCurtas}</strong>{' '}
                      {vagasCurtas === 1 ? 'horário está apagado' : 'horários estão apagados'}:
                      o pedido são <strong>{servicosDoPedido.length} exames seguidos</strong>
                      {duracoesDoPedido &&
                        <> ({duracoesDoPedido.reduce((a, b) => a + b, 0)} min no total)</>}
                      {' '}e não cabem até o fim do expediente. Marque menos exames,
                      escolha outro dia, ou abra um encaixe na Agenda do Médico.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ---------------- 4 · CONFIRMAR ---------------- */}
        {passo === 4 && (
          <>
            <h3 className="wiz-titulo">Confere antes de gravar</h3>

            <div className="wiz-resumo">
              <div className="wiz-resumo-linha">
                <span>Paciente</span>
                <strong>
                  {paciente?.nome ?? nNome}
                  {!paciente && <em className="wiz-marca-novo">cadastro novo</em>}
                </strong>
              </div>
              <div className="wiz-resumo-linha">
                <span>CPF</span>
                <strong>{formatarCPF(paciente?.cpf ?? soDigitos(nCpf)) || '—'}</strong>
              </div>
              <div className="wiz-resumo-linha">
                <span>Telefone</span>
                <strong>{formatarTelefone(paciente?.telefone ?? nTel) || '—'}</strong>
              </div>
              <div className="wiz-resumo-linha">
                {/* ⭐ No exame, o "serviço" é o PEDIDO: o exame e os
                    subtipos marcados. Mostrar só "Ultrassonografia"
                    esconderia o que foi marcado de verdade, e é
                    justamente isso que a recepção confere aqui. */}
                <span>{atend === 'exame' ? 'Exame' : 'Serviço'}</span>
                <strong>{nomeDoAtendimento}</strong>
              </div>
              <div className="wiz-resumo-linha">
                <span>{rotuloDeQuem}</span><strong>{escolhido?.nome}</strong>
              </div>
              <div className="wiz-resumo-linha">
                <span>Convênio</span>
                <strong>{convenios.find(c => c.id === convenioId)?.nome ?? 'Particular'}</strong>
              </div>
              <div className="wiz-resumo-linha destaque">
                <span>Quando</span>
                <strong>
                  {dia.split('-').reverse().join('/')} às {comoHora(horario ?? 0)}
                  {' '}<em>({escolhido?.duracao_min} min)</em>
                </strong>
              </div>
              {obs && (
                <div className="wiz-resumo-linha">
                  <span>Observações</span><strong>{obs}</strong>
                </div>
              )}
            </div>

            {servico?.preparo && (
              <div className="wiz-aviso-amarelo">
                <strong>Preparo:</strong> {servico.preparo}
              </div>
            )}

            {/* ⭐ As duas regras aparecem no resumo também, porque
                é aqui que a pessoa confere antes de gravar.

                ⚠️ Menos a que já virou RECUSA logo abaixo: o
                   aviso e a recusa são o MESMO fato, e mostrar os
                   dois fazia a tela repetir a frase inteira duas
                   vezes seguidas. Aviso repetido é aviso que a
                   pessoa aprende a pular. */}
            {avisoRegras.filter(l => l.tipo.toUpperCase() !== recusa?.motivo).map(l => (
              <div key={l.tipo}
                   className={l.cheio ? 'wiz-aviso-amarelo' : 'wiz-aviso-azul'}
                   data-regra-resumo={l.tipo}>
                {l.cheio && <strong><i className="fas fa-triangle-exclamation" /> Espere. </strong>}
                {l.texto}
              </div>
            ))}

            {/* ⭐ A recusa que o banco devolveu, com o botão que
                vira vermelho. O segundo clique é outra coisa, e
                tem que parecer outra coisa. */}
            {recusa && (
              <div className="wiz-aviso-amarelo" data-recusa={recusa.motivo}>
                <strong>
                  <i className="fas fa-triangle-exclamation" />{' '}
                  {recusa.motivo === 'LIMITE'
                    ? 'Limite do convênio cheio'
                    : 'Fora da faixa etária do médico'}
                </strong>
                <p>{recusa.texto}</p>
                <p className="wiz-dica" style={{ margin: 0 }}>
                  {recusa.motivo === 'LIMITE'
                    ? 'Marcar assim fica registrado como furo de limite.'
                    : 'Marcar assim fica registrado como fora da faixa.'}
                </p>
              </div>
            )}

            <div className="wiz-aviso-amarelo">
              <strong>O paciente não é avisado automaticamente.</strong> A
              confirmação por WhatsApp vem na próxima etapa.
            </div>
          </>
        )}

        {/* ---------------- os botões ---------------- */}
        <div className="wiz-rodape">
          <button className="btn-secondary"
                  disabled={passo === 1 || gravando}
                  onClick={() => setPasso((passo - 1) as Passo)}>
            <i className="fas fa-arrow-left" /> Voltar
          </button>

          {passo < 4 && (
            <button className="btn-primary"
                    disabled={(passo === 1 && !podePasso1) ||
                              (passo === 2 && !podePasso2) ||
                              (passo === 3 && !podePasso3)}
                    onClick={() => setPasso((passo + 1) as Passo)}>
              Continuar <i className="fas fa-arrow-right" />
            </button>
          )}

          {passo === 4 && (
            <button className={recusa ? 'btn-danger' : 'btn-primary'}
                    data-acao="gravar-agendamento"
                    disabled={gravando} onClick={gravar}>
              {gravando
                ? <><i className="fas fa-circle-notch fa-spin" /> Gravando…</>
                : recusa
                  ? <><i className="fas fa-triangle-exclamation" /> Marcar mesmo assim</>
                  /* ⭐ "Confirmar agendamento", e não "Marcar consulta".
                     ────────────────────────────────────────────────
                     09/10/2026, o Tom: *"o botão no final é confirmar
                     consulta mesmo quando é um exame agendado"*.

                     Botão que mente sobre o que faz é da mesma
                     família do "marque para restringir": quem lê
                     hesita, e quem hesita chama alguém.

                     ⚠️ A frase é a MESMA nos dois caminhos, de
                        propósito. Um `atend === 'exame' ? … : …`
                        aqui seria um terceiro lugar onde o tipo de
                        atendimento muda a tela — e é de divergência
                        entre esses lugares que este projeto vive
                        apanhando. "Agendamento" cobre os dois. */
                  : <><i className="fas fa-calendar-check" /> Confirmar agendamento</>}
            </button>
          )}
        </div>
      </div>


      {/* ⭐ O pedido de exame com entrevista sai por OUTRA porta.
          O assistente existe para escolher horário, e este exame
          não tem horário até a equipe avaliar — pôr a entrevista
          no meio dele daria ao botão do fim dois significados. */}
      {pedindo && !!exame && (
        <PedirExame
          clienteId={clienteId}
          servicoId={exame.id}
          nomeDoExame={exame.nome}
          aoAvisar={avisar}
          aoFechar={() => setPedindo(false)}
        />
      )}

      <Aviso recado={recado} aoFechar={fechar} />
    </>
  );
}
