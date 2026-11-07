import { useEffect, useMemo, useRef, useState } from 'react';
import {
  chatHospital, chatEspecialidades, chatConvenios, chatMedicos,
  chatGrade, chatPrimeiraData, chatReagendar, chatReconhecer, chatConsentir, chatMarcar,
  chatMeusAgendamentos, chatCancelar, chatExames, chatSubtipos, chatQuemFaz,
  chatMarcarExame, chatFalar, chatSetores,
  chatSubespecialidades, chatExamesDoConvenio, chatAtendeConvenios,
  /* ⭐ 26/10: a foto do pedido médico e o exame que vira fila. */
  chatSolicitarExame, enviarAnexoDoPedido,
  type HospitalDoChat, type ItemDoChat, type MedicoDoChat, type Grade,
  type AgendamentoDoChat, type ExameDoChat, type QuemFazNoChat,
  type SetorDoChat, type SubtipoDoChat, type BlocoDeOrientacao
} from '../dados';
import {
  lerPerguntas, faltamRespostas, type RespostasDaEntrevista
} from '../../../nucleo/entrevista';
import { vagasDoDiaDaGrade, vagasPorDia, comoHora } from '../grade';
import {
  derivarMarca, sigla, formatarCPF, formatarCNPJ, hojeNoFuso, somarDias, instanteNoFuso,
  porExtensoNoFuso
} from '../../../nucleo/formato';
import { useAlturaDeVerdade } from './altura';
import { Passo } from './Passo';

/**
 * ============================================================
 *  O CHAT DO PACIENTE
 *  14/10/2026
 *
 *  O Tom: *"Vamos criar o chat agora?"* e *"faça a tela do chat
 *  mais bonita, sempre personalizada para o cliente, como se
 *  fosse do Hospital."*
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ ESTA TELA NÃO SABE DE QUAL HOSPITAL ELA É
 *
 *  Ela sabe o SLUG, que está no endereço, e pergunta o resto ao
 *  banco: nome, cor, logo, telefone, endereço, política de
 *  privacidade.
 *
 *  Nenhuma linha deste arquivo diz "St James". Trocar a cor do
 *  hospital é trocar uma linha de `core.clientes_config` — a
 *  mesma que o Tom já edita em Clientes → Configurar — e o chat
 *  inteiro se veste de novo, sem recompilar nada.
 *
 *  ------------------------------------------------------------
 *  ⚠️ E ELA NÃO TEM LOGIN
 *
 *  Nenhuma chamada daqui passa por `auth.uid()`. Tudo vai pelas
 *  funções `chat_*` do `036_chat.sql`, que recebem o slug e
 *  decidem o que pode sair.
 *
 *  Isso quer dizer que **o que esta tela não pedir, ela não
 *  tem**. Não existe "carregar tudo e filtrar na tela" aqui: o
 *  que não foi filtrado no banco estaria no navegador de quem
 *  abriu a página.
 * ============================================================
 */

type Etapa =
  | 'carregando' | 'sem-hospital'
  /** ⭐ 17/10: o menu que o chat de hoje tem, e o meu não tinha. */
  | 'menu' | 'so-telefone'
  | 'lgpd' | 'cpf' | 'quem-e-voce'
  | 'nome' | 'nascimento' | 'telefone'
  /** ⭐ 17/10: confere o número que já está no cadastro. */
  | 'confirma-telefone'
  | 'especialidade'
  /** ⭐ 17/10: "clico em ortopedia e depois as subespecialidades". */
  | 'subespecialidade'
  | 'convenio' | 'medico'
  /** ⭐ 19/10: "você já tem consulta marcada com esse profissional". */
  | 'ja-tem'
  /** ⭐ 19/10, noite: ver e cancelar o que já está marcado. */
  | 'meus' | 'cancelando'
  /** ⭐ 20/10: falar com o hospital — a última porta do menu. */
  | 'assunto' | 'recado'
  /** ⭐ 20/10, noite: "está completa ou quer acrescentar?" */
  | 'recado-conferir'
  | 'recado-enviado'
  /** ⭐ 19/10, noite: exames, com subtipo e quem faz. */
  | 'exame' | 'subtipo' | 'quem-faz'
  /* ⭐⭐⭐ 26/10: a guia e a entrevista.
   *
   *  `exame-entrevista` MORREU aqui. Era um beco: "ligue para o
   *  setor" — e o Tom decidiu o contrário, com todas as letras:
   *  *"os exames sem anexo viram solicitação e vão para a fila,
   *  recepção entra em contato e conclui o agendamento."*
   *
   *  Beco sem saída numa tela é trabalho que volta para o
   *  telefone do hospital. */
  | 'pedido-foto' | 'entrevista' | 'pedido-enviado'
  /* ⭐⭐⭐ 26/10, à tarde: o cartaz do exame.
   *
   *  O Tom mandou o cartaz do Laboratório Clínico: *"quando
   *  alguém clicar em cima do laboratório o chat mostre essas
   *  orientações"*. Para o laboratório a conversa ACABA aqui —
   *  ele não marca horário, atende por ordem de chegada. */
  | 'orientacoes'
  | 'dia' | 'hora' | 'confirmar' | 'marcando' | 'pronto';

interface Fala {
  id: number;
  de: 'bot' | 'eu';
  texto: string;
  /**
   * ⭐⭐ O ECO DA ESCOLHA, com o ✅ — copiado do chat que o Tom
   *    já usa:
   *
   *      <strong>Pediatria</strong> ✅
   *      Você vai usar convênio ou é particular?
   *
   *    Parece enfeite e não é. Numa conversa de dez passos, o
   *    paciente que volta ao chat depois de atender o telefone
   *    precisa saber ONDE PAROU — e a resposta tem que estar na
   *    última mensagem, não cinco balões acima.
   */
  eco?: string;
  /** Relógio de quando a fala apareceu. Texto pronto: 'HH:MM'. */
  hora: string;
}

/** 'HH:MM' de agora, no relógio do aparelho do paciente. */
function agoraHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:`
       + `${String(d.getMinutes()).padStart(2, '0')}`;
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_CURTOS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function soDigitos(t: string): string { return String(t ?? '').replace(/\D/g, ''); }

/** O que o paciente digitou vira dd/mm/aaaa → aaaa-mm-dd. */
export function dataDigitada(t: string): string | null {
  const d = soDigitos(t);
  if (d.length !== 8) return null;
  const dia = d.slice(0, 2), mes = d.slice(2, 4), ano = d.slice(4);
  const n = Number(ano);
  // ⭐ Um nascimento em 1890 ou em 2090 é erro de digitação, não
  //   um paciente. Aceitar faria a faixa etária do médico
  //   decidir sobre uma idade inventada.
  if (n < 1900 || n > new Date().getFullYear()) return null;
  const iso = `${ano}-${mes}-${dia}`;
  const v = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(v.getTime())) return null;
  // Rejeita 31/02: o Date "conserta" para 03/03 em silêncio.
  if (v.getDate() !== Number(dia) || v.getMonth() + 1 !== Number(mes)) return null;
  return iso;
}

export function Chat({ slug }: { slug: string }) {
  /* ⭐⭐⭐ ESTAMOS DENTRO DE UM IFRAME?
   *
   *  O Tom: *"o chat em si vai ficar em iframe no site dos
   *  clientes. É o que vai ser compartilhado no robô em
   *  resposta no WhatsApp."*
   *
   *  Então a MESMA página tem que servir aos dois casos:
   *
   *   · **embutida** no site do hospital — sem a vitrine (o
   *     site dele já tem a marca dele na volta), ocupando 100%
   *     da caixa que ele deu;
   *   · **sozinha**, aberta pelo link do WhatsApp — com a
   *     vitrine no computador e a tela inteira no celular.
   *
   *  ⚠️ `window.self !== window.top` dentro de um `try`: um
   *     iframe de origem diferente pode lançar ao ler `top`, e
   *     um erro aqui deixaria a página em branco. Na dúvida,
   *     "estou embutido" é a resposta mais segura — ela só
   *     esconde a vitrine. */
  const embutido = useMemo(() => {
    try { return window.self !== window.top; } catch { return true; }
  }, []);

  /* ⭐⭐⭐ A altura de verdade, medida pelo navegador. É o
     conserto do "o teclado esconde o que estou escrevendo".
     Dentro de um iframe ela não é medida — ver `altura.ts`. */
  useAlturaDeVerdade(embutido);

  const [hospital, setHospital] = useState<HospitalDoChat | null>(null);
  const [etapa, setEtapa] = useState<Etapa>('carregando');
  const [falas, setFalas] = useState<Fala[]>([]);
  const [digitando, setDigitando] = useState(false);
  const [erro, setErro] = useState('');

  /* ---- o que já sabemos do paciente ---- */
  const [cpf, setCpf] = useState('');
  const [nome, setNome] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [telefone, setTelefone] = useState('');
  const [telefoneFim, setTelefoneFim] = useState<string | null>(null);
  /** O recado escrito até aqui, antes de a pessoa confirmar o envio. */
  const [rascunho, setRascunho] = useState('');
  /** ⭐ 20/10: "Maria A*** S***" no resumo de quem foi reconhecido. */
  const [nomeDoResumo, setNomeDoResumo] = useState('');

  /* ---- as escolhas ---- */
  const [especialidades, setEspecialidades] = useState<ItemDoChat[]>([]);
  const [convenios, setConvenios] = useState<ItemDoChat[]>([]);
  const [medicos, setMedicos] = useState<MedicoDoChat[]>([]);
  const [especialidade, setEspecialidade] = useState<ItemDoChat | null>(null);
  const [subareas, setSubareas] = useState<ItemDoChat[]>([]);
  /** O PAI tocado. A `especialidade` passa a ser a subárea
   *  escolhida; esta guarda de onde ela veio, para o resumo
   *  poder dizer "Ortopedia · Coluna". */
  const [especialidadePai, setEspecialidadePai] = useState<ItemDoChat | null>(null);
  const [convenio, setConvenio] = useState<ItemDoChat | null>(null);
  const [medico, setMedico] = useState<MedicoDoChat | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [mes, setMes] = useState('');
  const [minimo, setMinimo] = useState('');
  /** ⭐ 19/10: a consulta que ele JÁ TEM com este profissional. */
  const [jaTem, setJaTem] = useState<{ quando: string; servico: string | null } | null>(null);
  /** ⭐ 20/10: QUAL consulta o banco apontou no aviso "você já
      tem consulta com este profissional". Sem ela, o remarcar
      daquele caminho não teria alvo — e a `chat_reagendar`
      passou a receber o id, não mais o recurso. */
  const [jaTemId, setJaTemId] = useState<string | null>(null);
  /** Quando ligado, o calendário está MUDANDO aquela consulta. */
  const [remarcando, setRemarcando] = useState(false);

  /* ⭐ 19/10, noite: ver e cancelar. */
  const [meus, setMeus] = useState<AgendamentoDoChat[]>([]);
  const [cancelando, setCancelando] = useState<AgendamentoDoChat | null>(null);

  /* ⭐ 19/10, noite: exames. `exameId` é o PAI; `pedido` são os
     serviços que de fato vão ser marcados — o pai quando não há
     subtipo, o subtipo quando há. É essa diferença que faz o
     filtro de quem faz funcionar. */
  const [exames, setExames] = useState<ExameDoChat[]>([]);
  const [exame, setExame] = useState<ExameDoChat | null>(null);
  const [subtipos, setSubtipos] = useState<SubtipoDoChat[]>([]);
  const [pedido, setPedido] = useState<string[]>([]);
  const [pedidoNome, setPedidoNome] = useState('');

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ A GUIA E A ENTREVISTA   (26/10/2026)
   *
   *  O Tom, testando: *"o fluxo de exames não está solicitando
   *  foto do pedido médico (…) Testei a Colonoscopia e não
   *  está indo no chat para a entrevista configurada no
   *  painel."*
   *
   *  Dois defeitos, uma causa só: a tela não tinha ONDE pôr
   *  nem a foto nem as perguntas. Agora tem.
   *
   *  ⚠️ `anexoId` é o id da linha no banco, não o arquivo. O
   *     arquivo nunca passa por aqui depois do envio — quem o
   *     guarda é o Storage, num bucket privado.
   * ════════════════════════════════════════════════════════ */
  /* ⭐⭐⭐ 26/10, à tarde: A GUIA TEM FOLHAS.
   *
   *  O Tom: *"Anexar o pedido pode ser opcional mais de um foto
   *  (Pois as vezes tem mais de uma folha)."*
   *
   *  `paginas` é o que o paciente já mandou; `guiaId` é o
   *  documento a que elas pertencem, e é ele que faz o verso
   *  cair junto da frente em vez de virar outro pedido. */
  const [paginas, setPaginas] =
    useState<{ id: string; nome: string; pagina: number }[]>([]);
  const [guiaId, setGuiaId] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  /** O cartaz do exame escolhido, e se ele encerra a conversa. */
  const [orientacoes, setOrientacoes] = useState<BlocoDeOrientacao[]>([]);
  const [soOrientacao, setSoOrientacao] = useState(false);

  /** ⭐ A PRIMEIRA folha representa a guia nas portas do banco.
   *  Lá dentro, `prender_anexo` e `paginas_do_anexo` trabalham
   *  sobre o GRUPO — então apontar qualquer folha aponta o
   *  documento inteiro. Aqui vai a primeira porque é a que
   *  sempre existe enquanto houver alguma. */
  const anexoId = paginas.length ? paginas[0].id : null;
  /** As perguntas DO QUE FOI ESCOLHIDO — do subtipo quando há. */
  const [perguntasDoPedido, setPerguntasDoPedido] = useState<unknown[] | null>(null);
  const [precisaEntrevista, setPrecisaEntrevista] = useState(false);
  const [respostas, setRespostas] = useState<RespostasDaEntrevista>({});
  /** ⭐ 20/10: os subtipos marcados, NA ORDEM em que o paciente
      tocou — é a ordem em que os horários serão ocupados. */
  const [marcadosDoPedido, setMarcadosDoPedido] = useState<string[]>([]);
  const [itensDoPedido, setItensDoPedido] = useState<{ id: string; nome: string }[]>([]);
  const [quemFaz, setQuemFaz] = useState<QuemFazNoChat[]>([]);
  const [executor, setExecutor] = useState<QuemFazNoChat | null>(null);
  /** Ligado quando o fluxo é de EXAME, e não de consulta. */
  const [modoExame, setModoExame] = useState(false);
  /** ⭐ 21/10: clínica sem convênio — o chat nem pergunta. */
  const [atendeConvenios, setAtendeConvenios] = useState(true);
  /** ⭐ 20/10: TODOS os exames do hospital, antes do filtro do convênio. */
  const [examesDoHospital, setExamesDoHospital] = useState<ExameDoChat[]>([]);
  /** Os ids (exames e subtipos) que o convênio escolhido cobre. */
  const [cobertos, setCobertos] = useState<Set<string> | null>(null);
  /** ⭐ Para onde ir depois de reconhecer o paciente. O CPF é a
      mesma porta para marcar, cancelar e pedir exame — o que
      muda é o que vem DEPOIS dela. */
  const [depoisDoCpf, setDepoisDoCpf] =
    useState<'agendar' | 'cancelar' | 'exame' | 'reagendar' | 'falar'>('agendar');
  /** ⭐ 20/10: o assunto escolhido e o protocolo que voltou. */
  const [setores, setSetores] = useState<SetorDoChat[]>([]);
  const [setor, setSetor] = useState<SetorDoChat | null>(null);
  const [protocolo, setProtocolo] = useState('');
  const [motivoMinimo, setMotivoMinimo] = useState('');
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState(-1);
  const [feito, setFeito] = useState<{ quando: string; protocolo: string } | null>(null);

  const [campo, setCampo] = useState('');
  const corpoRef = useRef<HTMLDivElement>(null);
  const proximaFala = useRef(1);

  const fuso = hospital?.fuso ?? 'America/Sao_Paulo';

  /* ════════════════════════════════════════════════════════
   *  A MARCA
   *
   *  ⭐ `derivarMarca` é a MESMA função que pinta o painel:
   *     o hospital escolhe UMA cor e as cinco saem dela, já
   *     com a tinta certa por cima (texto branco ou escuro,
   *     conforme o contraste).
   * ════════════════════════════════════════════════════════ */
  const marca = useMemo(
    () => derivarMarca(hospital?.cor || '#004994'), [hospital?.cor]);

  const estilo = {
    '--chat-primaria': marca.primary,
    '--chat-escura':   marca.primaryDark,
    '--chat-clara':    marca.primaryLight,
    '--chat-bg':       marca.primaryBg,
    '--chat-tinta':    marca.tinta,
    /* 6% da cor do hospital. É a textura do fundo da conversa —
       ver `.chat-corpo` no `chat.css`. */
    '--chat-fantasma': marca.primaryGhost
  } as React.CSSProperties;

  /* ---------------- falar ---------------- */

  function bot(texto: string, eco?: string) {
    setFalas(f => [...f, {
      id: proximaFala.current++, de: 'bot', texto, eco, hora: agoraHHMM()
    }]);
  }
  function eu(texto: string) {
    setFalas(f => [...f, {
      id: proximaFala.current++, de: 'eu', texto, hora: agoraHHMM()
    }]);
  }

  /** Fala com uma pausa — sem ela o chat despeja tudo de uma vez
   *  e parece formulário, não conversa. */
  async function botPausado(texto: string, ms = 420, eco?: string) {
    setDigitando(true);
    await new Promise(r => setTimeout(r, ms));
    setDigitando(false);
    bot(texto, eco);
  }

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ ONDE A CONVERSA PARA DEPOIS DE CADA FALA
   *
   *  A primeira versão fazia o óbvio:
   *
   *      el.scrollTo({ top: el.scrollHeight })
   *
   *  — rolar até o fim. E é isso que deixava a tela com cara de
   *  bagunça quando chegava uma lista.
   *
   *  ------------------------------------------------------------
   *  POR QUE ROLAR ATÉ O FIM ESTÁ ERRADO AQUI
   *
   *  Porque depois da pergunta vêm DEZ BOTÕES. Rolando até o
   *  fim, o que sobra na tela é o último botão da lista colado
   *  no campo de digitar — a pergunta ("Para qual especialidade
   *  você quer marcar?") sai por cima, fora da tela.
   *
   *  O paciente vê uma pilha de nomes sem título e precisa rolar
   *  PARA TRÁS para entender o que está sendo perguntado. Num
   *  celular, em que a lista de 12 especialidades é três telas,
   *  é a diferença entre escolher e desistir.
   *
   *  ------------------------------------------------------------
   *  ⭐ O chat que o Tom já usa faz o certo, no
   *     `scrollToParentMessage`: rola até o TOPO da mensagem que
   *     trouxe a lista, não até o fim dela. A pergunta fica na
   *     primeira linha e a lista se desenrola embaixo.
   *
   *  ⚠️ Os 200ms de espera dele também são de propósito, e eu
   *     tentei tirar: a `offsetTop` medida antes de o navegador
   *     desenhar a lista é a de ANTES, e a rolagem para no lugar
   *     errado. `requestAnimationFrame` sozinho não basta —
   *     ele garante o próximo quadro, não o fim da animação de
   *     entrada dos botões.
   * ════════════════════════════════════════════════════════ */
  useEffect(() => {
    const el = corpoRef.current;
    if (!el) return;

    const id = window.setTimeout(() => {
      // A última fala do bot é a pergunta. Enquanto ele "digita",
      // não há pergunta nova: aí o fim é o lugar certo mesmo.
      const balões = el.querySelectorAll<HTMLElement>('.chat-fala.bot');
      const ultima = balões.length ? balões[balões.length - 1]! : null;

      if (!ultima) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        return;
      }

      // ⭐ Só sobe se o conteúdo abaixo da pergunta couber. Se a
      //   lista for maior que a tela, levar a pergunta ao topo é
      //   o certo; se for menor, subir deixaria um vão branco
      //   embaixo e a conversa pareceria ter travado.
      const alvo = Math.min(
        Math.max(0, ultima.offsetTop - 15),
        Math.max(0, el.scrollHeight - el.clientHeight)
      );
      el.scrollTo({ top: alvo, behavior: 'smooth' });
    }, 220);

    return () => window.clearTimeout(id);
  }, [falas.length, digitando, etapa]);

  /* ---------------- abrir ---------------- */

  useEffect(() => {
    let valido = true;
    chatHospital(slug)
      .then(async h => {
        if (!valido) return;
        if (!h) { setEtapa('sem-hospital'); return; }
        setHospital(h);
        document.title = `${h.nome} · Agendamento`;
        // ⭐ Falhar ABERTO: sem resposta, o chat pergunta o
        //    convênio como sempre — perguntar a mais é melhor que
        //    marcar como particular quem tem convênio.
        setAtendeConvenios(await chatAtendeConvenios(slug).catch(() => true));
        setEtapa('menu');
        bot(`Olá! Aqui é o ${h.nome}. 👋`);
        await botPausado('O que você quer fazer?');
      })
      .catch(() => { if (valido) setEtapa('sem-hospital'); });
    return () => { valido = false; };
  }, [slug]);

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ O MENU — 17/10/2026
   *
   *  O chat que o Tom já usa abre com cinco opções: Agendar,
   *  Exame, Reagendar, Cancelar e Outros Assuntos. O meu caía
   *  direto no consentimento, e por isso parecia um formulário
   *  que começou sozinho.
   *
   *  ------------------------------------------------------------
   *  ⚠️ QUATRO DOS CINCO AINDA NÃO EXISTEM, E ELES DIZEM ISSO
   *
   *  A tentação é esconder o que não está pronto. Mas o
   *  paciente que chega pelo WhatsApp querendo CANCELAR não
   *  desiste porque o botão sumiu: ele escreve "quero cancelar"
   *  num chat que só sabe marcar, e aí a consulta dele continua
   *  de pé e ninguém sabe.
   *
   *  ⭐ Mostrar o botão e dizer **"por aqui ainda não; ligue
   *     neste número"** resolve o problema dele hoje e me diz,
   *     pelo `chat_uso`, quantos tentaram — que é o número que
   *     decide o que eu faço no próximo pacote.
   *
   *  ⚠️ O consentimento continua ANTES de qualquer dado do
   *     paciente. Tocar no menu não grava nada: a primeira
   *     coisa que o caminho de agendar faz é pedir a
   *     autorização, como antes.
   * ════════════════════════════════════════════════════════ */

  /** O que o menu ainda não sabe fazer, e para onde mandar. */
  function aindaNao(oque: string) {
    return hospital?.telefone
      ? `${oque} ainda não dá para fazer por aqui — estou aprendendo. `
        + `Ligue para ${hospital.telefone} e a recepção resolve na hora.`
      : `${oque} ainda não dá para fazer por aqui. `
        + `Por favor, entre em contato com o hospital.`;
  }

  async function escolherNoMenu(acao: string, rotulo: string) {
    eu(rotulo);

    /* ⭐⭐⭐ 19/10, noite: DUAS PORTAS A MAIS ABREM.
    
       Até agora o menu tinha uma opção que funcionava e quatro
       que diziam "ainda não". Hoje entram exame e cancelar.
    
       ⚠️ "Cancelar" e "Exame" seguem o MESMO caminho de
          autorização e CPF do agendar — não porque dê menos
          trabalho, mas porque é a mesma pessoa pedindo a mesma
          coisa ao mesmo hospital. Um caminho mais curto para
          cancelar seria uma porta mais fraca para a mesma casa. */
    /* ⭐⭐⭐ 20/10: AS DUAS ÚLTIMAS PORTAS ABREM.
    
       O menu nasceu com uma opção que funcionava e quatro que
       diziam "ainda não". Hoje as cinco funcionam.
    
       ⚠️ "Outros assuntos" NÃO é um telefone na tela. O
          paciente que abre o chat às 22h não quer um telefone:
          quer deixar o recado e ir dormir. O recado vira
          protocolo, na mesma fila que o WhatsApp receptivo
          alimenta — mesma pessoa, mesma tela, mesmo número. */
    if (acao === 'cancelar' || acao === 'exame'
        || acao === 'reagendar' || acao === 'outros') {
      if (acao === 'exame' && !hospital?.tem_exames) {
        setEtapa('so-telefone');
        await botPausado(aindaNao('Agendamento de exames'), 520, rotulo);
        return;
      }
      setModoExame(acao === 'exame');
      setDepoisDoCpf(acao === 'outros' ? 'falar' : acao);
      setEtapa('lgpd');
      await botPausado(
        'Antes de começar, preciso da sua autorização para usar seus '
        + 'dados — é rapidinho e você só faz uma vez.', 520, rotulo);
      return;
    }

    if (acao !== 'agendar') {
      setEtapa('so-telefone');
      await botPausado(aindaNao(rotulo), 520, rotulo);
      return;
    }
    setModoExame(false);
    setDepoisDoCpf('agendar');

    if (!hospital?.marcar_consulta) {
      setEtapa('so-telefone');
      await botPausado(aindaNao('Agendamento online'), 520, rotulo);
      return;
    }

    setEtapa('lgpd');
    await botPausado(
      'Antes de começar, preciso da sua autorização para usar seus '
      + 'dados — é rapidinho e você só marca uma vez.', 520, rotulo);
  }

  async function voltarAoMenu() {
    setEtapa('menu');
    await botPausado('Posso ajudar em mais alguma coisa?');
  }

  /* ---------------- o consentimento ---------------- */

  const [aceitaAgendamento, setAceitaAgendamento] = useState(false);
  const [aceitaWhatsapp, setAceitaWhatsapp] = useState(false);

  async function seguirDoLgpd() {
    if (!aceitaAgendamento) return;
    eu('Concordo');
    setEtapa('cpf');
    await botPausado('Qual é o seu CPF?');
  }

  /* ---------------- o CPF ---------------- */

  async function enviarCpf() {
    const d = soDigitos(campo);
    if (d.length !== 11) {
      setErro('O CPF precisa ter 11 dígitos.');
      return;
    }
    setErro('');
    eu(formatarCPF(d));
    setCampo('');
    setCpf(d);
    setDigitando(true);

    try {
      // ⭐ O consentimento é registrado AGORA, antes de qualquer
      //   outra coisa — e com o CPF, que é o que permite
      //   reencontrá-lo depois.
      const fins = ['agendamento'];
      if (aceitaWhatsapp) fins.push('whatsapp');
      await chatConsentir({ slug, cpf: d, finalidades: fins });

      const r = await chatReconhecer(slug, d);
      setDigitando(false);

      /* ⚠️⚠️⚠️ "DIGITEI MEU CPF E NÃO RECONHECEU"   (20/10/2026)
      
         O Tom achou isto testando. Depois de 20 consultas em 10
         minutos o freio pega — e até hoje a tela ficava PARADA
         aqui: mostrava a frase e não oferecia passo nenhum.
      
         ⭐ Beco sem saída. A pessoa lê "espere um minuto" e não
            tem o que fazer com isso: o campo do CPF já tinha
            sumido. Agora ela continua no mesmo passo e pode
            tentar de novo quando quiser.
      
         ⭐⭐ E a decisão é pelo `travado`, que o banco passou a
             devolver hoje. Antes, "o freio pegou" e "você não é
             paciente daqui" voltavam os dois como
             `achou = false` — e a tela fazia a coisa errada com
             metade deles. */
      if (r.travado) {
        setEtapa('cpf');
        setCampo('');
        bot(r.mensagem ?? 'Esperе um minuto e tente de novo.');
        return;
      }

      if (r.mensagem && !r.achou && r.mensagem.length > 0) {
        // CPF inválido: a mensagem do banco é a resposta.
        setEtapa('cpf');
        setCampo('');
        bot(r.mensagem);
        return;
      }

      if (r.achou && r.primeiro_nome) {
        setNome(r.primeiro_nome);
        setNomeDoResumo(r.nome_mascarado ?? '');
        setTelefoneFim(r.telefone_fim);
        setEtapa('quem-e-voce');
        bot(`Olá, ${r.primeiro_nome}! Que bom ter você de volta. 😊`);
        return;
      }

      setEtapa('nome');
      await botPausado('Não encontrei seu cadastro. Qual é o seu nome completo?');
    } catch (e) {
      setDigitando(false);
      setErro((e as Error).message ?? String(e));
    }
  }

  async function souEu(sim: boolean) {
    if (!sim) {
      eu('Não sou eu');
      setNome(''); setTelefoneFim(null); setNomeDoResumo('');
      setEtapa('cpf');
      setCpf('');
      await botPausado(
        'Sem problema. Pode conferir e digitar o CPF de novo?');
      return;
    }
    eu('Sou eu');

    /* ════════════════════════════════════════════════════════
     *  ⭐⭐⭐ CONFERIR O TELEFONE DO CADASTRO — 17/10/2026
     *
     *  O chat de hoje faz isto e o meu não fazia:
     *
     *      "Seu WhatsApp ainda é (24) 99275-9278?"
     *      [ Sim, é esse ]  [ Mudou ]
     *
     *  Não é só educação. O telefone é por onde sai a
     *  confirmação e o lembrete de véspera. Um número velho no
     *  cadastro vira uma consulta marcada que o paciente nunca
     *  soube que existia — e uma falta que ninguém viu chegar.
     *
     *  ⭐ A pergunta usa o número MASCARADO, que é o único que
     *     esta tela tem. O número inteiro nunca sai do banco
     *     pela porta pública, e não precisa: para reconhecer o
     *     próprio telefone, os quatro últimos dígitos bastam.
     * ════════════════════════════════════════════════════════ */
    if (telefoneFim) {
      setEtapa('confirma-telefone');
      await botPausado(
        `Seu telefone ainda é ${telefoneFim}?`);
      return;
    }

    /* ⚠️⚠️ O CADASTRO ANTIGO SEM TELEFONE — e este caminho não
       existia. `telefoneFim` é nulo exatamente quando o
       paciente foi encontrado e NÃO tem telefone guardado (a
       máscara só é montada quando há número).

       Antes, esse paciente seguia direto para a especialidade,
       andava seis passos até a confirmação, e só então levava
       "precisamos de um telefone com DDD" — numa tela onde não
       há onde digitar um.

       ⭐ Pedir AGORA, no segundo passo, custa um campo. Pedir
          no fim custa a consulta: ninguém refaz seis passos. */
    setEtapa('telefone');
    await botPausado(
      'Preciso de um telefone com DDD para confirmar seu '
      + 'atendimento — não tenho nenhum no seu cadastro.');
  }

  async function confirmarTelefone(mesmo: boolean) {
    if (mesmo) {
      eu('Sim, é esse');
      /* ⚠️ Nada é enviado: a tela não tem o número, e não
         precisa ter. Quem usa o do cadastro é o `chat_marcar`,
         no banco — ver o bloco "O TELEFONE QUE JÁ ESTÁ NO
         CADASTRO VALE", no `036_chat.sql`. */
      await seguirDepoisDoCpf();
      return;
    }
    eu('Mudou');
    setTelefoneFim(null);
    setEtapa('telefone');
    await botPausado('Qual é o número novo, com DDD?');
  }

  /* ---------------- o cadastro novo ---------------- */

  async function enviarNome() {
    const n = campo.trim().replace(/\s+/g, ' ');
    // ⭐ Duas palavras: "Maria" sozinha vira um cadastro que a
    //   recepção não consegue achar depois, e dois "Maria"
    //   diferentes viram o mesmo paciente na busca.
    if (n.length < 5 || !n.includes(' ')) {
      setErro('Escreva seu nome completo, com sobrenome.');
      return;
    }
    setErro(''); eu(n); setCampo(''); setNome(n);
    setEtapa('nascimento');
    await botPausado('Qual a sua data de nascimento? (dia/mês/ano)');
  }

  async function enviarNascimento() {
    const iso = dataDigitada(campo);
    if (!iso) {
      setErro('Escreva no formato dia/mês/ano, como 05/03/1985.');
      return;
    }
    setErro('');
    eu(campo.trim()); setCampo(''); setNascimento(iso);
    setEtapa('telefone');
    await botPausado('E um telefone com DDD, para confirmarmos seu atendimento?');
  }

  async function enviarTelefone() {
    const d = soDigitos(campo);
    if (d.length < 10 || d.length > 11) {
      setErro('Digite o telefone com DDD — 10 ou 11 números.');
      return;
    }
    setErro(''); eu(campo.trim()); setCampo(''); setTelefone(d);
    await seguirDepoisDoCpf();
  }

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ DEPOIS DO CPF, TRÊS CAMINHOS   (19/10/2026, noite)
   *
   *  O CPF é a mesma porta para marcar, cancelar e pedir exame.
   *  O que muda é o que vem depois dela — e quem lembra disso é
   *  o `depoisDoCpf`, decidido lá no menu.
   *
   *  ⚠️ A primeira ideia era ramificar lendo a etapa atual. Era
   *     frágil: a etapa muda por vários motivos, e uma regra
   *     escrita sobre ela quebraria no dia em que alguém
   *     acrescentasse um passo no meio. A intenção é um fato
   *     próprio, e fato tem variável.
   * ════════════════════════════════════════════════════════ */
  async function seguirDepoisDoCpf() {
    /* ⭐ Cancelar e Reagendar usam a MESMA lista. Era a razão de
       o Tom ter escolhido o Cancelar primeiro: *"a lista
       destrava duas"*. Ela destravou. */
    if (depoisDoCpf === 'cancelar' || depoisDoCpf === 'reagendar') {
      return verMeusAgendamentos();
    }
    if (depoisDoCpf === 'exame') return irParaExames();
    if (depoisDoCpf === 'falar') return irParaAssunto();
    return irParaEspecialidade();
  }

  /* ---------------- falar com o hospital ---------------- */

  async function irParaAssunto() {
    setEtapa('assunto');
    setDigitando(true);
    try {
      const l = await chatSetores(slug);
      setSetores(l);
      setDigitando(false);
      if (!l.length) {
        bot('Para falar com a gente, ligue para o hospital.');
        return;
      }
      bot('Sobre o que você precisa falar?');
    } catch (err) {
      setDigitando(false);
      setErro((err as Error).message ?? String(err));
    }
  }

  async function escolherSetor(st: SetorDoChat) {
    setSetor(st); eu(st.nome);

    /* ⭐⭐ O setor que RESPONDE NO WHATSAPP não vira protocolo.
    
       É a distinção que o Apps Script já fazia — "Atendimento ·
       Responde no WhatsApp". Abrir um recado numa fila que
       ninguém lê, quando o hospital atende por outro canal,
       seria prometer resposta onde não há quem responda. */
    if (st.no_whatsapp) {
      setEtapa('so-telefone');
      await botPausado(
        `${st.nome} atende pelo WhatsApp. `
        + (hospital?.telefone
            ? `Chame no ${hospital.telefone} que respondemos por lá.`
            : 'Ligue para nós que respondemos na hora.'));
      return;
    }

    setCampo(''); setRascunho('');
    setEtapa('recado');
    /* ⭐ 20/10, noite — o Tom: "precisa ser mais formal. Deixe sua
       mensagem e será respondido pelo WhatsApp". O fim do número
       vai junto: quem confirmou o telefone dois passos atrás vê
       ONDE vai chegar a resposta. */
    const fim = (soDigitos(telefone) || soDigitos(telefoneFim ?? '')).slice(-4);
    await botPausado(
      'Por favor, deixe sua mensagem. Ela será respondida pelo WhatsApp'
      + (fim.length === 4 ? `, no número terminado em ${fim}.` : '.'));
  }

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ O RECADO SÓ SAI DEPOIS DE "ESTÁ COMPLETA"
   *                                       (20/10/2026, noite)
   *
   *  O Tom: *"para que ninguém pense que pode escrever uma linha
   *  depois outra. Quando apertar enviar, pergunte se o texto
   *  está completo ou deseja acrescentar algo."*
   *
   *  Num chat, apertar enviar a cada frase é o normal. Aqui, cada
   *  envio virava um protocolo — e a segunda frase, "é para a
   *  minha mãe", chegava na fila SEPARADA da primeira.
   *
   *  ⭐ "Quero acrescentar" não apaga nada: o que a pessoa
   *     escreve depois SE SOMA ao que já estava, e vai tudo num
   *     recado só. O teto de 2000 letras vale para o total.
   * ════════════════════════════════════════════════════════ */
  const TETO_DO_RECADO = 2000;

  async function enviarRecado() {
    const parte = campo.trim();
    const texto = rascunho ? `${rascunho}\n${parte}` : parte;
    if (texto.length < 5) {
      setErro('Escreva um pouco mais para a gente entender.');
      return;
    }
    if (texto.length > TETO_DO_RECADO) {
      setErro(`A mensagem passou de ${TETO_DO_RECADO} letras. Resuma um pouco, por favor.`);
      return;
    }
    setErro(''); eu(parte); setCampo('');
    setRascunho(texto);
    setEtapa('recado-conferir');
    await botPausado(
      'Sua mensagem está completa, ou deseja acrescentar algo antes de enviar?');
  }

  async function acrescentarAoRecado() {
    eu('Quero acrescentar');
    setEtapa('recado');
    await botPausado('Pode continuar. O que você escrever será juntado à mensagem anterior.');
  }

  async function confirmarRecado() {
    const texto = rascunho;
    eu('Está completa, pode enviar');
    setDigitando(true);
    try {
      if (!setor) return;
      const r = await chatFalar(slug, cpf, telefone, setor.id, texto);
      setDigitando(false);
      if (!r.ok) { bot(r.mensagem); return; }
      setProtocolo(r.protocolo ?? '');
      setRascunho('');
      setEtapa('recado-enviado');
      bot(`${r.mensagem} Guarde o número do seu protocolo: `
          + `${r.protocolo ?? ''}.`);
    } catch (err) {
      setDigitando(false);
      setErro((err as Error).message ?? String(err));
    }
  }

  /* ---------------- ver e cancelar ---------------- */

  async function verMeusAgendamentos() {
    setEtapa('meus');
    setDigitando(true);
    try {
      const l = await chatMeusAgendamentos(slug, cpf);
      setMeus(l);
      setDigitando(false);
      if (!l.length) {
        bot('Não encontrei nenhum atendimento marcado no seu CPF. '
            + 'Se você marcou pelo telefone, pode levar um tempinho '
            + 'até aparecer aqui.');
        return;
      }
      bot(l.length === 1
        ? 'Você tem este atendimento marcado:'
        : `Você tem ${l.length} atendimentos marcados:`);
    } catch (err) {
      setDigitando(false);
      setErro((err as Error).message ?? String(err));
    }
  }

  /* ⭐⭐⭐ 20/10: A MESMA LISTA SERVE AOS DOIS.
  
     O paciente tocou num atendimento. O que acontece depois
     depende de por que ele entrou: cancelar pede confirmação;
     reagendar abre o calendário.
  
     ⚠️ A decisão é pelo `depoisDoCpf`, que é a INTENÇÃO dele lá
        no menu — não pela etapa atual. Regra escrita sobre a
        etapa quebraria no dia em que alguém pusesse um passo no
        meio. */
  async function aoTocarNoAgendamento(a: AgendamentoDoChat) {
    if (depoisDoCpf === 'reagendar') return pedirRemarcarEste(a);
    return pedirCancelar(a);
  }

  /** Reagendar ESTE atendimento: o calendário do mesmo recurso. */
  async function pedirRemarcarEste(a: AgendamentoDoChat) {
    eu(`${porExtensoNoFuso(a.quando, fuso)} — ${a.servico}`);
    setCancelando(a);          // guarda QUAL, para o gravar
    setRemarcando(true);
    setModoExame(false);
    setEtapa('dia');
    setDigitando(true);
    try {
      const hoje = hojeNoFuso(fuso);
      setMinimo(hoje); setMotivoMinimo('');
      const inicioMes = hoje.slice(0, 8) + '01';
      setMes(inicioMes);
      /* ⭐ O calendário é o de QUEM FAZ aquele atendimento. A
         lista não devolve o id do recurso de propósito — a
         porta pública devolve o mínimo —, então quem sabe é o
         banco: o `chat_reagendar` confere o dono e move. Aqui a
         grade vem pelo mesmo caminho do agendamento original. */
      const g = await chatGrade(slug, a.recurso_id, inicioMes,
                                somarDias(inicioMes, 62));
      setGrade(g);
      setDigitando(false);
      await botPausado('Escolha a nova data:');
    } catch (err) {
      setDigitando(false);
      setErro((err as Error).message ?? String(err));
    }
  }

  /** O paciente tocou num atendimento da lista: confirma antes. */
  async function pedirCancelar(a: AgendamentoDoChat) {
    setCancelando(a);
    setEtapa('cancelando');
    eu(`${porExtensoNoFuso(a.quando, fuso)} — ${a.servico}`);
    /* ⭐ Cancelar é irreversível para a vaga: ela volta para a
       fila e pode ser tomada em minutos. Por isso o segundo
       toque, e por isso a pergunta diz o que acontece. */
    await botPausado(
      'Tem certeza? A vaga volta para a agenda e pode ser ocupada '
      + 'por outra pessoa.');
  }

  async function confirmarCancelar() {
    if (!cancelando) return;
    const alvo = cancelando;
    setDigitando(true);
    try {
      const r = await chatCancelar(slug, cpf, alvo.id, null);
      setDigitando(false);
      if (!r.ok) { bot(r.mensagem); setEtapa('meus'); setCancelando(null); return; }
      eu('Sim, cancelar');
      bot(r.mensagem);
      setCancelando(null);
      /* ⭐ Volta para a lista JÁ SEM ele: a tela não pode
         continuar mostrando o que acabou de sair. */
      const l = await chatMeusAgendamentos(slug, cpf);
      setMeus(l);
      setEtapa('meus');
      if (!l.length) bot('Não sobrou nenhum atendimento marcado.');
    } catch (err) {
      setDigitando(false);
      setErro((err as Error).message ?? String(err));
    }
  }

  /* ---------------- exames ---------------- */

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ NO EXAME, O CONVÊNIO VEM PRIMEIRO   (20/10/2026)
   *
   *  O Tom: "o convênio precisa vir antes de escolher qual
   *  exame, para filtrar qual exame está disponível para aquele
   *  convênio."
   *
   *  Antes o chat nem perguntava: todo exame marcado pelo chat
   *  entrava SEM convênio, e a restrição da Gestão de Exames
   *  nunca se aplicava por aqui. Perguntar DEPOIS do exame
   *  levaria o paciente a escolher o Holter para ouvir "o seu
   *  convênio não cobre" — a pior ordem possível.
   * ════════════════════════════════════════════════════════ */
  async function irParaExames() {
    setDigitando(true);
    setCobertos(null);
    try {
      const [e, c] = await Promise.all([chatExames(slug), chatConvenios(slug)]);
      setExamesDoHospital(e); setConvenios(c);
      if (!e.length) {
        setEtapa('exame'); setExames([]);
        setDigitando(false);
        bot('Não há exames disponíveis para agendamento online no momento. '
            + 'Por favor, ligue para nós.');
        return;
      }
      // Hospital sem convênio cadastrado, ou que NÃO atende convênio:
      // o exame é particular e a pergunta nem aparece.
      if (!c.length || !atendeConvenios) {
        await listarExames(null, e);
        return;
      }
      setEtapa('convenio');
      setDigitando(false);
      bot('Qual é o seu convênio? Assim mostro só os exames que ele cobre.');
    } catch (err) {
      setDigitando(false);
      setErro((err as Error).message ?? String(err));
    }
  }

  /** Os exames que ESTE convênio cobre — a regra é do banco. */
  async function listarExames(c: ItemDoChat | null, todos = examesDoHospital) {
    setEtapa('exame');
    setDigitando(true);
    try {
      const ids = await chatExamesDoConvenio(slug, c?.id ?? null);
      const lista = todos.filter(x => ids.has(x.id));
      setCobertos(ids); setExames(lista);
      setDigitando(false);
      if (!lista.length) {
        bot(`Nenhum exame pode ser marcado online com ${c?.nome ?? 'este convênio'}. `
            + (hospital?.telefone
                ? `Ligue para ${hospital.telefone} que a recepção verifica com você.`
                : 'Ligue para nós que a recepção verifica com você.'));
        return;
      }
      bot('Qual exame você precisa fazer?', c?.nome ?? 'Particular');
    } catch (err) {
      setDigitando(false);
      setErro((err as Error).message ?? String(err));
    }
  }

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ O CARTAZ DO EXAME   (26/10/2026, à tarde)
   *
   *  O Tom mandou a arte do Laboratório Clínico — horários de
   *  coleta, entrega da guia um dia antes, senha por ordem de
   *  chegada, retirar frascos — e pediu que o chat a mostrasse.
   *
   *  ⭐ Quando o exame é "só orientação", a conversa ACABA aqui:
   *     o laboratório não marca horário. Quando não é, o cartaz
   *     é só um aviso no caminho e o fluxo segue.
   *
   *  ⚠️ `depois` chega por argumento porque esta função é
   *     chamada de dois lugares (o exame e o subtipo), e cada um
   *     sabe o que vem na sequência. Guardar isso em estado
   *     seria o chat decidindo duas vezes a mesma coisa.
   * ════════════════════════════════════════════════════════ */
  async function mostrarOrientacoes(
    blocos: BlocoDeOrientacao[], soOrienta: boolean, rotulo: string
  ) {
    setOrientacoes(blocos);
    setSoOrientacao(soOrienta);
    setEtapa('orientacoes');
    await botPausado(
      soOrienta
        ? 'Para este exame não é preciso marcar horário. Leia as '
          + 'orientações antes de vir:'
        : 'Antes de seguir, leia as orientações deste exame:',
      520, rotulo);
  }

  /* ⚠️ O cartaz aparece UMA vez, e no último momento em que o
     pedido já está fechado.

     A primeira versão mostrava no exame E no subtipo. Como o
     subtipo HERDA as orientações do pai, o paciente do
     Laboratório leria o mesmo cartaz duas vezes seguidas — e
     quem lê a mesma coisa duas vezes para de ler.

     Exceção: o exame "só orientação" mostra assim que é tocado.
     Ali o cartaz não está no caminho de nada — ele É o
     caminho. */

  async function escolherExame(e: ExameDoChat) {
    setExame(e); eu(e.nome);

    /* ⚠️⚠️⚠️ AQUI FICAVA O BECO.   (até 26/10/2026)

       `if (e.entrevista) { … 'Fale com o setor pelo telefone' }`
       — e acabava ali. O exame com entrevista nunca chegava a
       lugar nenhum pelo chat, e o paciente que abriu o chat às
       22h para não ligar… tinha que ligar.

       ⭐ O Tom resolveu o desenho: o exame com entrevista VIRA
          SOLICITAÇÃO na fila, com as respostas junto. Quem
          decide a agenda continua sendo o setor — só que agora
          ele recebe o pedido pronto, em vez de um telefonema.

       A escolha da entrevista não é mais feita AQUI: ela é
       feita depois da guia, porque o subtipo também pode pedir
       entrevista — e era exatamente o caso da Colonoscopia que
       o Tom testou. */

    /* ⭐⭐⭐ O LABORATÓRIO PARA AQUI.
       Não marca horário, não pede guia, não abre fila: mostra o
       cartaz com os horários de coleta e o telefone do setor, e
       encerra. Foi a decisão do Tom, em duas respostas que são
       a mesma: "só orienta e encerra" e "não pede foto". */
    if (e.so_orientacao) {
      await mostrarOrientacoes(e.orientacoes ?? [], true, e.nome);
      return;
    }

    if (e.tem_subtipos) {
      setEtapa('subtipo');
      setDigitando(true);
      try {
        const t = await chatSubtipos(slug, e.id);
        // ⭐ Só os subtipos que o convênio cobre.
        setSubtipos(cobertos ? t.filter(x => cobertos.has(x.id)) : t);
        setMarcadosDoPedido([]); setItensDoPedido([]);
        setDigitando(false);
        bot('Qual deles?', e.nome);
      } catch (err) {
        setDigitando(false);
        setErro((err as Error).message ?? String(err));
      }
      return;
    }

    /* Exame sem subtipo: o item do pedido é ele mesmo. O resumo
       lê daqui, e não pode ficar vazio só porque não houve um
       segundo passo. */
    setItensDoPedido([{ id: e.id, nome: e.nome }]);
    setMarcadosDoPedido([e.id]);
    prepararPedido([e.id], e.nome, e.entrevista, e.perguntas);

    if ((e.orientacoes ?? []).length) {
      await mostrarOrientacoes(e.orientacoes ?? [], false, e.nome);
      return;
    }
    await pedirAFoto(e.nome);
  }

  /* ⭐⭐⭐ 20/10: marcar e desmarcar, em vez de escolher um.
  
     A guia do médico quase nunca pede um ultrassom: pede abdome
     E tireoide, e os dois são feitos na mesma ida. O painel já
     fazia isso desde 09/10 — o chat é que nasceu com escolha de
     um só.
  
     ⚠️ A ordem do array é a ordem dos toques, e é ela que o
        `marcar_exame` usa para encaixar um horário depois do
        outro. `filter` preserva a ordem dos que ficam; o novo
        entra no fim. */
  function marcarSubtipo(t: ItemDoChat) {
    setMarcadosDoPedido(atual =>
      atual.includes(t.id) ? atual.filter(x => x !== t.id) : [...atual, t.id]);
  }

  async function seguirDoSubtipo() {
    if (!marcadosDoPedido.length) return;
    const escolhidos = marcadosDoPedido
      .map(id => subtipos.find(t => t.id === id))
      .filter((t): t is SubtipoDoChat => !!t);
    setItensDoPedido(escolhidos.map(t => ({ id: t.id, nome: t.nome })));
    eu(escolhidos.map(t => t.nome).join(', '));

    /* ⭐⭐⭐ A COLONOSCOPIA DO TOM MORAVA AQUI.

       O `chat_subtipos` não devolvia `entrevista`, então o
       subtipo chegava nesta linha sempre como "não pede
       entrevista" — e seguia direto para o calendário. O exame
       de cima pedia; o subtipo, que É o mesmo exame, não.

       ⭐ Duas respostas para a mesma pergunta, discordando em
          silêncio. De novo. O conserto de verdade foi no banco
          (`036_chat.sql`): o subtipo herda a entrevista do pai
          quando ele próprio não pede. Aqui a tela só lê.

       ⚠️ BASTA UM: se o paciente marcou abdome (sem entrevista)
          e colonoscopia (com), o pedido inteiro passa pela
          avaliação. Marcar metade no calendário e metade na
          fila daria DUAS idas ao hospital para uma guia só. */
    const comEntrevista = escolhidos.find(t => t.entrevista);
    const rotulo =
      `${exame?.nome ?? ''} · ${escolhidos.map(t => t.nome).join(', ')}`;

    prepararPedido(
      escolhidos.map(t => t.id), rotulo,
      !!comEntrevista || !!exame?.entrevista,
      comEntrevista?.perguntas ?? exame?.perguntas ?? null);

    /* ⭐ "Só orientação" também vale por herança: se o
       Laboratório não marca horário, o Hemograma dele também
       não. Basta UM dos escolhidos para o pedido inteiro
       parar no cartaz — misturar um exame que agenda com um
       que não agenda numa escolha só não tem resposta boa, e
       a segura é não agendar. */
    const soOrienta = escolhidos.find(t => t.so_orientacao);
    if (soOrienta) {
      await mostrarOrientacoes(
        soOrienta.orientacoes ?? exame?.orientacoes ?? [], true, rotulo);
      return;
    }

    const cartaz = escolhidos.find(t => (t.orientacoes ?? []).length);
    if (cartaz) {
      await mostrarOrientacoes(cartaz.orientacoes ?? [], false, rotulo);
      return;
    }
    await pedirAFoto(rotulo);
  }

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ A FOTO DO PEDIDO MÉDICO — SEMPRE   (26/10/2026)
   *
   *  O Tom escolheu "em TODO exame, sempre". E decidiu o que
   *  acontece quando ela não vem:
   *
   *    *"Se não tiver anexo não deixa ir para os horários, os
   *     exames sem anexo viram solicitação e vão para a fila,
   *     recepção entra em contato e conclui o agendamento."*
   *
   *  ⭐ Repare que NÃO é "sem foto não dá". Uma trava que briga
   *     com o mundo real — a guia que ficou na bolsa, o celular
   *     sem câmera — vira o `catch` que alguém põe em volta
   *     dela. Aqui o caminho sem foto existe: ele só é outro.
   * ════════════════════════════════════════════════════════ */
  /** Quantas folhas da guia o chat aceita. */
  const MAX_PAGINAS = 5;

  /** ⭐ O PEDIDO FECHADO: o que foi escolhido e o que ele exige.
   *
   *  Separado de `pedirAFoto` porque o cartaz de orientações
   *  pode entrar no meio dos dois. Isto aqui grava FATOS; a
   *  outra desenha um passo. */
  function prepararPedido(
    servicos: string[], rotulo: string,
    entrevista: boolean, perguntas: unknown[] | null
  ) {
    setPedido(servicos); setPedidoNome(rotulo);
    setPrecisaEntrevista(entrevista);
    setPerguntasDoPedido(perguntas ?? null);
    setPaginas([]); setGuiaId(null); setRespostas({}); setErro('');
  }

  async function pedirAFoto(rotulo: string) {
    setEtapa('pedido-foto');
    await botPausado(
      'Agora preciso ver o pedido do seu médico. Tire uma foto da guia '
      + '(ou mande o PDF) — é por ela que o setor confere o que foi '
      + 'pedido e o preparo certo. Se a guia tiver mais de uma folha, '
      + 'pode mandar todas.', 520, rotulo);
  }

  /** Mais uma folha. Quem confere e guarda é a Edge Function. */
  async function enviarFoto(arquivo: File) {
    if (paginas.length >= MAX_PAGINAS) {
      setErro(`São no máximo ${MAX_PAGINAS} folhas. Se faltar alguma, `
              + 'a recepção completa por telefone.');
      return;
    }
    setErro(''); setEnviandoFoto(true);
    try {
      /* ⭐ Da SEGUNDA folha em diante vai o `guiaId` que voltou
         na primeira — é ele que faz o verso entrar no mesmo
         pedido médico em vez de virar outro. */
      const r = await enviarAnexoDoPedido({ slug, cpf, arquivo, guiaId });
      setEnviandoFoto(false);
      if (!r.ok || !r.id) {
        /* ⭐ A recusa do tamanho/tipo vem com a frase do banco e
           fica NO PASSO — o paciente escolhe outro arquivo sem
           recomeçar a conversa. */
        setErro(r.mensagem || 'Não consegui receber o arquivo.');
        return;
      }
      if (r.guia) setGuiaId(r.guia);
      setPaginas(atual => [...atual, {
        id: r.id!, nome: arquivo.name || 'pedido',
        pagina: r.pagina ?? atual.length + 1
      }]);
      /* ⚠️ NÃO segue sozinho para o passo seguinte. A folha 2
         só existe se a tela esperar por ela — avançar no
         primeiro envio tornaria o pedido do Tom impossível de
         usar. Quem decide que acabou é o botão "Continuar". */
    } catch (err) {
      setEnviandoFoto(false);
      setErro((err as Error).message ?? String(err));
    }
  }

  /** Do cartaz para a guia. O exame "só orientação" não chega
   *  aqui: lá o botão é "voltar ao início". */
  async function seguirDoCartaz() {
    await pedirAFoto(pedidoNome);
  }

  /** Tirar uma folha da lista antes de seguir. */
  function removerPagina(id: string) {
    setErro('');
    setPaginas(atual => {
      const resto = atual.filter(p => p.id !== id);
      /* ⚠️ Esvaziou? O grupo também morre. Guardar o `guiaId` de
         um documento sem folha nenhuma faria a próxima foto
         entrar numa guia vazia que o paciente já descartou. */
      if (!resto.length) setGuiaId(null);
      return resto;
    });
  }

  async function seguirDasFotos() {
    if (!paginas.length) return;
    eu(paginas.length === 1
      ? '📎 Pedido médico enviado'
      : `📎 Pedido médico enviado (${paginas.length} folhas)`);
    await depoisDaFoto(paginas[0].id);
  }

  async function semAFoto() {
    eu('Não estou com o pedido agora');
    setPaginas([]); setGuiaId(null);
    await depoisDaFoto(null);
  }

  /** ⚠️ O id vem por ARGUMENTO, não do estado: quem acabou de
      chamar `setPaginas` ainda leria a lista velha. */
  async function depoisDaFoto(idAnexo: string | null) {
    const quantas = lerPerguntas(perguntasDoPedido ?? []).perguntas.length;

    /* 1) Pede entrevista e TEM perguntas: responde agora. */
    if (precisaEntrevista && quantas > 0) {
      setEtapa('entrevista');
      await botPausado(
        'Este exame passa por uma avaliação antes. Responda estas '
        + 'perguntas — é o que o setor usa para escolher a agenda certa '
        + 'e o preparo.', 520);
      return;
    }

    /* 2) Pede entrevista e NÃO tem pergunta cadastrada: vai para
       a fila do mesmo jeito. O setor decide.
       ⚠️ Travar aqui puniria o paciente por um cadastro que
          falta no painel — e ele não tem como consertar isso. */
    if (precisaEntrevista || !idAnexo) {
      await enviarSolicitacao(idAnexo, {});
      return;
    }

    /* 3) Com a guia e sem entrevista: calendário, como antes. */
    await escolherQuemFaz(pedido, pedidoNome);
  }

  async function seguirDaEntrevista() {
    const lista = lerPerguntas(perguntasDoPedido ?? []).perguntas;
    const faltam = faltamRespostas(lista, respostas);
    if (faltam.length) {
      /* ⭐ DIZ QUAL falta. "Responda tudo" numa lista de onze
         perguntas é um caça-palavras. */
      setErro(faltam.length === 1
        ? `Falta responder: ${faltam[0].pergunta}`
        : `Faltam ${faltam.length} respostas: `
          + faltam.map(p => p.pergunta).join(' · '));
      return;
    }
    setErro('');
    eu('Respondi a avaliação');
    await enviarSolicitacao(anexoId, respostas);
  }

  /** O pedido que vai para a FILA, e não para o calendário. */
  async function enviarSolicitacao(
    idAnexo: string | null, resp: RespostasDaEntrevista
  ) {
    setDigitando(true); setErro('');
    try {
      const r = await chatSolicitarExame({
        slug, servicos: pedido, respostas: resp,
        nome, cpf, telefone,
        nascimento: nascimento || null,
        convenioId: convenio?.id ?? null,
        anexoId: idAnexo
      });
      setDigitando(false);
      if (!r.ok) {
        /* Fica no mesmo passo: a recusa do banco diz o que
           falta, e o paciente corrige sem recomeçar. */
        bot(r.mensagem);
        return;
      }
      setProtocolo(r.protocolo ?? '');
      setEtapa('pedido-enviado');
      bot(r.mensagem);
    } catch (err) {
      setDigitando(false);
      setErro((err as Error).message ?? String(err));
    }
  }

  /** ⭐ O filtro que o Tom pediu: quem faz AQUELE subtipo. */
  async function escolherQuemFaz(servicos: string[], rotulo: string) {
    setPedido(servicos); setPedidoNome(rotulo);
    setEtapa('quem-faz');
    setDigitando(true);
    try {
      const hoje = hojeNoFuso(fuso);
      const q = await chatQuemFaz(slug, servicos, convenio?.id ?? null,
                                  hoje, somarDias(hoje, 62));
      setQuemFaz(q);
      setDigitando(false);
      if (!q.length) {
        bot('Não há ninguém com agenda aberta para esse exame agora. '
            + 'Ligue para nós que a recepção encaixa você.');
        return;
      }
      /* ⭐⭐ UM SÓ: a tela escolhe sozinha e DIZ que escolheu.
         Oferecer uma lista de um item é pedir um clique que não
         decide nada. */
      if (q.length === 1) {
        await escolherExecutor(q[0], true);
        return;
      }
      bot('Com quem você prefere fazer?', rotulo);
    } catch (err) {
      setDigitando(false);
      setErro((err as Error).message ?? String(err));
    }
  }

  async function escolherExecutor(q: QuemFazNoChat, sozinha = false) {
    setExecutor(q);
    if (!sozinha) eu(q.nome);
    setEtapa('dia');
    setDigitando(true);
    try {
      const hoje = hojeNoFuso(fuso);
      setMinimo(hoje); setMotivoMinimo('');
      const inicioMes = hoje.slice(0, 8) + '01';
      setMes(inicioMes);
      const g = await chatGrade(slug, q.id, inicioMes, somarDias(inicioMes, 62));
      setGrade(g);
      setDigitando(false);
      bot(sozinha
        ? (q.eh_aparelho
            ? `Este exame é feito no ${q.nome}. Escolha o melhor dia:`
            : `Quem faz este exame aqui é ${q.nome}. Escolha o melhor dia:`)
        : 'Escolha o melhor dia para você:', sozinha ? undefined : q.nome);
    } catch (err) {
      setDigitando(false);
      setErro((err as Error).message ?? String(err));
    }
  }

  /* ---------------- as escolhas ---------------- */

  async function irParaEspecialidade() {
    setEtapa('especialidade');
    setDigitando(true);
    try {
      const [e, c] = await Promise.all([
        chatEspecialidades(slug), chatConvenios(slug)
      ]);
      setEspecialidades(e); setConvenios(c);
      setDigitando(false);
      if (!e.length) {
        bot('Não há especialidades disponíveis para agendamento online '
            + 'no momento. Por favor, ligue para nós.');
        return;
      }
      bot('Para qual especialidade você quer marcar?');
    } catch (err) {
      setDigitando(false);
      setErro((err as Error).message ?? String(err));
    }
  }

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ A ESPECIALIDADE, E ENTÃO A SUBÁREA — 17/10/2026
   *
   *  O Tom: *"Subespecialidade precisa aparecer depois da
   *  especialidade e não na mesma fila de opções. Eu clico em
   *  ortopedia e depois as opções das subespecialidades."*
   *
   *  ⭐ Quem decide se há um segundo passo é o BANCO, no campo
   *     `tem_subareas`. A tela não conta subárea nem adivinha:
   *     ela pergunta.
   *
   *  ⚠️ E ela não pergunta duas vezes. Se `tem_subareas` for
   *     falso, o passo some inteiro e o paciente vai direto ao
   *     convênio — perguntar "qual subárea?" para uma lista de
   *     um item só é um toque a mais sem informação nenhuma.
   * ════════════════════════════════════════════════════════ */
  async function escolherEspecialidade(e: ItemDoChat) {
    eu(e.nome);

    if (!e.tem_subareas) {
      setEspecialidade(e);
      setEspecialidadePai(null);
      await perguntarConvenio(e.nome, e);
      return;
    }

    setEspecialidadePai(e);
    setEtapa('subespecialidade');
    setDigitando(true);
    try {
      const l = await chatSubespecialidades(slug, e.id);
      setSubareas(l);
      setDigitando(false);

      // ⚠️ Rede: o banco disse que havia subárea e não veio
      //    nenhuma. Não deveria acontecer — as duas respostas
      //    saem da mesma regra, e há um placar que confere isso
      //    em todos os pais. Mas falhar ABERTO aqui deixaria o
      //    paciente numa tela sem botão nenhum, sem erro e sem
      //    saída. Então seguimos com o pai.
      if (!l.length) {
        setEspecialidade(e);
        await perguntarConvenio(e.nome, e);
        return;
      }

      bot(`Dentro de ${e.nome}, o que você procura?`, e.nome);
    } catch (err) {
      setDigitando(false);
      setErro((err as Error).message ?? String(err));
    }
  }

  /**
   * ⭐ `null` = "não sei / qualquer uma": segue com o PAI.
   *
   *   O banco já trata isso sozinho: o médico ligado só à
   *   especialidade-pai é o GERAL e aparece em qualquer
   *   subárea; e pedindo o pai vêm também os das subáreas.
   *   Quem não sabe se é ombro ou coluna vê todo mundo.
   */
  async function escolherSubespecialidade(sub: ItemDoChat | null) {
    const pai = especialidadePai;
    const escolhida = sub ?? pai;
    if (!escolhida) return;

    eu(sub ? sub.nome : 'Não sei dizer');
    setEspecialidade(escolhida);
    await perguntarConvenio(sub ? sub.nome : `${pai?.nome} (qualquer subárea)`, escolhida);
  }

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ A PORTA ÚNICA DA PERGUNTA DO CONVÊNIO   (21/10/2026)
   *
   *  A consulta perguntava em TRÊS lugares, cada um com a sua
   *  cópia da frase. A regra nova ("clínica sem convênio não
   *  pergunta") numa cópia só deixaria as outras duas
   *  perguntando. Agora as três passam por aqui.
   * ════════════════════════════════════════════════════════ */
  async function perguntarConvenio(rotulo: string, esp: ItemDoChat) {
    if (!atendeConvenios) {
      // Sem pergunta e sem bolha de "Particular": a clínica é
      // particular, e o paciente nem precisa saber que convênio
      // existia como opção.
      // ⚠️ A especialidade vai JUNTO: o `setEspecialidade` de quem
      //    chamou ainda não valeu neste instante (o React aplica
      //    depois). Ler o estado aqui buscava médicos de especialidade
      //    nenhuma — a prova do chat pegou.
      await escolherConvenio(null, true, esp);
      return;
    }
    setEtapa('convenio');
    await botPausado('Você vai usar convênio ou é particular?', 420, rotulo);
  }

  async function escolherConvenio(c: ItemDoChat | null, silencioso = false, esp?: ItemDoChat) {
    setConvenio(c);
    if (!silencioso) eu(c?.nome ?? 'Particular');
    if (modoExame) { await listarExames(c); return; }
    setEtapa('medico');
    setDigitando(true);
    try {
      const de = hojeNoFuso(fuso);
      const l = await chatMedicos({
        slug, especialidade: (esp ?? especialidade)!.id,
        convenio: c?.id ?? null,
        nascimento: nascimento || null,
        de, ate: somarDias(de, 90)
      });
      setMedicos(l);
      setDigitando(false);
      if (!l.length) {
        bot(silencioso
            ? 'Não encontrei profissionais com agenda aberta. Por favor, ligue para nós.'
            : 'Não encontrei profissionais com agenda aberta para essa '
              + 'combinação. Tente outro convênio, ou ligue para nós.');
        return;
      }
      bot('Com qual profissional você prefere?', silencioso ? undefined : c?.nome ?? 'Particular');
    } catch (err) {
      setDigitando(false);
      setErro((err as Error).message ?? String(err));
    }
  }

  /**
   * ⭐⭐⭐ DUAS SITUAÇÕES, DUAS RESPOSTAS — 19/10/2026
   *
   * O Tom, recusando a primeira versão (que só apagava os dias
   * do calendário):
   *
   *   *"Quero que avise que já há um agendamento futuro com
   *    esse profissional e informe a data, caso queira
   *    reagendar clique no botão reagendar. No caso do status
   *    atendido só mostrar próxima data disponível pós 30
   *    dias."*
   *
   * Ele está certo, e a razão é boa:
   *
   *   · **já consultou** → é uma ESPERA. Não há nada a fazer
   *     senão voltar depois. O calendário abre na data liberada
   *     e a faixa azul explica.
   *
   *   · **já tem consulta marcada** → é um ENGANO. Quase sempre
   *     a pessoa não lembrava, ou quer MUDAR aquela consulta. A
   *     saída certa não é "não", é reagendar.
   *
   * ⚠️ Tratar as duas como "dia cinza" faria o paciente que já
   *    tem consulta ligar para o hospital para perguntar por
   *    que não consegue marcar — tendo a consulta marcada.
   */
  /** ⭐ "Quero reagendar essa consulta": o calendário abre, mas
      quem grava no fim é o `chat_reagendar`, não o marcar. */
  async function pedirRemarcar() {
    if (!medico) return;
    eu('Quero reagendar essa consulta');
    setCancelando(null);   // o alvo deste caminho é o `jaTemId`
    setRemarcando(true);
    setEtapa('dia');
    setDigitando(true);
    try {
      const hoje = hojeNoFuso(fuso);
      setMinimo(hoje);
      setMotivoMinimo('');
      const inicioMes = hoje.slice(0, 8) + '01';
      setMes(inicioMes);
      const g = await chatGrade(slug, medico.id, inicioMes, somarDias(inicioMes, 62));
      setGrade(g);
      setDigitando(false);
      bot('Escolha a nova data:', medico.nome);
    } catch (err) {
      setDigitando(false);
      setErro((err as Error).message ?? String(err));
    }
  }

  /** "Quero outro profissional": volta um passo, sem perder o
      que já foi respondido antes dele. */
  async function outroProfissional() {
    eu('Escolher outro profissional');
    setMedico(null); setJaTem(null); setRemarcando(false);
    setEtapa('medico');
    bot('Com qual profissional você prefere?');
  }

  async function escolherMedico(m: MedicoDoChat) {
    setMedico(m); eu(m.nome);
    setDigitando(true);
    try {
      const hoje = hojeNoFuso(fuso);
      const pd = await chatPrimeiraData(slug, m.id, cpf);

      // ⭐ O ENGANO: ele já tem consulta com este profissional.
      if (pd?.ja_tem_id && pd.ja_tem_em) {
        setJaTem({ quando: pd.ja_tem_em, servico: pd.ja_tem_servico ?? null });
        setJaTemId(pd.ja_tem_id);
        setDigitando(false);
        setEtapa('ja-tem');
        bot(`Você já tem uma consulta marcada com ${m.nome} em `
            + `${porExtensoNoFuso(pd.ja_tem_em, fuso)} às `
            + `${new Date(pd.ja_tem_em).toLocaleTimeString('pt-BR', {
                 hour: '2-digit', minute: '2-digit', timeZone: fuso })}.`,
            m.nome);
        return;
      }

      // A ESPERA: o calendário abre na data liberada.
      setJaTem(null);
      setEtapa('dia');
      const min = pd?.data_minima && pd.data_minima > hoje ? pd.data_minima : hoje;
      setMinimo(min);
      setMotivoMinimo(
        pd?.data_minima && pd.data_minima > hoje ? (pd.motivo ?? '') : '');

      const inicioMes = min.slice(0, 8) + '01';
      setMes(inicioMes);
      const g = await chatGrade(slug, m.id, inicioMes, somarDias(inicioMes, 62));
      setGrade(g);
      setDigitando(false);
      bot('Escolha o melhor dia para você:', m.nome);
    } catch (err) {
      setDigitando(false);
      setErro((err as Error).message ?? String(err));
    }
  }

  const vagasNoMes = useMemo(
    () => grade ? vagasPorDia(grade) : new Map<string, number>(), [grade]);

  const casinhas = useMemo(() => {
    if (!mes) return [] as (string | null)[];
    const primeiro = new Date(`${mes}T12:00:00`);
    const vazios = primeiro.getDay();
    const ultimo = new Date(primeiro.getFullYear(), primeiro.getMonth() + 1, 0).getDate();
    const fora: (string | null)[] = Array(vazios).fill(null);
    for (let d = 1; d <= ultimo; d++) {
      fora.push(`${mes.slice(0, 8)}${String(d).padStart(2, '0')}`);
    }
    return fora;
  }, [mes]);

  async function andarMes(passo: number) {
    const d = new Date(`${mes}T12:00:00`);
    d.setMonth(d.getMonth() + passo);
    const novo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    setMes(novo);
    setDigitando(true);
    try {
      setGrade(await chatGrade(slug, medico!.id, novo, somarDias(novo, 62)));
    } finally { setDigitando(false); }
  }

  const horasDoDia = useMemo(() => {
    if (!grade || !dia) return [] as number[];
    return vagasDoDiaDaGrade(grade, dia).map(v => v.ini);
  }, [grade, dia]);

  async function escolherDia(d: string) {
    setDia(d); setHora(-1);
    const escrito = new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR');
    eu(escrito);
    setEtapa('hora');
    await botPausado('E o horário?', 420, escrito);
  }

  async function escolherHora(min: number) {
    setHora(min); eu(comoHora(min));
    setEtapa('confirmar');
    await botPausado('Confira se está tudo certo:', 420, comoHora(min));
  }

  /* ---------------- marcar ---------------- */

  async function confirmar() {
    /* ⚠️⚠️⚠️ AQUI O EXAME MORRIA EM SILÊNCIO.   (20/10/2026)

       O Tom: *"o confirmar agendamento de exame não está
       funcionando."*

       Esta linha era `if (!medico || ...) return;` — e exame
       NÃO TEM MÉDICO: tem executor, que pode ser um aparelho.
       O botão era clicado, a função entrava, batia na primeira
       linha e voltava. Sem erro, sem aviso, sem nada.

       ⭐ Guarda copiada de um caminho para outro sem reler o
          que ela guarda. A condição estava escrita sobre a
          CONSULTA, e o exame passou a usar a mesma função.

       ⭐⭐ E o pior era o `return` mudo. Guarda que recusa sem
           dizer nada é indistinguível de botão quebrado — para
           o Tom foi exatamente isso. Agora ela fala. */
    const quemVai = modoExame ? executor : medico;
    if (!quemVai || !grade || hora < 0) {
      setErro('Faltou escolher o dia e o horário. Toque num horário livre.');
      return;
    }
    setEtapa('marcando');
    setErro('');
    setDigitando(true);

    /* ⭐⭐ EXAME: outra porta ainda, e por um motivo que não é
       de organização — o `marcar_exame` grava um PEDIDO, que
       pode ter mais de um exame e precisa caber inteiro no
       horário. A `marcar_consulta` não sabe disso. */
    if (modoExame && executor) {
      try {
        const r = await chatMarcarExame({
          slug, recursoId: executor.id, servicos: pedido,
          inicio: instanteNoFuso(dia, hora, fuso),
          nome, cpf, telefone,
          nascimento: nascimento || null,
          convenioId: convenio?.id ?? null,
          /* ⭐ 26/10: sem a guia o banco recusa com
             `motivo='SEM_PEDIDO'`. Aqui ela SEMPRE existe — o
             caminho sem foto nem chega ao calendário —, mas
             quem garante isso é o banco, não esta linha. */
          anexoId
        });
        setDigitando(false);
        if (!r.ok) { setEtapa('confirmar'); bot(r.mensagem); return; }
        setFeito({
          quando: `${porExtensoNoFuso(instanteNoFuso(dia, hora, fuso), fuso)} às ${comoHora(hora)}`,
          protocolo: (r.pedido_id ?? '').slice(0, 8).toUpperCase()
        });
        setEtapa('pronto');
        bot('Pronto, seu exame está marcado.');
      } catch (err) {
        setDigitando(false);
        setEtapa('confirmar');
        setErro((err as Error).message ?? String(err));
      }
      return;
    }

    /* ⭐ REMARCANDO: quem grava é outra porta.
       
       A tela é a mesma — calendário, horário, resumo —, mas o
       que o banco faz é diferente: mover a consulta que já
       existe, em vez de criar uma segunda. Se o chat chamasse
       `chat_marcar` aqui, o paciente ficaria com DUAS consultas
       e a regra dos 30 dias recusaria a segunda. */
    if (remarcando) {
      /* ⭐ QUAL atendimento mover: o que o paciente escolheu na
         lista (`cancelando`), ou — no caminho do aviso "você já
         tem consulta com este profissional" — o que o banco
         apontou. Um dos dois sempre existe aqui. */
      const alvoId = cancelando?.id ?? jaTemId;
      if (!alvoId) {
        setDigitando(false);
        setEtapa('confirmar');
        setErro('Perdi qual atendimento era. Volte ao início e tente de novo.');
        return;
      }
      try {
        const rr = await chatReagendar(
          slug, cpf, alvoId, instanteNoFuso(dia, hora, fuso));
        setDigitando(false);
        if (!rr.ok) {
          setEtapa('confirmar');
          bot(rr.mensagem);
          return;
        }
        setFeito({
          quando: `${porExtensoNoFuso(instanteNoFuso(dia, hora, fuso), fuso)} às ${comoHora(hora)}`,
          protocolo: (rr.agendamento_id ?? '').slice(0, 8).toUpperCase()
        });
        setEtapa('pronto');
        bot('Pronto, sua consulta foi remarcada. A anterior foi desmarcada.');
      } catch (err) {
        setDigitando(false);
        setEtapa('confirmar');
        setErro((err as Error).message ?? String(err));
      }
      return;
    }

    /* Daqui para baixo é CONSULTA, e consulta tem médico. A
       guarda lá em cima já garantiu que há alguém — aqui a
       checagem é só para o compilador saber qual dos dois. */
    if (!medico) return;

    try {
      const r = await chatMarcar({
        slug,
        recursoId: medico.id,
        servicoId: medico.servico_id,
        inicio: instanteNoFuso(dia, hora, fuso),
        nome, cpf,
        /* ⚠️⚠️⚠️ AQUI ESTAVA O DEFEITO DE 17/10, E ELE ERA ESTA
           LINHA — que dizia:

               telefone: telefone || soDigitos(telefoneFim ?? '')

           `telefoneFim` é a MÁSCARA: `(••) •••••-4321`.
           `soDigitos` dela devolve **'4321'** — quatro dígitos,
           que não são um telefone, são o fim de um.

           Então a tela não mandava "nada": mandava LIXO. E lixo
           é pior que vazio, porque passa pela porta de quem
           pergunta "veio alguma coisa?" e só morre lá no fundo,
           em `length(v_tel) < 10`, com uma mensagem que fala de
           telefone e não fala de máscara.

           ⭐ Isso também explica por que o conserto que eu fiz
              no banco não resolveu: lá eu tinha escrito
              `if v_tel is null then (buscar no cadastro)`, e
              '4321' **não é nulo**. Consertei um lado só de uma
              coisa que tinha dois.

           ⭐⭐ A regra agora é a simples: a tela manda o que o
              paciente DIGITOU, e nada mais. O número do cadastro
              é assunto do banco, que o tem por inteiro. */
        telefone,
        nascimento: nascimento || null,
        convenioId: convenio?.id ?? null
      });
      setDigitando(false);

      /* ⭐⭐⭐ 19/10, NOITE: "é só perguntar se ele quer reagendar"
      
         O Tom, vendo a frase da recepção chegar no celular:
      
           *"Não quero que informe ao paciente que tem que haver
            30 dias entre as duas consultas. É só perguntar se
            ele quer reagendar."*
      
         Aqui o chat já deveria ter avisado lá no passo do
         médico. Quando mesmo assim o banco recusa por JA_TEM —
         porque a consulta nasceu depois, em outra aba, ou pelo
         telefone com a recepção —, a resposta certa não é
         mostrar a regra: é fazer a MESMA pergunta.
      
         ⚠️ A decisão é pelo `motivo`, que é código, e não pela
            frase em português. Regra sobre o mensageiro quebra
            quando o mensageiro muda. */
      if (!r.ok && r.motivo === 'JA_TEM' && medico) {
        try {
          const pd = await chatPrimeiraData(slug, medico.id, cpf);
          if (pd?.ja_tem_id && pd.ja_tem_em) {
            setJaTem({ quando: pd.ja_tem_em, servico: pd.ja_tem_servico ?? null });
            setJaTemId(pd.ja_tem_id);
            setRemarcando(false);
            setEtapa('ja-tem');
            bot(`Você já tem uma consulta marcada com ${medico.nome} em `
                + `${porExtensoNoFuso(pd.ja_tem_em, fuso)} às `
                + `${new Date(pd.ja_tem_em).toLocaleTimeString('pt-BR', {
                     hour: '2-digit', minute: '2-digit', timeZone: fuso })}.`);
            return;
          }
        } catch { /* cai no caminho normal abaixo */ }
      }

      if (!r.ok) {
        setEtapa('confirmar');
        bot(r.mensagem);
        return;
      }

      setFeito({
        quando: `${porExtensoNoFuso(instanteNoFuso(dia, hora, fuso), fuso)} às ${comoHora(hora)}`,
        protocolo: (r.agendamento_id ?? '').slice(0, 8).toUpperCase()
      });
      setEtapa('pronto');
    } catch (e) {
      setDigitando(false);
      setEtapa('confirmar');
      setErro((e as Error).message ?? String(e));
    }
  }

  function recomecar() { window.location.reload(); }



  /* ════════════════════════════════════════════════════════
   *  O DESENHO
   * ════════════════════════════════════════════════════════ */

  if (etapa === 'sem-hospital') {
    return (
      <div className="chat-raiz" data-chat="sem-hospital">
        <div className="chat-vazio">
          <i className="fas fa-hospital" />
          <h2>Não encontrei este hospital</h2>
          <p>
            Confira o endereço que você recebeu, ou procure o hospital pelo
            site dele.
          </p>
        </div>
      </div>
    );
  }

  if (!hospital) {
    return (
      <div className="chat-raiz" data-chat="carregando">
        <div className="chat-vazio"><i className="fas fa-circle-notch fa-spin" /></div>
      </div>
    );
  }

  const inicial = sigla(hospital.nome);
  const precisaCampo =
    ['cpf', 'nome', 'nascimento', 'telefone', 'recado'].includes(etapa);

  /**
   * ⭐ Tudo que o `Passo` precisa, montado UMA vez.
   *
   *   Ele é desenhado em dois lugares — dentro do último balão
   *   do bot e, na rede, solto. Repetir trinta propriedades nos
   *   dois seria repetir trinta chances de passar uma lista num
   *   e esquecer no outro, e a tela erraria num caminho só.
   */
  const propsDoPasso = {
    etapa,
    nomeDoResumo,
    atendeConvenios,
    hospital,   // já garantido não-nulo pela guarda acima
    especialidades,
    subareas,
    especialidadePai,
    convenios,
    medicos,
    especialidade,
    convenio,
    medico,
    nome,
    telefoneFim,
    aceitaAgendamento,
    aceitaWhatsapp,
    aoAceitarAgendamento: setAceitaAgendamento,
    aoAceitarWhatsapp: setAceitaWhatsapp,
    aoSeguirDoLgpd: seguirDoLgpd,
    aoSouEu: souEu,
    aoConfirmarTelefone: confirmarTelefone,
    aoConfirmarRecado: (completa: boolean) => {
      void (completa ? confirmarRecado() : acrescentarAoRecado());
    },
    aoMenu: escolherNoMenu,
    aoVoltarAoMenu: voltarAoMenu,
    aoEspecialidade: escolherEspecialidade,
    aoSubespecialidade: escolherSubespecialidade,
    aoConvenio: escolherConvenio,
    aoMedico: escolherMedico,
    /* ⭐ 19/10, noite */
    meus, cancelando, exames, subtipos, quemFaz, exame, modoExame, pedidoNome,
    itensDoPedido, executor,
    marcados: marcadosDoPedido,
    aoMarcarSubtipo: marcarSubtipo,
    aoSeguirDoSubtipo: seguirDoSubtipo,
    aoVerAgendamento: aoTocarNoAgendamento,
    setores, protocolo,
    aoSetor: escolherSetor,
    aoConfirmarCancelar: confirmarCancelar,
    aoExame: escolherExame,
    aoQuemFaz: (q: QuemFazNoChat) => escolherExecutor(q),
    /* ⭐ 26/10: a guia, a entrevista e o cartaz. */
    anexoId, enviandoFoto,
    paginas, maxPaginas: MAX_PAGINAS,
    aoEnviarFoto: (a: File) => { void enviarFoto(a); },
    aoRemoverPagina: removerPagina,
    aoSeguirDasFotos: () => { void seguirDasFotos(); },
    aoSemFoto: () => { void semAFoto(); },
    perguntasDoPedido, respostas,
    aoResponder: setRespostas,
    aoSeguirDaEntrevista: () => { void seguirDaEntrevista(); },
    orientacoes, soOrientacao,
    aoSeguirDoCartaz: () => { void seguirDoCartaz(); },
    jaTem,
    remarcando,
    aoRemarcar: pedirRemarcar,
    aoOutroProfissional: outroProfissional,
    mes,
    casinhas,
    vagasNoMes,
    minimo,
    motivoMinimo,
    aoAndarMes: andarMes,
    aoDia: escolherDia,
    dia,
    horasDoDia,
    aoHora: escolherHora,
    hora,
    fuso,
    aoConfirmar: confirmar,
    meses: MESES,
    diasCurtos: DIAS_CURTOS
  };

  return (
    <div className={'chat-raiz' + (embutido ? ' embutido' : '')}
         style={estilo} data-chat="aberto"
         data-embutido={embutido ? '1' : '0'}
         data-slug={slug} data-cor={hospital.cor}>

      {/* ---------------- a vitrine ----------------
          Só no computador, e só quando o chat está SOZINHO.
          Embutido no site do hospital ela seria a marca dele
          repetida dentro da própria página dele. */}
      {!embutido && (
      <div className="chat-vitrine" data-bloco="vitrine">
        <div className="chat-vitrine-logo">
          {hospital.logo_url
            ? <img src={hospital.logo_url} alt="" />
            : inicial}
        </div>
        <h2>{hospital.nome}</h2>
        <p className="chat-tagline">{hospital.tagline}</p>

        <div className="chat-vantagem">
          <i className="fas fa-calendar-check" />
          <div>
            <strong>Agendamento online</strong>
            <span>Marque sua consulta em minutos</span>
          </div>
        </div>
        <div className="chat-vantagem">
          <i className="fas fa-user-md" />
          <div>
            <strong>Nossos especialistas</strong>
            <span>Escolha o profissional e o horário</span>
          </div>
        </div>
        <div className="chat-vantagem">
          <i className="fas fa-shield-heart" />
          <div>
            <strong>Convênios atendidos</strong>
            <span>A lista aparece na hora de marcar</span>
          </div>
        </div>

        {/* ⭐ O contato sai do cadastro do hospital. Vazio, a
            linha inteira não aparece — melhor que "Telefone:
            undefined" na cara do paciente. */}
        {(hospital.telefone || hospital.endereco
          || hospital.horario || hospital.cnpj) && (
          <div className="chat-vitrine-contato">
            {!!hospital.telefone && (
              <p><i className="fas fa-phone" /> {hospital.telefone}</p>
            )}
            {!!hospital.endereco && (
              <p><i className="fas fa-map-marker-alt" /> {hospital.endereco}</p>
            )}
            {!!hospital.horario && (
              <p><i className="fas fa-clock" /> {hospital.horario}</p>
            )}
            {/* ⭐ O CNPJ por último e menor: é o dado de que o
                paciente menos precisa, e o que mais tranquiliza
                quem desconfia da página. */}
            {!!hospital.cnpj && (
              <p className="chat-vitrine-cnpj" data-campo="cnpj">
                CNPJ {formatarCNPJ(hospital.cnpj)}
              </p>
            )}
          </div>
        )}
      </div>
      )}

      {/* ---------------- a janela da conversa ---------------- */}
      <div className="chat-janela">

        <header className="chat-topo">
          <div className="chat-topo-logo">
            {hospital.logo_url
              ? <img src={hospital.logo_url} alt="" />
              : inicial}
          </div>
          <div className="chat-topo-texto">
            <h1>{hospital.nome}</h1>
            <span><i className="fas fa-circle" /> Agendamento online</span>
          </div>
          <button onClick={recomecar} title="Recomeçar"
                  data-acao="recomecar" aria-label="Recomeçar">
            <i className="fas fa-redo" />
          </button>
        </header>

        <div className="chat-corpo" ref={corpoRef} data-bloco="conversa">
          {/* ════════════════════════════════════════════════
            *  ⭐⭐⭐ OS BOTÕES MORAM DENTRO DO BALÃO — 17/10
            *
            *  O Tom, comparando com o chat do Apps Script:
            *  *"o chat da versão apps script tá mais bonito"*.
            *
            *  Pondo os prints dele lado a lado com o meu, a
            *  diferença que mais pesa não é cor nem sombra: é
            *  que lá a pergunta e a lista são **um cartão
            *  branco só**, e aqui a pergunta era um balão e os
            *  botões ficavam soltos no fundo cinza.
            *
            *  Solto, cada botão parece um balão de mensagem
            *  separado — a tela vira uma pilha de retângulos
            *  sem dono. Dentro do balão, a lista é claramente
            *  *a resposta àquela pergunta*.
            *
            *  ⭐ Por isso o `<Passo>` é desenhado AQUI DENTRO,
            *     no último balão do bot, em vez de ser irmão
            *     dele. É uma linha de JSX e muda a tela
            *     inteira.
            * ════════════════════════════════════════════════ */}
          {falas.map((f, i) => {
            // O passo pertence à ÚLTIMA fala, e só se ela for do
            // bot: pergunta é do bot, resposta é botão.
            const leva = f.de === 'bot'
                      && i === falas.length - 1
                      && !digitando;
            return (
              <div key={f.id}
                   className={'chat-fala ' + f.de + (leva ? ' com-passo' : '')}>
                <div className={'chat-balao ' + f.de} data-fala={f.de}>
                  {/* ⭐ O eco da escolha, em negrito, com o ✅ —
                      a mesma forma do chat de hoje. */}
                  {!!f.eco && (
                    <p data-eco={f.eco}><strong>{f.eco}</strong> ✅</p>
                  )}
                  {f.texto}
                  {leva && <Passo {...propsDoPasso} />}
                </div>
                <div className="chat-marca-hora">{f.hora}</div>
              </div>
            );
          })}

          {digitando && (
            <div className="chat-digitando" data-bloco="digitando">
              <i /><i /><i />
            </div>
          )}

          {/* ⚠️ A rede: se por algum caminho a última fala NÃO
              for do bot, o passo não teria onde morar e a tela
              ficaria sem botão nenhum — sem erro, que é o pior
              jeito de quebrar. Aqui ele aparece solto: feio,
              mas funcionando. */}
          {!digitando
            && !(falas.length > 0 && falas[falas.length - 1]!.de === 'bot') && (
            <div className="chat-fala bot com-passo" data-bloco="passo-solto">
              <div className="chat-balao bot">
                <Passo {...propsDoPasso} />
              </div>
            </div>
          )}

          {!!erro && (
            <div className="chat-aviso erro" data-aviso="erro">{erro}</div>
          )}
        </div>

        {/* ---------------- digitar ---------------- */}
        {precisaCampo && (
          <div className="chat-rodape" data-bloco="rodape">
            <div className="chat-campo">
              <input
                data-campo="texto"
                /* ⭐⭐ `inputMode` muda o TECLADO que abre: numérico
                   para CPF e telefone. É o que separa "digitei o
                   CPF em 4 segundos" de "procurei os números". */
                inputMode={etapa === 'nome' || etapa === 'recado'
                            ? 'text' : 'numeric'}
                autoComplete={etapa === 'nome' ? 'name'
                            : etapa === 'telefone' ? 'tel' : 'off'}
                enterKeyHint="send"
                value={campo}
                maxLength={etapa === 'recado' ? 2000 : undefined}
                placeholder={
                  etapa === 'cpf' ? '000.000.000-00'
                  : etapa === 'nome' ? 'Nome completo'
                  : etapa === 'nascimento' ? 'dd/mm/aaaa'
                  : etapa === 'recado'
                    ? (rascunho ? 'Continue sua mensagem…' : 'Escreva sua mensagem…')
                  : '(11) 99999-9999'}
                onChange={e => { setCampo(e.target.value); setErro(''); }}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return;
                  if (etapa === 'cpf') void enviarCpf();
                  else if (etapa === 'nome') void enviarNome();
                  else if (etapa === 'nascimento') void enviarNascimento();
                  else if (etapa === 'telefone') void enviarTelefone();
                  else if (etapa === 'recado') void enviarRecado();
                }}
              />
              <button data-acao="enviar"
                      disabled={!campo.trim()}
                      aria-label="Enviar"
                      onClick={() => {
                        if (etapa === 'cpf') void enviarCpf();
                        else if (etapa === 'nome') void enviarNome();
                        else if (etapa === 'nascimento') void enviarNascimento();
                        else if (etapa === 'telefone') void enviarTelefone();
                        else if (etapa === 'recado') void enviarRecado();
                      }}>
                <i className="fas fa-paper-plane" />
              </button>
            </div>
            <p className="chat-selo">
              <i className="fas fa-lock" /> Seus dados estão protegidos
            </p>
          </div>
        )}
      </div>

      {/* ---------------- pronto ---------------- */}
      {etapa === 'pronto' && !!feito && (
        <div className="chat-pronto" data-modal="pronto">
          <div className="chat-pronto-caixa">
            <div className="chat-icone"><i className="fas fa-check" /></div>
            <h2>Agendamento confirmado!</h2>
            <p>Enviaremos a confirmação no seu WhatsApp.</p>

            <div className="chat-resumo">
              <div className="chat-resumo-titulo">Seu atendimento</div>
              <div className="chat-resumo-linha">
                <span>Quando</span><strong>{feito.quando}</strong>
              </div>
              {/* ⭐ 20/10: no exame, "Com" e "Especialidade" saíam
                  EM BRANCO na tela final — os mesmos dois campos
                  vazios que o Tom já tinha recusado no resumo. */}
              {modoExame ? (
                <>
                  <div className="chat-resumo-linha">
                    <span>Exame</span><strong>{pedidoNome || exame?.nome}</strong>
                  </div>
                  {(!!exame?.setor || !!executor?.eh_aparelho) && (
                    <div className="chat-resumo-linha" data-linha="onde-pronto">
                      <span>Onde</span><strong>{exame?.setor || executor?.nome}</strong>
                    </div>
                  )}
                  {!!executor && !executor.eh_aparelho && (
                    <div className="chat-resumo-linha">
                      <span>Com</span><strong>{executor.nome}</strong>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="chat-resumo-linha">
                    <span>Com</span><strong>{medico?.nome}</strong>
                  </div>
                  <div className="chat-resumo-linha">
                    <span>Especialidade</span><strong>{especialidade?.nome}</strong>
                  </div>
                </>
              )}
              <div className="chat-resumo-linha">
                <span>Protocolo</span><strong>{feito.protocolo}</strong>
              </div>
            </div>

            {!!hospital.endereco && (
              <div className="chat-aviso info" data-aviso="onde">
                <strong>Onde</strong>{hospital.endereco}
              </div>
            )}

            <button className="chat-opcao forte"
                    data-acao="fechar-pronto" onClick={recomecar}>
              <i className="fas fa-thumbs-up" /> Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
