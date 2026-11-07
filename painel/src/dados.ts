import { todasAsLinhas } from '../../nucleo/paginar';
import { supabase } from './supabase';

/**
 * ============================================================
 *  O QUE A TELA PEDE AO BANCO
 *
 *  Todas as idas ao banco moram aqui. A tela não monta consulta;
 *  ela chama uma função com nome de pergunta.
 *
 *  ------------------------------------------------------------
 *  O ORÇAMENTO DE CONSULTAS
 *
 *  Cada função declara quantas idas ao banco faz, e o número
 *  está no comentário porque ele é um compromisso.
 *
 *  O sistema antigo ficou lento por um motivo com nome: a aba de
 *  agendamentos era lida até 120 vezes na mesma execução. Não
 *  era o Google Sheets sendo devagar — era uma leitura por item
 *  dentro de um laço. Postgres com o mesmo padrão fica lento
 *  igual.
 *
 *  A regra é simples e não tem exceção: NENHUMA consulta dentro
 *  de laço. Precisa de vários? Um `in (...)` só.
 *
 *  ------------------------------------------------------------
 *  Repare que nenhuma função filtra por cliente para se
 *  proteger. Quem filtra é o banco, pelas políticas de
 *  isolamento. O `.eq('cliente_id', ...)` que aparece aqui
 *  escolhe QUAL hospital olhar quando a pessoa serve mais de um
 *  — pedir outro devolveria vazio de qualquer jeito.
 *
 *  ------------------------------------------------------------
 *  POR QUE OS NOMES AQUI NÃO SÃO OS NOMES DAS TABELAS
 *
 *  As tabelas moram em `core` e `agenda`. O painel não encosta
 *  nelas: fala com as visões de `public`, criadas no
 *  `banco/006_api.sql` e `banco/007_tarjas.sql`.
 *
 *  O Supabase publica só o schema `public`. Pedir
 *  `from('agendamentos')` procuraria `public.agendamentos`, que
 *  não existe — e a tela viria vazia, sem erro nenhum.
 * ============================================================
 */

export interface Cliente {
  id: string;
  nome: string;
  slug: string;
  demo: boolean;
}

export interface Consulta {
  id: string;
  inicio: string;
  fim: string;
  duracao_min: number;
  situacao: string;
  origem: string;
  observacoes: string | null;

  /** O id, não só o nome: corrigir cadastro e reagendar precisam dele. */
  paciente_id: string;
  paciente: string;
  paciente_cpf: string | null;
  paciente_telefone: string | null;
  paciente_email: string | null;

  recurso_id: string;
  recurso: string;
  servico_id: string;
  servico: string;
  tipo: 'consulta' | 'exame' | 'procedimento';
  convenio: string | null;

  criado_em: string;

  /** 🟪 vaga aberta à mão, fora da grade */
  eh_encaixe: boolean;
  /**
   * 🟥 os nomes de quem divide o horário SEM declaração, ou null.
   *
   * ⭐ 31/10: o Tom, sobre as 317 sobreposições da agenda
   *    importada — *"Se trata de encaixe."* Estas aqui pararam
   *    de cair nesta coluna: sobreposição que os DOIS lados
   *    declararam (`conflito_aceito`, que só a importação
   *    escreve) é herança, não alarme. Ver `banco/062`.
   */
  conflito_com: string | null;
  /**
   * 🟪 os nomes de quem divide o horário COM declaração — o
   * encaixe e a herança do Apps Script.
   *
   * ⚠️ Existe para a recepção não ficar CEGA quando a tarja
   *    vermelha sai: três pacientes em meia hora continua sendo
   *    coisa que se precisa saber. O que muda é o que a tela
   *    pede — "saiba", e não "ligue para um dos dois".
   */
  divide_horario_com: string | null;
  /** 🟪 esta consulta já gerou retorno */
  tem_retorno: boolean;
  retorno_em: string | null;
  /** 🟦 cancelada porque o paciente foi para outro dia */
  reagendado_para_quando: string | null;

  /**
   * O relógio DESTE hospital.
   *
   * Vem junto com a linha, e não numa consulta à parte, porque
   * toda hora na tela depende dele — pedir separado seria uma
   * ida ao banco por tela, e abriria a janela para a tela
   * desenhar antes de saber o fuso.
   */
  fuso: string;
}

const COLUNAS = `
  id, inicio, fim, duracao_min, situacao, origem, observacoes,
  paciente_id, paciente, paciente_cpf, paciente_telefone, paciente_email,
  recurso_id, recurso, servico_id, servico, tipo, convenio, criado_em,
  eh_encaixe, conflito_com, divide_horario_com,
  tem_retorno, retorno_em, reagendado_para_quando,
  fuso
`;

/** A quais clientes eu tenho acesso. 1 consulta. */
export async function meusClientes(): Promise<Cliente[]> {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nome, slug, demo')
    .order('nome');
  if (error) throw error;
  return (data ?? []) as Cliente[];
}

/* ⚠️ `modulosDoCliente` saiu daqui em 11/10/2026.
 *
 *  Ela devolvia uma LISTA de módulos ligados, e a tela não tinha
 *  como distinguir "ligado" de "vence em três dias". Com a
 *  validade passando a valer, essa diferença virou a diferença
 *  entre avisar o hospital e deixar as telas sumirem caladas.
 *
 *  Quem responde agora é `modulosDoClienteDetalhe`, lá embaixo,
 *  que traz a SITUAÇÃO de cada um. Manter as duas deixaria no
 *  sistema uma função que responde a mesma pergunta pela metade
 *  — e meia resposta é como a visão de módulos passou dois meses
 *  ignorando `expira_em`. */

/** A cara do cliente: tema, logo, endereço, CNPJ. 1 consulta. */
export async function configDoCliente(
  clienteId: string
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('clientes_config')
    .select('chave, valor')
    .eq('cliente_id', clienteId);
  if (error) throw error;

  const fora: Record<string, unknown> = {};
  for (const linha of data ?? []) fora[linha.chave as string] = linha.valor;
  return fora;
}

/**
 * As consultas de um intervalo. 1 consulta ao banco.
 *
 * Paciente, médico, serviço, convênio E as quatro tarjas vêm na
 * MESMA ida — as junções estão dentro da visão `agenda_dia`.
 *
 * A forma errada seria buscar a agenda e depois, num laço,
 * perguntar para cada uma se tem conflito ou retorno. Numa
 * agenda de 60 pacientes isso seriam 121 idas ao banco. É
 * exatamente o padrão que transformou "montar uma lista" em três
 * minutos de espera no sistema antigo.
 *
 * Cancelados VÊM, ao contrário da primeira versão desta tela. A
 * recepção precisa enxergar o que foi desmarcado — e um
 * cancelado que na verdade foi reagendado carrega a tarja azul
 * dizendo para onde o paciente foi. O filtro de status decide o
 * que aparece; a busca traz tudo.
 */
export async function consultasNoPeriodo(
  clienteId: string,
  deISO: string,
  ateISO: string,
  tipo: 'consulta' | 'exame' | null = null,
  /**
   * Só a agenda DESTE médico. O Calendário do Médico pede
   * assim; a tela de Agendamentos não passa nada e recebe
   * todos.
   *
   * O filtro vai no BANCO, e não num `.filter()` depois:
   * trazer a agenda inteira do hospital para mostrar a de um
   * médico é carregar 60 linhas para desenhar 8 — e cresce com
   * o hospital, não com a tela.
   */
  recursoId: string | null = null,
  /**
   * ⚠️⚠️⚠️ O TETO. NASCEU DE UM TIMEOUT EM PRODUÇÃO (28/10/2026).
   *
   *  O Tom importou a agenda de verdade, clicou em **Todos** e
   *  levou `canceling statement due to statement timeout`.
   *
   *  A aba Todos pede de um ano atrás a dois anos à frente. Na
   *  agenda dele isso são **10.145 consultas**, que viram
   *  **9,7 MB de JSON** — o banco monta, a rede carrega, o
   *  navegador converte em dez mil objetos, e só então a tela
   *  filtra. Mesmo depois de a trava de linha ficar rápida
   *  (`banco/058`), montar essa resposta leva 3,2 s.
   *
   *  ⭐ Nenhuma recepção lê dez mil linhas. Quem clica em Todos
   *     está procurando alguém — e procurar é o que a busca faz,
   *     agora dentro do banco (`buscarConsultas`).
   *
   *  `null` = sem teto, que é o que as outras abas usam: um dia,
   *  uma semana ou um mês cabem inteiros.
   */
  limite: number | null = null
): Promise<Consulta[]> {
  const comeco = new Date(`${deISO}T00:00:00`);
  const fim = new Date(`${ateISO}T00:00:00`);
  fim.setDate(fim.getDate() + 1);

  const montar = () => {
    let q = supabase
      .from('agenda_dia')
      .select(COLUNAS)
      .eq('cliente_id', clienteId)
      .gte('inicio', comeco.toISOString())
      .lt('inicio', fim.toISOString())
      .order('inicio')
      /* ⭐ Desempate pelo id: com páginas, a ordem tem que ser a
         MESMA de um pedido para o outro. Duas consultas no mesmo
         instante podiam trocar de lugar entre as páginas — uma
         aparecendo duas vezes, a outra sumindo. */
      .order('id');
    if (tipo) q = q.eq('tipo', tipo);
    if (recursoId) q = q.eq('recurso_id', recursoId);
    return q;
  };

  /* Com teto (a aba Todos), um pedido só — o teto é de propósito, e
     a tela avisa que ele existe. */
  if (limite) {
    const { data, error } = await montar().limit(limite);
    if (error) throw error;
    return (data ?? []) as unknown as Consulta[];
  }

  /* ⭐⭐⭐ 29/10 — SEM teto: TODAS, em páginas (`nucleo/paginar`).
     Um pedido só voltava no máximo 1.000 linhas — o padrão do
     Supabase, cortado em silêncio. "Este mês" de outubro parava em
     08/10, e os cartões somavam exatamente 1.000. */
  return todasAsLinhas<Consulta>(async (de, ate) => {
    const { data, error } = await montar().range(de, ate);
    if (error) throw error;
    return (data ?? []) as unknown as Consulta[];
  });
}

/**
 * ⭐⭐⭐ PROCURAR UM PACIENTE EM TODA A AGENDA. 1 consulta.
 *
 *  A busca da tela sempre peneirou o que já estava carregado —
 *  rápido enquanto a recepção digita, e certo enquanto o que
 *  está carregado é um dia ou uma semana.
 *
 *  Na aba **Todos** isso deixa de valer: o que está carregado
 *  passou a ser um teto de linhas, então peneirar aqui acharia
 *  só dentro do teto. Quem procura "Maria" quer a Maria de
 *  março, não a Maria que coube na página.
 *
 *  Então a busca de Todos vai ao banco, sem limite de data.
 *
 *  ⚠️ `ilike` com `%` na frente não usa índice: ele varre. O que
 *     torna isso viável não é um índice — é a trava de linha ter
 *     deixado de rodar uma vez por linha (`banco/058`). Medido
 *     na agenda do Tom, procurando "maria" em 10.145 consultas:
 *
 *         antes do 058 .......... 6.331 ms  (o Supabase corta em 8.000)
 *         depois ................... 608 ms
 *
 *  ⚠️ E o teto continua: uma busca por "a" casaria com quase
 *     tudo, e a tela voltaria ao problema que ela está
 *     resolvendo.
 */
export async function buscarConsultas(p: {
  clienteId: string;
  termo: string;
  tipo?: 'consulta' | 'exame' | null;
  limite?: number;
}): Promise<Consulta[]> {
  const termo = p.termo.trim();
  if (termo.length < 3) return [];
  const digitos = termo.replace(/\D/g, '');

  /* Nome por texto; CPF e telefone por dígito — porque quem
     digita põe ponto e traço, e o banco guarda sem. É a mesma
     regra da peneira do navegador, agora escrita uma vez do
     lado do banco. */
  const pedacos = [`paciente.ilike.*${termo}*`];
  if (digitos.length >= 3) {
    pedacos.push(`paciente_cpf.ilike.*${digitos}*`);
    pedacos.push(`paciente_telefone.ilike.*${digitos}*`);
  }

  let q = supabase
    .from('agenda_dia')
    .select(COLUNAS)
    .eq('cliente_id', p.clienteId)
    .or(pedacos.join(','))
    .order('inicio', { ascending: false })
    .limit(p.limite ?? 300);

  if (p.tipo) q = q.eq('tipo', p.tipo);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Consulta[];
}

/**
 * Uma consulta pelo id. 1 consulta.
 *
 * Existe para o card de detalhes poder ser aberto por link
 * direto, sem depender do que já estava carregado na lista. O
 * sistema de hoje procura na lista em memória (`agendamentosCache
 * .find`) — e por isso o card não abre se a consulta estiver fora
 * do filtro escolhido.
 */
export async function consultaPorId(id: string): Promise<Consulta | null> {
  const { data, error } = await supabase
    .from('agenda_dia')
    .select(COLUNAS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as Consulta | null;
}

/* ============================================================
 *  AS AÇÕES DA RECEPÇÃO
 *
 *  Escrever é diferente de ler. A leitura passa pelas visões; a
 *  escrita passa por uma FUNÇÃO no banco — `mudar_situacao` —
 *  porque ela carrega três regras que um `update` solto não
 *  garantiria:
 *
 *   · cancelar exige motivo
 *   · a auditoria registra quem fez
 *   · nem toda mudança vale (COMPARECEU não volta a FALTOU)
 *
 *  A função é `security invoker`: o isolamento continua sendo do
 *  banco. Ela acrescenta regra, não contorna trava — e o
 *  `teste_isolamento.sql` afirma isso em três casos.
 * ============================================================ */

export interface MotivoCancelamento {
  motivo: string;
  rotulo: string;
  publico: string;
  pede_detalhe: boolean;
}

export interface Resposta {
  ok: boolean;
  mensagem: string;
  situacao: string | null;
}

/** Os motivos que a recepção escolhe ao cancelar. 1 consulta. */
export async function motivosDeCancelamento(
  clienteId: string
): Promise<MotivoCancelamento[]> {
  const { data, error } = await supabase
    .from('motivos_cancelamento')
    .select('motivo, rotulo, publico, pede_detalhe')
    .eq('cliente_id', clienteId)
    .order('ordem');
  if (error) throw error;
  return (data ?? []) as MotivoCancelamento[];
}

/**
 * Compareceu, Faltou, Confirmado, Cancelado. 1 chamada.
 *
 * Devolve `ok: false` com a explicação em vez de erro, porque
 * "não dá para fazer isso" é uma RESPOSTA, não uma falha — e a
 * recepção precisa ler o motivo, não ver uma tela vermelha.
 */
export async function mudarSituacao(
  id: string,
  nova: string,
  motivo?: string,
  detalhe?: string
): Promise<Resposta> {
  const { data, error } = await supabase.rpc('mudar_situacao', {
    p_id: id,
    p_nova: nova,
    p_motivo: motivo ?? null,
    p_detalhe: detalhe ?? null
  });
  if (error) throw error;
  // A função devolve uma tabela de uma linha.
  const linha = Array.isArray(data) ? data[0] : data;
  return (linha ?? { ok: false, mensagem: 'O banco não respondeu.', situacao: null }) as Resposta;
}

/* ============================================================
 *  MARCAR
 *
 *  ------------------------------------------------------------
 *  O BANCO ENTREGA OS INGREDIENTES; QUEM COZINHA É O NÚCLEO
 *
 *  Não existe `horariosLivres()` aqui, e a ausência é
 *  deliberada. "Quais horários dá para vender neste dia" tem
 *  UMA resposta no projeto: `nucleo/vagas.ts`, função pura, 29
 *  testes e 5 mutantes.
 *
 *  Uma segunda implementação em SQL — ou aqui — seria a quinta
 *  vez que duas versões da mesma pergunta nascem para
 *  discordar em silêncio depois.
 *
 *  `gradeDoPeriodo` traz expedientes, bloqueios e ocupados. A
 *  tela monta as vagas com o núcleo.
 * ============================================================ */

export interface Medico {
  id: string;
  nome: string;
  duracao_min: number;
  ativo: boolean;
  /** "Ortopedia · Coluna, Clínica Geral" — já com o pai na frente */
  especialidades: string;
  faz_consulta: boolean;
  faz_exame: boolean;
  /** "Unimed (4/dia), Bradesco" — vazio quando atende todos */
  convenios: string;
  /**
   * ⭐ Vazio em `convenios` NÃO quer dizer "nenhum": quer dizer
   * TODOS. Sem esta coluna a tela mostraria uma célula em branco
   * para o médico que atende o hospital inteiro — o contrário do
   * que é verdade.
   */
  todos_convenios: boolean;
  idade_min: number | null;
  idade_max: number | null;
  idade_obs: string | null;
}

export interface Servico {
  id: string;
  nome: string;
  tipo: 'consulta' | 'exame' | 'procedimento';
  duracao_min: number | null;
  especialidade_id: string | null;
  preparo: string | null;
  horas_preparo: number | null;
  exige_autorizacao: boolean;
  /** vazio = todos os médicos atendem */
  recursos: string[];
}

export interface Convenio {
  id: string;
  nome: string;
  registro_ans: string | null;
  ativo: boolean;
  /** ⭐ 31/10: vai no cabeçalho da guia TISS impressa. */
  logo_url: string | null;
  /* ⭐⭐⭐ 02/11: os três do módulo Faturamento.
     ⚠️ Eles existem na TABELA desde o `068` e só chegaram à
        VISÃO `public.convenios` no mesmo arquivo. Coluna nova
        no core não entra sozinha na visão — foi o erro de
        01/11, com a logo, que quebrou a tela em produção com
        1.246 casos verdes. */
  prestador_id: string | null;
  codigo_na_operadora: string | null;
  registro_ans_2: string | null;
}

export interface Paciente {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  nascimento: string | null;
}

/** O que o banco entrega para o núcleo montar as vagas. */
export interface Grade {
  fuso: string;
  duracao_min: number;
  de: string;
  ate: string;
  expedientes: {
    dia_semana: number;
    inicio_min: number;
    fim_min: number;
    intervalo_inicio: number | null;
    intervalo_fim: number | null;
    semanas_do_mes: number[];
    ativo: boolean;
  }[];
  bloqueios: {
    dia: string;
    hora_inicio_min: number | null;
    hora_fim_min: number | null;
    motivo: string | null;
  }[];
  ocupados: { dia: string; inicio_min: number; fim_min: number }[];

  /**
   * ------------------------------------------------------------
   *  AS DUAS ABERTURAS CHEGAM EM CHAVES SEPARADAS
   *
   *  `extras` é expediente a mais numa data. Entra no cálculo
   *  junto com o expediente normal, vira vaga de verdade, e o
   *  paciente VÊ.
   *
   *  `encaixes` é vaga aberta à mão. O paciente NUNCA vê — nem
   *  no chat, nem na campanha.
   *
   *  Vêm separadas e não somadas de propósito. Para um encaixe
   *  vazar para o caminho do paciente, alguém precisaria
   *  escrever `encaixes` numa linha onde hoje ela não está — e
   *  não apenas esquecer um `if`.
   * ------------------------------------------------------------
   */
  extras: { dia: string; inicio_min: number; fim_min: number;
            motivo: string | null }[];
  encaixes: { id: string; dia: string; inicio_min: number; fim_min: number;
              motivo: string | null }[];

  erro?: string;
}

export interface DataMinima {
  data_minima: string;
  motivo: string;
  ultima_em: string | null;
  dias_retorno: number;
}

/**
 * Os médicos do cliente. 1 consulta.
 *
 * `so_ativos = false` é para a tela de CADASTRO, que precisa
 * enxergar quem foi desativado — senão desativar alguém por
 * engano é irreversível pela tela.
 *
 * Quem marca consulta continua recebendo só os ativos, por
 * padrão: oferecer médico desativado na agenda seria vender uma
 * vaga que não existe.
 */
export async function medicosDoCliente(
  clienteId: string, soAtivos = true
): Promise<Medico[]> {
  let q = supabase
    .from('medicos')
    // ⚠️ Uma string literal só, sem concatenar: o supabase-js lê
    //    este texto em tempo de tipo para saber o que volta, e uma
    //    soma de pedaços vira `string` genérica — o TypeScript
    //    passa a achar que o retorno é erro.
    .select('id, nome, duracao_min, ativo, especialidades, faz_consulta, faz_exame, convenios, todos_convenios, idade_min, idade_max, idade_obs')
    .eq('cliente_id', clienteId)
    .order('nome');
  if (soAtivos) q = q.eq('ativo', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Medico[];
}

/** Os serviços do cliente. 1 consulta. */
export async function servicosDoCliente(
  clienteId: string,
  tipo: 'consulta' | 'exame' | null = null
): Promise<Servico[]> {
  let q = supabase
    .from('servicos')
    .select('id, nome, tipo, duracao_min, especialidade_id, preparo, horas_preparo, exige_autorizacao, recursos')
    .eq('cliente_id', clienteId)
    .order('nome');
  if (tipo) q = q.eq('tipo', tipo);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Servico[];
}

/** Os convênios do cliente. 1 consulta. */
export async function conveniosDoCliente(
  clienteId: string, soAtivos = true
): Promise<Convenio[]> {
  let q = supabase
    .from('convenios')
    /* ⚠️ 03/11: as colunas num texto SÓ. Somado com `+`, o Supabase
       não deduz o formato da resposta, e o `tsc` (que a Cloudflare
       roda) recusa a conversão para Convenio[] — a publicação
       falhava. */
    .select('id, nome, registro_ans, ativo, logo_url, prestador_id, codigo_na_operadora, registro_ans_2')
    .eq('cliente_id', clienteId)
    .order('nome');
  if (soAtivos) q = q.eq('ativo', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Convenio[];
}

/**
 * Procura paciente por CPF, telefone ou nome. 1 consulta.
 *
 * Quem compara é o banco, e por DÍGITO — a recepção digita com
 * ponto e traço, o banco guarda limpo, e comparar o texto cru
 * não acha ninguém. O defeito aparece como "não cadastrado", aí
 * alguém cadastra de novo, e nasce a duplicata.
 */
export async function buscarPaciente(
  clienteId: string,
  termo: string
): Promise<Paciente[]> {
  if ((termo ?? '').trim().length < 3) return [];
  const { data, error } = await supabase.rpc('buscar_paciente', {
    p_cliente: clienteId,
    p_termo: termo
  });
  if (error) throw error;
  return (data ?? []) as Paciente[];
}

/**
 * A partir de que dia a agenda deste médico abre para este
 * paciente. 1 consulta.
 *
 * A regra dos 30 dias não é um "não": é um PISO. O calendário
 * começa nesta data, e o dia proibido não chega a aparecer.
 */
export async function primeiraDataPossivel(
  recursoId: string,
  pacienteId: string | null
): Promise<DataMinima | null> {
  const { data, error } = await supabase.rpc('primeira_data_possivel', {
    p_recurso: recursoId,
    p_paciente: pacienteId
  });
  if (error) throw error;
  const linha = Array.isArray(data) ? data[0] : data;
  return (linha ?? null) as DataMinima | null;
}

/**
 * ⭐⭐⭐ OS DIAS QUE A REGRA DOS 30 DIAS TRAVA — 19/10/2026
 *
 * O piso (`primeiraDataPossivel`) empurra o calendário para
 * frente e resolve o caso de quem JÁ consultou. Mas desde hoje a
 * regra vale para os dois lados: uma consulta já MARCADA trava
 * os 30 dias em volta dela, inclusive para trás.
 *
 * Piso é uma reta; a regra é uma janela. Esta consulta devolve
 * os dias travados dentro do período — e o calendário os apaga,
 * em vez de oferecer e depois recusar.
 *
 * 1 consulta por período, como a grade.
 */
export async function diasTravadosDoRetorno(
  recursoId: string,
  pacienteId: string | null,
  deISO: string,
  ateISO: string,
  servicoId?: string | null
): Promise<Map<string, string>> {
  if (!pacienteId) return new Map();
  const { data, error } = await supabase.rpc('dias_travados_do_retorno', {
    p_recurso: recursoId,
    p_paciente: pacienteId,
    p_de: deISO,
    p_ate: ateISO,
    p_servico: servicoId ?? null
  });
  if (error) throw error;
  const m = new Map<string, string>();
  for (const l of (data ?? []) as { dia: string; motivo: string }[]) {
    m.set(l.dia, l.motivo);
  }
  return m;
}

/**
 * Expedientes, bloqueios e ocupados de um período. 1 consulta.
 *
 * Uma ida por PERÍODO, não por dia. O calendário do mês
 * pergunta uma vez e desenha 31 casinhas — perguntar por dia
 * seriam 31 idas, que é o padrão que fez a lista demorar três
 * minutos no sistema antigo.
 */
export async function gradeDoPeriodo(
  recursoId: string,
  deISO: string,
  ateISO: string
): Promise<Grade> {
  const { data, error } = await supabase.rpc('grade_do_periodo', {
    p_recurso: recursoId,
    p_de: deISO,
    p_ate: ateISO
  });
  if (error) throw error;
  return (data ?? { expedientes: [], bloqueios: [], ocupados: [],
                    extras: [], encaixes: [] }) as Grade;
}

export interface RespostaMarcar {
  ok: boolean;
  mensagem: string;
  agendamento_id: string | null;
  paciente_id: string | null;
  /**
   * ⭐ O QUE a recusa foi, classificado pelo BANCO.
   *
   * 'LIMITE' = cheio o limite diário do convênio
   * 'IDADE'  = fora da faixa etária do médico
   * null     = qualquer outra recusa, ou sucesso
   *
   * Existe para a tela não precisar LER A FRASE para saber que
   * botão oferecer. `if (/limite/.test(mensagem))` funcionaria
   * hoje e sumiria no dia em que alguém melhorasse a frase —
   * sem erro e sem aviso.
   */
  motivo: 'LIMITE' | 'IDADE' | null;
}

/** Grava. O paciente novo nasce na mesma transação. 1 chamada. */
export async function marcarConsulta(p: {
  clienteId: string;
  recursoId: string;
  servicoId: string;
  /** instante absoluto, ISO */
  inicio: string;
  pacienteId?: string | null;
  nome?: string;
  cpf?: string;
  telefone?: string;
  email?: string;
  nascimento?: string | null;
  convenioId?: string | null;
  observacoes?: string;
  ehEncaixe?: boolean;
  /**
   * ⭐ As duas confirmações, separadas de propósito.
   *
   *    Furar o limite da Unimed e atender fora da faixa etária
   *    são decisões diferentes, por motivos diferentes. Um
   *    `confirmar` só faria a recepção, ao confirmar o limite,
   *    autorizar de bônus uma criança de 8 anos num geriatra —
   *    sem nunca ter visto o aviso.
   */
  confirmarLimite?: boolean;
  confirmarIdade?: boolean;
}): Promise<RespostaMarcar> {
  const { data, error } = await supabase.rpc('marcar_consulta', {
    p_cliente: p.clienteId,
    p_recurso: p.recursoId,
    p_servico: p.servicoId,
    p_inicio: p.inicio,
    p_paciente: p.pacienteId ?? null,
    p_nome: p.nome ?? null,
    p_cpf: p.cpf ?? null,
    p_telefone: p.telefone ?? null,
    p_email: p.email ?? null,
    p_nascimento: p.nascimento ?? null,
    p_convenio: p.convenioId ?? null,
    p_observacoes: p.observacoes ?? null,
    p_eh_encaixe: p.ehEncaixe ?? false,
    p_confirmar_limite: p.confirmarLimite ?? false,
    p_confirmar_idade: p.confirmarIdade ?? false
  });
  if (error) throw error;
  const linha = Array.isArray(data) ? data[0] : data;
  return (linha ?? {
    ok: false, mensagem: 'O banco não respondeu.',
    agendamento_id: null, paciente_id: null, motivo: null
  }) as RespostaMarcar;
}

/* ============================================================
 *  REAGENDAR, RETORNO E CORRIGIR CADASTRO
 * ============================================================ */

export interface RespostaMover {
  ok: boolean;
  mensagem: string;
  novo_id: string | null;
}

/**
 * Move o paciente de horário. 1 chamada.
 *
 * NÃO é um `update inicio`. O banco cancela a antiga apontando
 * para a nova (`reagendado_para`) e cria a nova — duas linhas,
 * ligadas. É o que faz a tarja azul aparecer no card e o que
 * mantém "cancelado" e "reagendado" como números diferentes no
 * topo da agenda.
 */
export async function reagendarConsulta(
  id: string, novoInicio: string, motivo?: string, novoRecurso?: string | null
): Promise<RespostaMover> {
  const { data, error } = await supabase.rpc('reagendar_consulta', {
    p_id: id,
    p_novo_inicio: novoInicio,
    p_motivo: motivo ?? null,
    p_novo_recurso: novoRecurso ?? null
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? { ok: false, mensagem: 'O banco não respondeu.', novo_id: null }) as RespostaMover;
}

/**
 * Retorno: uma consulta NOVA ligada à que já aconteceu.
 *
 * A origem continua `COMPARECEU`. "Atendido" e "retorno
 * agendado" são dois fatos diferentes sobre a mesma consulta, e
 * transformar um em status apagaria o outro.
 */
export async function marcarRetorno(
  consultaId: string, novoInicio: string, novoRecurso?: string | null
): Promise<RespostaMover> {
  const { data, error } = await supabase.rpc('marcar_retorno', {
    p_consulta: consultaId,
    p_novo_inicio: novoInicio,
    p_novo_recurso: novoRecurso ?? null
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? { ok: false, mensagem: 'O banco não respondeu.', novo_id: null }) as RespostaMover;
}

/** Um paciente pelo id, para o modal abrir preenchido. 1 consulta. */
export async function pacientePorId(id: string): Promise<Paciente | null> {
  const { data, error } = await supabase
    .from('pacientes')
    .select('id, nome, cpf, telefone, email, nascimento')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Paciente | null;
}

/** Corrige o cadastro. 1 chamada. */
export async function corrigirPaciente(p: {
  id: string; nome: string; cpf?: string; telefone?: string;
  email?: string; nascimento?: string | null;
}): Promise<Resposta> {
  const { data, error } = await supabase.rpc('corrigir_paciente', {
    p_id: p.id,
    p_nome: p.nome,
    p_cpf: p.cpf ?? null,
    p_telefone: p.telefone ?? null,
    p_email: p.email ?? null,
    p_nascimento: p.nascimento ?? null
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? { ok: false, mensagem: 'O banco não respondeu.', situacao: null }) as Resposta;
}

/* ============================================================
 *  FECHAR E ABRIR A AGENDA — o Calendário do Médico
 *
 *  As três perguntas da tela do médico que a de Agendamentos
 *  não faz:
 *
 *    · quem já está marcado dentro do que eu vou fechar?
 *    · fecha.
 *    · abre de novo.
 *
 *  ------------------------------------------------------------
 *  BLOQUEAR NÃO CANCELA NINGUÉM
 *
 *  Vale repetir aqui, porque é a decisão que a tela precisa
 *  respeitar: fechar a agenda impede venda de horário NOVO.
 *  Quem já está marcado continua marcado.
 *
 *  Por isso `bloquearFaixa` tem o `confirmar`: a primeira
 *  chamada volta com `ok: false`, a contagem e os nomes; a tela
 *  mostra e pergunta; a segunda, com `confirmar: true`, fecha.
 *
 *  O banco confere de novo — entre a tela mostrar e a pessoa
 *  clicar pode entrar um agendamento pelo chat.
 * ============================================================ */

export interface BloqueioNaAgenda {
  id: string;
  data_inicio: string;
  data_fim: string;
  hora_inicio_min: number | null;
  hora_fim_min: number | null;
  motivo: string | null;
  criado_em: string;
  criado_por: string | null;
  /** quantos pacientes continuam marcados dentro dela */
  marcados: number;
}

export interface ConsultaNaFaixa {
  id: string;
  inicio: string;
  dia: string;
  hora: string;
  paciente: string;
  situacao: string;
}

export interface RespostaBloqueio {
  ok: boolean;
  mensagem: string;
  bloqueio_id: string | null;
  marcados: number;
  nomes: string | null;
}

/** As faixas fechadas de um período. 1 consulta. */
export async function bloqueiosDoRecurso(
  recursoId: string, deISO: string, ateISO: string
): Promise<BloqueioNaAgenda[]> {
  const { data, error } = await supabase.rpc('bloqueios_do_recurso', {
    p_recurso: recursoId, p_de: deISO, p_ate: ateISO
  });
  if (error) throw error;
  return (data ?? []) as BloqueioNaAgenda[];
}

/**
 * Quem já está marcado dentro da faixa. Em páginas.
 *
 * ════════════════════════════════════════════════════════════
 *  ⚠️⚠️⚠️ ESTA LISTA ESTAVA A TRÊS LINHAS DE SER CORTADA
 *                                              (30/10/2026)
 *
 *  Em 29/10 o corte silencioso de 1.000 linhas do Supabase foi
 *  achado na tela de Agendamentos, e a carta daquele dia
 *  terminou com um aviso: *"as RPCs que devolvem listas não
 *  foram auditadas uma a uma"*.
 *
 *  Auditei as 155 que o painel chama. Medido na agenda real do
 *  St James:
 *
 *      consultas_na_faixa(Dr. Gustavo, um ano)  ->  997 linhas
 *
 *  Três a menos que o corte. As outras candidatas são pequenas
 *  (grade 1, aberturas 0, bloqueios 0, exames 2, log 14).
 *
 *  ⭐ O que esta lista responde é *"quem já está marcado dentro
 *     do que você vai fechar"* — ela aparece na tela ANTES de
 *     fechar a agenda de um médico. Cortada em silêncio, a
 *     recepção fecharia a agenda sobre pacientes que a tela
 *     nunca listou.
 *
 *  ⚠️ O `banco/060` teve que vir ANTES desta linha: paginar
 *     exige ordem TOTAL, e a função ordenava só por `inicio`.
 *     Este hospital tem 307 consultas empatadas no mesmo
 *     instante — paginar com ordem parcial repetiria umas e
 *     perderia outras, e o total continuaria parecendo certo.
 * ════════════════════════════════════════════════════════════
 */
export async function consultasNaFaixa(
  recursoId: string, deISO: string, ateISO: string,
  horaIni: number | null, horaFim: number | null
): Promise<ConsultaNaFaixa[]> {
  return todasAsLinhas<ConsultaNaFaixa>(async (de, ate) => {
    const { data, error } = await supabase
      .rpc('consultas_na_faixa', {
        p_recurso: recursoId, p_de: deISO, p_ate: ateISO,
        p_hora_ini: horaIni, p_hora_fim: horaFim
      })
      .range(de, ate);
    if (error) throw error;
    return (data ?? []) as ConsultaNaFaixa[];
  });
}

/** Fecha a agenda. 1 chamada. */
export async function bloquearFaixa(p: {
  recursoId: string;
  de: string;
  ate: string;
  horaIni?: number | null;
  horaFim?: number | null;
  motivo?: string;
  confirmar?: boolean;
}): Promise<RespostaBloqueio> {
  const { data, error } = await supabase.rpc('bloquear_faixa', {
    p_recurso: p.recursoId,
    p_de: p.de,
    p_ate: p.ate,
    p_hora_ini: p.horaIni ?? null,
    p_hora_fim: p.horaFim ?? null,
    p_motivo: p.motivo ?? null,
    p_confirmar: p.confirmar ?? false
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? {
    ok: false, mensagem: 'O banco não respondeu.',
    bloqueio_id: null, marcados: 0, nomes: null
  }) as RespostaBloqueio;
}

/**
 * Abre de novo. 1 chamada.
 *
 * Não é um `delete`: marca `removido_em`. A linha fica,
 * respondendo "por que esse dia ficou fechado em março".
 */
export async function liberarBloqueio(id: string): Promise<Resposta> {
  const { data, error } = await supabase.rpc('liberar_bloqueio', { p_id: id });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? { ok: false, mensagem: 'O banco não respondeu.', situacao: null }) as Resposta;
}


/* ============================================================
 *  ABRIR AGENDA — as duas portas
 *
 *  AGENDA EXTRA  expediente a mais nesta data. Vira vaga de
 *                verdade e aparece para o paciente.
 *  ENCAIXE       vaga a mais entre as existentes. O paciente
 *                nunca vê.
 *
 *  O banco recusa agenda extra em dia fechado, com o motivo —
 *  ela não geraria vaga nenhuma, e a pessoa só descobriria na
 *  hora de marcar. Encaixe em dia fechado passa, avisando: é o
 *  caso do médico que vem só por aquele paciente.
 * ============================================================ */

export interface Abertura {
  id: string;
  tipo: 'extra' | 'encaixe';
  dia: string;
  inicio_min: number;
  fim_min: number;
  motivo: string | null;
  criado_em: string;
  criado_por: string | null;
}

export interface RespostaAbrir {
  ok: boolean;
  mensagem: string;
  id: string | null;
}

/** Tudo que foi ABERTO num período — extra e encaixe. 1 consulta. */
export async function aberturasDoRecurso(
  recursoId: string, deISO: string, ateISO: string
): Promise<Abertura[]> {
  const { data, error } = await supabase.rpc('aberturas_do_recurso', {
    p_recurso: recursoId, p_de: deISO, p_ate: ateISO
  });
  if (error) throw error;
  return (data ?? []) as Abertura[];
}

/** Expediente a mais nesta data. 1 chamada. */
export async function abrirAgendaExtra(p: {
  recursoId: string; dia: string; ini: number; fim: number; motivo?: string;
}): Promise<RespostaAbrir> {
  const { data, error } = await supabase.rpc('abrir_agenda_extra', {
    p_recurso: p.recursoId, p_dia: p.dia,
    p_ini: p.ini, p_fim: p.fim, p_motivo: p.motivo ?? null
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return {
    ok: l?.ok ?? false,
    mensagem: l?.mensagem ?? 'O banco não respondeu.',
    id: l?.extra_id ?? null
  };
}

/** Vaga à mão entre as existentes. 1 chamada. */
export async function abrirEncaixe(p: {
  recursoId: string; dia: string; ini: number; fim: number; motivo?: string;
}): Promise<RespostaAbrir> {
  const { data, error } = await supabase.rpc('abrir_encaixe', {
    p_recurso: p.recursoId, p_dia: p.dia,
    p_ini: p.ini, p_fim: p.fim, p_motivo: p.motivo ?? null
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return {
    ok: l?.ok ?? false,
    mensagem: l?.mensagem ?? 'O banco não respondeu.',
    id: l?.encaixe_id ?? null
  };
}

/**
 * Tira a abertura. Não apaga: marca a data em que foi tirada.
 *
 * Remover um encaixe **não desmarca ninguém**. Se alguém já foi
 * marcado nele, a consulta é um fato à parte e continua de pé.
 */
export async function removerAbertura(
  tipo: 'extra' | 'encaixe', id: string
): Promise<Resposta> {
  const { data, error } = await supabase.rpc(
    tipo === 'extra' ? 'remover_agenda_extra' : 'remover_encaixe', { p_id: id });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? { ok: false, mensagem: 'O banco não respondeu.', situacao: null }) as Resposta;
}


/* ============================================================
 *  OS CADASTROS — médico, especialidade, convênio
 *
 *  ------------------------------------------------------------
 *  ESPECIALIDADE E SUBESPECIALIDADE
 *
 *  Ortopedia, e dentro dela Ombro, Joelho, Coluna. Dois níveis
 *  e só dois.
 *
 *  O paciente com dor na coluna que marca com o ortopedista de
 *  ombro gasta a vaga, gasta a consulta do convênio, viaja até
 *  o hospital — e sai com um encaminhamento. A vaga foi
 *  vendida, o paciente não foi atendido, e os dois números do
 *  relatório dizem que deu tudo certo.
 *
 *  ------------------------------------------------------------
 *  A REGRA DE HERANÇA
 *
 *  Médico ligado só à especialidade-pai é o GERAL: aparece em
 *  todas as subáreas. Ligado a subáreas, aparece só nas dele.
 *
 *  É isso que permite migrar sem recadastrar: hoje nenhum
 *  médico tem subespecialidade, logo todos são gerais, e nada
 *  muda até alguém começar a preencher.
 *
 *  Quem decide isso é o BANCO, em `medicos_que_atendem`. A tela
 *  não repete a regra — ela pergunta.
 * ============================================================ */

export interface Especialidade {
  id: string;
  cliente_id: string;
  nome: string;
  ativo: boolean;
  /** null = é especialidade; preenchido = é subespecialidade */
  pai_id: string | null;
  pai_nome: string | null;
  medicos: number;
  filhos: number;
}

export interface MedicoNoFormulario {
  id: string;
  nome: string;
  duracao_min: number;
  ativo: boolean;
  conselho: string | null;
  conselho_uf: string | null;
  cbos: string | null;
  especialidades: string[];
  faz_consulta: boolean;
  faz_exame: boolean;
  consultas_futuras: number;
  /**
   * A MESMA forma que o `salvarMedico` recebe de volta. O
   * formulário lê, mostra, deixa editar e devolve sem traduzir
   * nada no meio — tradução no meio do caminho é onde o limite da
   * Unimed vira o da Bradesco.
   */
  convenios: ConvenioDoMedico[];
  idade_min: number | null;
  idade_max: number | null;
  idade_obs: string | null;
  /**
   * ⭐ Os exames que ele faz — SÓ os de exame.
   *
   *    Os vínculos de CONSULTA não vêm aqui de propósito: eles
   *    nascem da especialidade, por outro caminho. Se viessem,
   *    o formulário os mostraria marcados entre os exames e
   *    salvar os apagaria.
   */
  exames: string[];
}

/**
 * Um convênio que o médico atende, e quantos por dia.
 *
 * ⭐ `limite_dia` nulo = SEM LIMITE. O formulário mostra o campo
 *    vazio, com a dica "sem limite", e aceita `0` digitado —
 *    porque `0` é o que o sistema de hoje usa e é o que a
 *    recepção tem no dedo. Quem traduz o zero para nulo é o
 *    `salvar_medico`, no banco, num lugar só.
 */
export interface ConvenioDoMedico {
  convenio_id: string;
  limite_dia: number | null;
}

export interface RespostaCadastro {
  ok: boolean;
  mensagem: string;
  id: string | null;
  /** só em médico: quantas consultas futuras ele tem */
  consultas_futuras?: number;
}

/** Todas as especialidades e subespecialidades. 1 consulta. */
export async function especialidadesDoCliente(
  clienteId: string, soAtivas = false
): Promise<Especialidade[]> {
  let q = supabase
    .from('especialidades')
    .select('id, cliente_id, nome, ativo, pai_id, pai_nome, medicos, filhos')
    .eq('cliente_id', clienteId)
    .order('nome');
  if (soAtivas) q = q.eq('ativo', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Especialidade[];
}

/** Cria ou muda. `pai` preenchido = é subespecialidade. 1 chamada. */
export async function salvarEspecialidade(p: {
  clienteId: string; nome: string; id?: string | null;
  ativo?: boolean; pai?: string | null;
}): Promise<RespostaCadastro> {
  const { data, error } = await supabase.rpc('salvar_especialidade', {
    p_cliente: p.clienteId, p_nome: p.nome,
    p_id: p.id ?? null, p_ativo: p.ativo ?? true, p_pai: p.pai ?? null
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? { ok: false, mensagem: 'O banco não respondeu.', id: null }) as RespostaCadastro;
}

/**
 * Cria ou muda convênio. 1 chamada.
 *
 * ⚠️ `logoUrl` é `undefined` quando a tela NÃO está mexendo na
 *    logo — e `undefined` vira `null` na chamada, que o banco lê
 *    como "não mexi nisso". Mandar string vazia é diferente: é
 *    "tira a logo". A diferença existe porque a tela manda o
 *    formulário inteiro, e um campo ausente não pode apagar o
 *    que está guardado.
 */
/**
 * ⚠️ A REGRA DOS CAMPOS OPCIONAIS, QUE JÁ EXISTIA:
 *
 *     não mandar (undefined) = não mexe
 *     mandar em branco       = apaga
 *
 * Ela nasceu com a logo, no `066`, e vale igual para o código
 * na operadora e o 2º registro ANS. Tirar o CNPJ faturador pede
 * `tirarPrestador`, porque um id não tem "em branco".
 */
export async function salvarConvenio(p: {
  clienteId: string; nome: string; registroAns?: string;
  id?: string | null; ativo?: boolean; logoUrl?: string | null;
  /** O CNPJ faturador que assina a guia deste convênio. */
  prestadorId?: string | null;
  /** O código do prestador NESTE convênio. É do par CNPJ × operadora. */
  codigoNaOperadora?: string | null;
  /** O 2º registro ANS, quando a operadora tem dois (a Bradesco tem). */
  registroAns2?: string | null;
  tirarPrestador?: boolean;
}): Promise<RespostaCadastro> {
  const { data, error } = await supabase.rpc('salvar_convenio', {
    p_cliente: p.clienteId, p_nome: p.nome,
    p_registro_ans: p.registroAns ?? null,
    p_id: p.id ?? null, p_ativo: p.ativo ?? true,
    p_logo_url: p.logoUrl ?? null,
    /* ⚠️ `?? null` e NÃO `?? ''`: null é "não mexe". Mandar ''
       aqui apagaria o campo de todo convênio que passasse por
       um "salvar" numa tela que nem conhece o campo. */
    p_prestador: p.prestadorId ?? null,
    p_codigo_na_operadora: p.codigoNaOperadora ?? null,
    p_registro_ans_2: p.registroAns2 ?? null,
    p_tirar_prestador: p.tirarPrestador ?? false
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? { ok: false, mensagem: 'O banco não respondeu.', id: null }) as RespostaCadastro;
}

/* ============================================================
 *  ⭐⭐⭐ OS VALORES PAGOS PELOS CONVÊNIOS      (31/10/2026)
 *
 *  O Tom: *"nada de valor no código e sim das tabelas."*
 *
 *  Em 30/10 eu montei uma análise com R$ 119,56 de média e
 *  R$ 330 de particular — números que ele me ditou e que eu
 *  escrevi dentro de um script. Funcionou uma vez e envelheceu
 *  no mesmo dia.
 *
 *  ⚠️ E PREÇO TEM DATA. Mudar o valor cria uma VIGÊNCIA nova,
 *     nunca sobrescreve: senão a consulta de março passa a valer
 *     o preço de outubro e o relatório do trimestre passado muda
 *     sozinho, sem ninguém ter pedido.
 * ============================================================ */

export interface PrecoDoConvenio {
  /** ⭐ 02/11: a primeira coluna do esboço do Tom. */
  codigo_tuss: string | null;
  servico_id: string;
  servico: string;
  tipo: string;
  especialidade: string | null;
  /** `null` = este serviço ainda não tem preço neste convênio. */
  valor: number | null;
  codigo: string | null;
  observacao: string | null;
  vigente_desde: string | null;
  vigencias: number;
}

export interface VigenciaDoPreco {
  valor: number;
  codigo: string | null;
  observacao: string | null;
  vigente_desde: string;
  por: string | null;
}

/**
 * Todos os serviços do hospital com o preço vigente ao lado —
 * ⭐ INCLUSIVE os que ainda não têm. Uma lista que só mostra o
 * que já foi preenchido nunca avisa o que falta.
 */
export async function precosDoConvenio(
  clienteId: string, convenioId: string
): Promise<PrecoDoConvenio[]> {
  const { data, error } = await supabase.rpc('precos_do_convenio', {
    p_cliente: clienteId, p_convenio: convenioId
  });
  if (error) throw error;
  return (data ?? []) as PrecoDoConvenio[];
}

/** O histórico de um preço — por que março valia outra coisa. */
export async function vigenciasDoPreco(
  convenioId: string, servicoId: string
): Promise<VigenciaDoPreco[]> {
  const { data, error } = await supabase.rpc('vigencias_do_preco', {
    p_convenio: convenioId, p_servico: servicoId
  });
  if (error) throw error;
  return (data ?? []) as VigenciaDoPreco[];
}

export interface RespostaPreco {
  ok: boolean; mensagem: string; vigencias: number;
}

/**
 * Grava um preço. ⚠️ Cria vigência nova; corrigir no MESMO dia
 * mexe na linha daquele dia, para erro de digitação não virar
 * história.
 */
export async function salvarPrecoConvenio(p: {
  clienteId: string; convenioId: string; servicoId: string;
  valor: number; codigo?: string | null; observacao?: string | null;
  vigenteDesde?: string | null;
}): Promise<RespostaPreco> {
  const { data, error } = await supabase.rpc('salvar_preco_convenio', {
    p_cliente: p.clienteId, p_convenio: p.convenioId, p_servico: p.servicoId,
    p_valor: p.valor, p_codigo: p.codigo ?? null,
    p_observacao: p.observacao ?? null,
    p_vigente_desde: p.vigenteDesde ?? null
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? { ok: false, mensagem: 'O banco não respondeu.', vigencias: 0 }) as RespostaPreco;
}

/** Tira UMA vigência — a daquela data, não a história toda. */
export async function apagarPrecoConvenio(p: {
  clienteId: string; convenioId: string; servicoId: string; vigenteDesde: string;
}): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('apagar_preco_convenio', {
    p_cliente: p.clienteId, p_convenio: p.convenioId,
    p_servico: p.servicoId, p_vigente_desde: p.vigenteDesde
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? { ok: false, mensagem: 'O banco não respondeu.' }) as
    { ok: boolean; mensagem: string };
}

/* ============================================================
 *  ⭐⭐⭐ O PAINEL DO FATURAMENTO           (03/11/2026)
 *
 *  O Tom colou o pacote, mandou o print do menu e escreveu
 *  duas palavras: *"Nenhum painel."*
 *
 *  ⚠️⚠️ O esboço dele tem cinco cartões em dinheiro — pronto
 *     para faturar, com pendência, em risco, glosado,
 *     recuperado. **Nenhum deles existe ainda**: todos saem de
 *     `core.contas`, a conta por atendimento, que ainda não foi
 *     construída.
 *
 *  ⭐ Desenhar os cartões com zero — ou pior, com número
 *     inventado — seria uma tela que mente todo dia.
 *     "Tela que não aparece não dá erro"; tela que mostra
 *     número que não existe é pior, porque dá a resposta errada
 *     com cara de resposta certa.
 *
 *  Então o painel nasce com o que é VERDADE hoje: as pendências
 *  de CADASTRO que impedem faturar. E elas não são poucas — o
 *  print do Tom mostra convênio atrás de convênio com "SEM
 *  REGISTRO ANS".
 * ============================================================ */

export interface PendenciaDoFaturamento {
  chave: string;
  gravidade: 'alta' | 'media' | 'baixa';
  titulo: string;
  quantos: number;
  /** O que acontece se ninguém mexer. */
  consequencia: string;
  /** Para onde o botão leva. */
  tela: string;
  /** Os primeiros nomes, para a pessoa reconhecer. */
  exemplos: string;
}

export async function pendenciasDoFaturamento(
  clienteId: string
): Promise<PendenciaDoFaturamento[]> {
  const { data, error } = await supabase.rpc('pendencias_do_faturamento', {
    p_cliente: clienteId
  });
  if (error) throw error;
  return (data ?? []) as PendenciaDoFaturamento[];
}

export interface ResumoDoFaturamento {
  convenios_ativos: number;
  /** Com CNPJ, código na operadora E registro ANS. */
  convenios_prontos: number;
  cnpjs: number;
  servicos: number;
  precos_lancados: number;
  pendencias: number;
  pendencias_altas: number;
}

export async function resumoDoFaturamento(
  clienteId: string
): Promise<ResumoDoFaturamento | null> {
  const { data, error } = await supabase.rpc('resumo_do_faturamento', {
    p_cliente: clienteId
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? null) as ResumoDoFaturamento | null;
}

/* ============================================================
 *  ⭐⭐⭐ A TELA DO CONVÊNIO             (02/11/2026)
 * ============================================================ */

export interface ResumoDoConvenio {
  convenio_id: string;
  nome: string;
  registro_ans: string | null;
  registro_ans_2: string | null;
  logo_url: string | null;
  ativo: boolean;
  prestador_id: string | null;
  prestador_nome: string | null;
  prestador_cnpj: string | null;
  codigo_na_operadora: string | null;
  servicos: number;
  sem_valor: number;
}

/**
 * O cabeçalho da tela de Valores numa chamada só.
 *
 * ⚠️ Três números em três chamadas podem discordar entre si na
 *    MESMA tela: entre contar os serviços e contar os sem
 *    valor, alguém pode cadastrar um exame.
 */
export async function resumoDoConvenio(
  clienteId: string, convenioId: string
): Promise<ResumoDoConvenio | null> {
  const { data, error } = await supabase.rpc('resumo_do_convenio', {
    p_cliente: clienteId, p_convenio: convenioId, p_quando: null
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? null) as ResumoDoConvenio | null;
}

export interface EfeitoNoPassado {
  atendimentos: number;
  desde_o_mes: string | null;
  meses: number;
  valor_hoje: number;
}

/**
 * ⭐⭐⭐ O terceiro quadro da prévia do reajuste.
 *
 * "Preço tem data" é metade da regra. A outra metade é que
 * **data tem consequência**: uma vigência para trás muda o
 * preço de consultas JÁ ATENDIDAS, e com ele o relatório de um
 * mês que o hospital já fechou e já conferiu.
 *
 * Isso não é erro — é o sistema fazendo o que mandaram. O
 * defeito seria fazer isso calado.
 */
export async function efeitoDoReajusteNoPassado(p: {
  clienteId: string; convenioId: string;
  vigenteDesde: string | null; servicoId?: string | null;
}): Promise<EfeitoNoPassado> {
  const { data, error } = await supabase.rpc('efeito_do_reajuste_no_passado', {
    p_cliente: p.clienteId, p_convenio: p.convenioId,
    p_vigente_desde: p.vigenteDesde, p_servico: p.servicoId ?? null
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  // ⚠️ 03/11: o `as` tem que ficar NA MESMA LINHA. Quebrado na linha
  //    de baixo, o `tsc` (que a Cloudflare roda) lê o `return` como
  //    terminado e acusa TS1434 — a publicação falhava inteira.
  return (l ?? { atendimentos: 0, desde_o_mes: null, meses: 0, valor_hoje: 0 }) as EfeitoNoPassado;
}

export async function salvarPrestador(p: {
  clienteId: string; cnpj: string; razaoSocial: string; nomeCurto: string;
  cnes?: string | null; id?: string | null; ativo?: boolean;
}): Promise<RespostaCadastro> {
  const { data, error } = await supabase.rpc('salvar_prestador', {
    p_cliente: p.clienteId, p_cnpj: p.cnpj,
    p_razao_social: p.razaoSocial, p_nome_curto: p.nomeCurto,
    p_cnes: p.cnes ?? null, p_id: p.id ?? null, p_ativo: p.ativo ?? true
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? { ok: false, mensagem: 'O banco não respondeu.', id: null }) as RespostaCadastro;
}

/** ⚠️ Desativa, não apaga: um CNPJ que já faturou tem conta e
    protocolo apontando para ele. */
export async function apagarPrestador(
  clienteId: string, id: string
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('apagar_prestador', {
    p_cliente: clienteId, p_id: id
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? { ok: false, mensagem: 'O banco não respondeu.' }) as
    { ok: boolean; mensagem: string };
}

/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ A PLANILHA DE PREÇOS — BAIXAR, IMPORTAR, REAJUSTAR
 *
 *  Pedido do Tom, 02/11, com as colunas escritas por ele:
 *
 *      Código TUSS | descrição | uma coluna por convênio
 *
 *  ⚠️ As colunas NÃO são uma lista fixa. Elas vêm do cadastro:
 *     quem cadastra um convênio novo ganha a coluna sozinho.
 *     Lista de convênio digitada à mão aqui seria a 4ª cópia da
 *     mesma verdade neste projeto.
 * ════════════════════════════════════════════════════════════ */

export interface LinhaDaPlanilha {
  servico_id: string;
  codigo_tuss: string | null;
  descricao: string;
  tipo: string;
  /** { "<convenio_id>": 165.00 } — convênio sem preço não aparece. */
  valores: Record<string, number>;
}

export interface ColunaDaPlanilha {
  convenio_id: string;
  nome: string;
  eh_particular: boolean;
}

export async function planilhaDePrecos(
  clienteId: string
): Promise<LinhaDaPlanilha[]> {
  const { data, error } = await supabase.rpc('planilha_de_precos', {
    p_cliente: clienteId
  });
  if (error) throw error;
  return (data ?? []) as LinhaDaPlanilha[];
}

export async function colunasDaPlanilha(
  clienteId: string
): Promise<ColunaDaPlanilha[]> {
  const { data, error } = await supabase.rpc('colunas_da_planilha', {
    p_cliente: clienteId
  });
  if (error) throw error;
  return (data ?? []) as ColunaDaPlanilha[];
}

export interface RespostaImportacao {
  ok: boolean;
  mensagem: string;
  novos: number;
  reajustes: number;
  iguais: number;
  recusados: number;
  detalhe: any;
}

/**
 * ⭐⭐⭐ `ensaio` é VERDADEIRO por padrão, e não é descuido.
 *
 * Quem importa uma planilha de 41 linhas precisa ver o estrago
 * ANTES, não depois. A tela mostra o resumo do ensaio e só
 * então oferece o botão que grava.
 *
 * ⚠️ Célula vazia é IGNORADA no banco — nunca vira preço zero.
 *    Preço zero é o convênio pagando nada, e seria uma mentira
 *    silenciosa no relatório do mês.
 */
export async function importarPrecos(p: {
  clienteId: string;
  linhas: Array<{ servico_id: string; valores: Record<string, number | null> }>;
  vigenteDesde?: string | null;
  ensaio?: boolean;
}): Promise<RespostaImportacao> {
  const { data, error } = await supabase.rpc('importar_precos', {
    p_cliente: p.clienteId,
    p_linhas: p.linhas,
    p_vigente_desde: p.vigenteDesde ?? null,
    p_ensaio: p.ensaio ?? true
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? {
    ok: false, mensagem: 'O banco não respondeu.',
    novos: 0, reajustes: 0, iguais: 0, recusados: 0, detalhe: null
  }) as RespostaImportacao;
}

export interface RespostaReajuste {
  ok: boolean;
  mensagem: string;
  quantos: number;
  /** Serviços que ficaram de fora porque ainda não têm preço. */
  sem_preco: number;
  detalhe: any;
}

/**
 * Reajuste por percentual — o geral e o de um item só, na MESMA
 * função.
 *
 * ⚠️ `servicoId` nulo = o convênio inteiro. Duas funções para
 *    isto seriam duas respostas para "quanto arredondar", e uma
 *    delas envelheceria.
 *
 * ⚠️ O reajuste NÃO reescreve o passado: ele cria uma vigência
 *    nova. O relatório do trimestre passado continua valendo o
 *    que valia.
 */
export async function reajustarPrecos(p: {
  clienteId: string;
  convenioId: string;
  percentual: number;
  vigenteDesde?: string | null;
  arredondar?: 'centavo' | 'dez_centavos' | 'real';
  servicoId?: string | null;
  ensaio?: boolean;
}): Promise<RespostaReajuste> {
  const { data, error } = await supabase.rpc('reajustar_precos', {
    p_cliente: p.clienteId,
    p_convenio: p.convenioId,
    p_percentual: p.percentual,
    p_vigente_desde: p.vigenteDesde ?? null,
    p_arredondar: p.arredondar ?? 'centavo',
    p_servico: p.servicoId ?? null,
    p_ensaio: p.ensaio ?? true
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? {
    ok: false, mensagem: 'O banco não respondeu.',
    quantos: 0, sem_preco: 0, detalhe: null
  }) as RespostaReajuste;
}

/* ════════════════════════════════════════════════════════════
 *  OS CNPJs FATURADORES
 * ════════════════════════════════════════════════════════════ */

export interface Prestador {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_curto: string;
  cnes: string | null;
  ativo: boolean;
}

export async function prestadores(clienteId: string): Promise<Prestador[]> {
  const { data, error } = await supabase
    .from('prestadores')
    .select('id,cnpj,razao_social,nome_curto,cnes,ativo')
    .eq('cliente_id', clienteId)
    .order('nome_curto');
  if (error) throw error;
  return (data ?? []) as Prestador[];
}

/**
 * Um médico pelo id, para o formulário abrir preenchido.
 *
 * Lê DE NOVO em vez de usar a linha que já está na lista. A
 * lista pode estar velha, e salvar por cima de dado velho apaga
 * o que outra pessoa acabou de gravar — a mesma lição do modal
 * de corrigir paciente.
 */
export async function medicoPorId(id: string): Promise<MedicoNoFormulario | null> {
  const { data, error } = await supabase.rpc('medico_por_id', { p_id: id });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? null) as MedicoNoFormulario | null;
}

/**
 * Cria ou muda médico. 1 chamada, três tabelas numa transação.
 *
 * `confirmar` existe para um caso só: desativar um médico que
 * tem consulta futura. A primeira chamada volta com a contagem;
 * a tela mostra e pergunta.
 */
export async function salvarMedico(p: {
  clienteId: string;
  nome: string;
  duracaoMin: number;
  id?: string | null;
  ativo?: boolean;
  especialidades?: string[];
  conselho?: string;
  conselhoUf?: string;
  cbos?: string;
  fazConsulta?: boolean;
  fazExame?: boolean;
  confirmar?: boolean;
  /**
   * ⭐ `undefined` NÃO MEXE na lista; `[]` APAGA (volta a atender
   *    todos). A diferença é o que impede uma tela que não
   *    conhece convênios — o importador da planilha, uma
   *    correção rápida de nome — de apagar em silêncio o limite
   *    que alguém configurou à mão.
   */
  convenios?: ConvenioDoMedico[];
  /** ⭐ Mesma regra: `undefined` não mexe; `{}` limpa a faixa. */
  idade?: { min: number | null; max: number | null; obs: string | null } | null;
  /**
   * ⭐ Os exames que ele faz — ids de serviço do tipo exame, o
   *    de cima ou os subtipos.
   *
   *    `undefined` NÃO MEXE na lista gravada; `[]` apaga.
   *    É a mesma regra de `convenios` e `idade`, e pelo mesmo
   *    motivo: uma tela que não conhece o campo não pode apagar
   *    o trabalho de quem cadastrou à mão.
   */
  exames?: string[] | null;
}): Promise<RespostaCadastro> {
  const { data, error } = await supabase.rpc('salvar_medico', {
    p_cliente: p.clienteId,
    p_nome: p.nome,
    p_duracao_min: p.duracaoMin,
    p_id: p.id ?? null,
    p_ativo: p.ativo ?? true,
    p_especialidades: p.especialidades ?? [],
    p_conselho: p.conselho ?? null,
    p_conselho_uf: p.conselhoUf ?? null,
    p_cbos: p.cbos ?? null,
    p_faz_consulta: p.fazConsulta ?? true,
    p_faz_exame: p.fazExame ?? false,
    p_confirmar: p.confirmar ?? false,
    // `?? null` e não `?? []`: nulo quer dizer "não mexe".
    p_convenios: p.convenios ?? null,
    p_idade: p.idade ?? null,
    p_exames: p.exames ?? null
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? {
    ok: false, mensagem: 'O banco não respondeu.', id: null, consultas_futuras: 0
  }) as RespostaCadastro;
}

/**
 * Quem atende isso. 1 consulta.
 *
 * A regra de herança — geral aparece em todas as subáreas — é
 * do BANCO. A tela pergunta em vez de refazer a conta: duas
 * versões da mesma regra é o defeito que este projeto persegue
 * desde setembro.
 */
export interface MedicoQueAtende {
  id: string;
  nome: string;
  duracao_min: number;
  especialidades: string;
  /** true = ele é o geral da especialidade, não o especialista da subárea */
  geral: boolean;
  /** limite diário DESTE convênio, quando um convênio foi pedido */
  convenio_limite_dia: number | null;
  /** o que o hospital escreveu sobre a faixa de idade dele */
  idade_obs: string | null;
  /**
   * ⭐ De quando até quando ESTE paciente cabe neste médico.
   *    Nulo dos dois lados = cabe sempre.
   *
   *    São datas, e não um sim/não, porque a idade muda no meio
   *    do período que a tela mostra. É com elas que o calendário
   *    apaga os dias certos sem refazer conta de idade aqui.
   */
  atende_de: string | null;
  atende_ate: string | null;
}

export async function medicosQueAtendem(p: {
  clienteId: string;
  tipo?: 'consulta' | 'exame' | null;
  especialidade?: string | null;
  /**
   * ⭐ Convênio escolhido. Nulo = particular ou não informado, e
   *    aí o filtro não se aplica.
   *
   *    Médico sem nenhum convênio cadastrado aparece para TODOS —
   *    decisão do Tom, 08/10/2026, e é ela que permite subir isto
   *    num hospital onde ninguém preencheu nada.
   */
  convenio?: string | null;
  /**
   * ⭐ O nascimento e o PERÍODO que a tela mostra — não uma data.
   *
   *    A idade muda no meio do período. A criança de 13 anos e 11
   *    meses não cabe hoje no clínico que atende de 14 para cima,
   *    e cabe daqui a um mês, dentro do mesmo calendário que ela
   *    está olhando. Filtrar por uma data só esconderia esse
   *    médico por inteiro.
   *
   *    Some só quem não cabe em dia NENHUM do período. Omitindo
   *    `dia`, o filtro de idade não se aplica — e as colunas
   *    `atende_de`/`atende_ate` vêm preenchidas do mesmo jeito.
   */
  nascimento?: string | null;
  dia?: string | null;
  ate?: string | null;
}): Promise<MedicoQueAtende[]> {
  const { data, error } = await supabase.rpc('medicos_que_atendem', {
    p_cliente: p.clienteId,
    p_tipo: p.tipo ?? null,
    p_especialidade: p.especialidade ?? null,
    p_convenio: p.convenio ?? null,
    p_nascimento: p.nascimento ?? null,
    p_dia: p.dia ?? null,
    p_ate: p.ate ?? null
  });
  if (error) throw error;
  return (data ?? []) as MedicoQueAtende[];
}


/* ============================================================
 *  ⭐ O LIMITE DIÁRIO DO CONVÊNIO, E A FAIXA ETÁRIA
 *
 *  As duas perguntas que a tela faz ANTES de mandar marcar, para
 *  mostrar o número e o aviso em vez de um erro depois.
 *
 *  ⚠️ Nenhuma das duas é a trava. A trava é um gatilho no banco,
 *     e ele roda de qualquer jeito — inclusive para o chat e o
 *     importador, que ainda não existem. Estas funções chamam a
 *     MESMA conta que o gatilho chama; não há duas versões da
 *     mesma regra.
 * ============================================================ */

export interface LimiteDoConvenio {
  limite_dia: number | null;
  usados: number;
  cabe: boolean;
  /** já vem pronta: "Unimed: 3 de 4 no dia 12/08." */
  mensagem: string | null;
}

export async function limiteDoConvenioNoDia(p: {
  recurso: string;
  convenio: string | null;
  /** 'YYYY-MM-DD', no fuso do hospital */
  dia: string;
  /** a consulta que está saindo, num reagendamento */
  ignorar?: string | null;
}): Promise<LimiteDoConvenio> {
  const { data, error } = await supabase.rpc('limite_do_convenio_no_dia', {
    p_recurso: p.recurso,
    p_convenio: p.convenio,
    p_dia: p.dia,
    p_ignorar: p.ignorar ?? null
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? {
    limite_dia: null, usados: 0, cabe: true, mensagem: null
  }) as LimiteDoConvenio;
}

export interface FaixaEtaria {
  idade: number | null;
  idade_min: number | null;
  idade_max: number | null;
  cabe: boolean;
  mensagem: string | null;
}

export async function faixaEtariaNoDia(p: {
  recurso: string;
  paciente: string;
  dia: string;
}): Promise<FaixaEtaria> {
  const { data, error } = await supabase.rpc('faixa_etaria_no_dia', {
    p_recurso: p.recurso, p_paciente: p.paciente, p_dia: p.dia
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? {
    idade: null, idade_min: null, idade_max: null, cabe: true, mensagem: null
  }) as FaixaEtaria;
}

/* ============================================================
 *  O EXPEDIENTE
 *
 *  ⭐ Esta parte existe por causa de 07/10/2026, quando o
 *  expediente de quatro médicos foi apagado no Apps Script e a
 *  resposta foi `success: true`. Havia 215 consultas futuras.
 *
 *  `salvarExpediente` devolve `em_risco` e `nomes`: as consultas
 *  futuras que o expediente novo deixaria de cobrir. A tela
 *  mostra a lista antes de deixar confirmar.
 * ============================================================ */

export interface FaixaExpediente {
  id?: string;
  dia_semana: number;
  inicio_min: number;
  fim_min: number;
  intervalo_inicio: number | null;
  intervalo_fim: number | null;
  semanas_do_mes: number[];
}

export interface ConsultaForaDoExpediente {
  id: string;
  inicio: string;
  dia: string;
  hora: string;
  paciente: string;
  situacao: string;
}

export interface RespostaExpediente {
  ok: boolean;
  mensagem: string;
  em_risco: number;
  nomes: string | null;
  linhas_ativas: number;
}

/** As faixas ATIVAS de um médico. 1 consulta. */
export async function expedienteDoRecurso(
  recursoId: string
): Promise<FaixaExpediente[]> {
  const { data, error } = await supabase.rpc('expediente_do_recurso', {
    p_recurso: recursoId
  });
  if (error) throw error;
  return (data ?? []) as FaixaExpediente[];
}

/** Quem ficaria fora do expediente proposto. 1 consulta. */
export async function consultasForaDoExpediente(
  recursoId: string, linhas: FaixaExpediente[]
): Promise<ConsultaForaDoExpediente[]> {
  const { data, error } = await supabase.rpc('consultas_fora_do_expediente', {
    p_recurso: recursoId, p_linhas: linhas
  });
  if (error) throw error;
  return (data ?? []) as ConsultaForaDoExpediente[];
}

/** Salva. Não apaga: o que sai fica desativado. 1 chamada. */
export async function salvarExpediente(
  recursoId: string, linhas: FaixaExpediente[], confirmar = false
): Promise<RespostaExpediente> {
  const { data, error } = await supabase.rpc('salvar_expediente', {
    p_recurso: recursoId, p_linhas: linhas, p_confirmar: confirmar
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? {
    ok: false, mensagem: 'O banco não respondeu.',
    em_risco: 0, nomes: null, linhas_ativas: 0
  }) as RespostaExpediente;
}


/* ============================================================
 *  ⭐ O IMPORTADOR DA PLANILHA
 *
 *  Duas portas, e as duas aceitam ENSAIO: com `confirmar=false`
 *  o banco grava tudo, monta o relatório e desfaz. Não é
 *  simulação — é o caminho de verdade, desfeito no fim.
 *
 *  Uma prévia que "valida sem gravar" não vê o que só aparece na
 *  gravação: a chave estrangeira, a trava de duplicidade, o
 *  gatilho do limite. Ela diz "3019 entram" e no dia da virada
 *  entram 2800.
 * ============================================================ */

export interface SecaoImportada {
  secao: string;
  criados: number;
  atualizados: number;
  ignorados: number;
  recusados: number;
  detalhes: { linha?: string; motivo?: string }[];
}

export async function importarCadastros(p: {
  clienteId: string;
  dados: unknown;
  confirmar: boolean;
}): Promise<SecaoImportada[]> {
  const { data, error } = await supabase.rpc('importar_cadastros', {
    p_cliente: p.clienteId,
    p_dados: p.dados,
    p_confirmar: p.confirmar
  });
  if (error) throw error;
  return (data ?? []) as SecaoImportada[];
}

export interface PacientesImportados {
  criados: number;
  atualizados: number;
  ignorados: number;
  recusados: number;
  sem_cpf: number;
  cpf_corrigido: number;
  detalhes: { linha?: string; cpf?: string; motivo?: string }[];
}

export async function importarPacientes(p: {
  clienteId: string;
  linhas: unknown[];
  confirmar: boolean;
}): Promise<PacientesImportados> {
  const { data, error } = await supabase.rpc('importar_pacientes', {
    p_cliente: p.clienteId,
    p_linhas: p.linhas,
    p_confirmar: p.confirmar
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return (l ?? {
    criados: 0, atualizados: 0, ignorados: 0, recusados: 0,
    sem_cpf: 0, cpf_corrigido: 0, detalhes: []
  }) as PacientesImportados;
}

/* ============================================================
 *  EXAMES — O CATÁLOGO, OS SUBTIPOS E O PEDIDO MÚLTIPLO
 *
 *  Tudo aqui conversa com o `019_exames.sql` e o
 *  `020_marcar_exame.sql`. Nenhuma regra mora deste lado: quem
 *  faz o quê, qual duração vale, o que é subtipo e o que é
 *  entrevista — tudo é pergunta ao banco.
 *
 *  É o mesmo motivo de sempre: o chat do WhatsApp vai precisar
 *  das mesmas respostas, e duas implementações da mesma pergunta
 *  andam separadas até discordarem em silêncio.
 * ============================================================ */

export interface Exame {
  id: string;
  nome: string;
  duracao_efetiva: number | null;
  /** Quantos subtipos ativos ele tem. 0 = marca-se ele direto. */
  subtipos: number;
  /** Passa por entrevista antes de ter horário (endoscopia, colonoscopia). */
  requer_entrevista: boolean;
  exige_autorizacao: boolean;
  preparo: string | null;
  setor: string | null;
  telefone_setor: string | null;
  /**
   * ⭐ Quantos profissionais ou aparelhos ATIVOS podem fazer.
   *
   *    Zero é o caso real do St James: os três
   *    ultrassonografistas estão desativados na planilha. A tela
   *    precisa deste número para DIZER por que o exame não abre,
   *    em vez de mostrar uma lista vazia.
   */
  quem_faz: number;
}

export interface SubtipoDeExame {
  id: string;
  nome: string;
  duracao_efetiva: number | null;
  preparo: string | null;
  codigo_tuss: string | null;
  quem_faz: number;
}

/** Os exames que se pode marcar. Só os de cima; subtipo vem depois. */
export async function examesDoCliente(clienteId: string): Promise<Exame[]> {
  const { data, error } = await supabase.rpc('exames_do_cliente', {
    p_cliente: clienteId
  });
  if (error) throw error;
  return (data ?? []) as Exame[];
}

export async function subtiposDoExame(
  clienteId: string, exameId: string
): Promise<SubtipoDeExame[]> {
  const { data, error } = await supabase.rpc('subtipos_do_exame', {
    p_cliente: clienteId, p_exame: exameId
  });
  if (error) throw error;
  return (data ?? []) as SubtipoDeExame[];
}

export interface QuemFaz {
  id: string;
  nome: string;
  /** 'profissional' | 'sala' | 'equipamento' */
  tipo: string;
  duracao_min: number;
  /**
   * ⭐ Veio pelo vínculo com o exame de cima, e não com o
   *    subtipo — "faz o ultrassom inteiro". A tela mostra isso
   *    do lado do nome, como já faz com o ortopedista geral.
   */
  geral: boolean;
  idade_min: number | null;
  idade_max: number | null;
  idade_obs: string | null;
}

/**
 * ⭐⭐ Quem faz TODOS os exames escolhidos.
 *
 *  Não é "quem faz algum". O pedido múltiplo é marcado em
 *  sequência com o MESMO profissional, então quem faz só um não
 *  serve — e aparecer na lista para depois falhar ao gravar é a
 *  tela prometendo o que o banco vai recusar.
 */
export async function recursosQueFazem(p: {
  clienteId: string;
  servicos: string[];
  /** Nulo = particular: não filtra ninguém. */
  convenio?: string | null;
  nascimento?: string | null;
  /** O período que o calendário vai mostrar. */
  dia?: string | null;
  ate?: string | null;
}): Promise<QuemFaz[]> {
  const { data, error } = await supabase.rpc('recursos_que_fazem', {
    p_cliente: p.clienteId,
    p_servicos: p.servicos,
    p_convenio: p.convenio ?? null,
    p_nascimento: p.nascimento ?? null,
    p_dia: p.dia ?? null,
    p_ate: p.ate ?? null
  });
  if (error) throw error;
  return (data ?? []) as QuemFaz[];
}

export interface RespostaMarcarExame {
  ok: boolean;
  mensagem: string;
  pedido_id: string | null;
  paciente_id: string | null;
  /** 'LIMITE' | 'IDADE' | 'ENTREVISTA' | 'SUBTIPO' | 'NAO_FAZ' | null */
  motivo: string | null;
  marcados: number;
  termina_em: string | null;
}

/**
 * ⭐⭐ Marca o pedido inteiro, ou nada.
 *
 *  Os subtipos vão NA ORDEM do array, em sequência, com o mesmo
 *  profissional. Se um horário for tomado no meio, o banco
 *  desfaz os que já tinham entrado — meio pedido agendado é pior
 *  que pedido nenhum.
 */
export async function marcarExame(p: {
  clienteId: string;
  recursoId: string;
  servicos: string[];
  inicio: string;
  pacienteId?: string | null;
  nome?: string;
  cpf?: string;
  telefone?: string;
  email?: string;
  nascimento?: string | null;
  convenioId?: string | null;
  observacoes?: string;
  confirmarLimite?: boolean;
  confirmarIdade?: boolean;
  /**
   * ⭐ De qual solicitação este pedido nasceu, quando o setor
   *    marca a partir da Fila. Deixa a solicitação AGENDADA e
   *    amarrada ao pedido — sem isso ela ficaria pendente para
   *    sempre e alguém marcaria o mesmo exame duas vezes.
   */
  solicitacao?: string | null;
}): Promise<RespostaMarcarExame> {
  const { data, error } = await supabase.rpc('marcar_exame', {
    p_cliente: p.clienteId,
    p_recurso: p.recursoId,
    p_servicos: p.servicos,
    p_inicio: p.inicio,
    p_paciente: p.pacienteId ?? null,
    p_nome: p.nome ?? null,
    p_cpf: p.cpf ?? null,
    p_telefone: p.telefone ?? null,
    p_email: p.email ?? null,
    p_nascimento: p.nascimento ?? null,
    p_convenio: p.convenioId ?? null,
    p_observacoes: p.observacoes ?? null,
    p_confirmar_limite: p.confirmarLimite ?? false,
    p_confirmar_idade: p.confirmarIdade ?? false,
    p_solicitacao: p.solicitacao ?? null
  });
  if (error) throw error;
  const linha = Array.isArray(data) ? data[0] : data;
  return (linha ?? {
    ok: false, mensagem: 'O banco não respondeu.',
    pedido_id: null, paciente_id: null, motivo: null,
    marcados: 0, termina_em: null
  }) as RespostaMarcarExame;
}

export interface ExameDoPedido {
  id: string;
  inicio: string;
  duracao_min: number;
  situacao: string;
  servico_id: string;
  servico: string;
  codigo_tuss: string | null;
  preparo: string | null;
  recurso_id: string;
  recurso: string;
  paciente_id: string;
  paciente: string;
}

/** Os irmãos de um pedido, na ordem do horário. */
export async function examesDoPedido(pedidoId: string): Promise<ExameDoPedido[]> {
  const { data, error } = await supabase.rpc('exames_do_pedido', {
    p_pedido: pedidoId
  });
  if (error) throw error;
  return (data ?? []) as ExameDoPedido[];
}

/**
 * ⭐ As quatro abas de exame: `Exames_Config`, `TUSS_Exames`,
 *    `Medicos_Exames` e `Horarios_Exames`.
 *
 *  Devolve as mesmas cinco colunas do `importarCadastros`, para a
 *  tela de relatório não precisar saber que são dois caminhos.
 */
export async function importarExames(p: {
  clienteId: string;
  dados: unknown;
  confirmar: boolean;
}): Promise<SecaoImportada[]> {
  const { data, error } = await supabase.rpc('importar_exames', {
    p_cliente: p.clienteId,
    p_dados: p.dados,
    p_confirmar: p.confirmar
  });
  if (error) throw error;
  return (data ?? []) as SecaoImportada[];
}

/** Um exame ou subtipo, na forma que o cadastro do médico desenha. */
export interface ExameDaArvore {
  id: string;
  nome: string;
  /** null = é exame de cima; preenchido = é subtipo */
  pai_id: string | null;
  pai_nome: string | null;
  /** Quantos subtipos ativos ele tem. 0 = marca-se ele direto. */
  subtipos: number;
  codigo_tuss: string | null;
  ativo: boolean;
  quem_faz: number;
}

/** Exames e subtipos numa lista só, já na ordem de desenhar. */
export async function arvoreDeExames(
  clienteId: string
): Promise<ExameDaArvore[]> {
  const { data, error } = await supabase.rpc('arvore_de_exames', {
    p_cliente: clienteId
  });
  if (error) throw error;
  return (data ?? []) as ExameDaArvore[];
}

/* ════════════════════════════════════════════════════════════
 *  ⭐⭐ A GESTÃO DE EXAMES                       (09/10/2026)
 *
 *  O Tom: *"é melhor fazer conforme a tela que temos no sistema
 *  atual gestão de exames. Coloque o código tuss também."*
 *
 *  O formato veio da aba `Exames_Config` da planilha dele — ela
 *  É a tela de hoje, uma coluna por campo.
 * ════════════════════════════════════════════════════════════ */

export interface ExameDaGestao {
  id: string;
  nome: string;
  icone: string | null;
  pai_id: string | null;
  pai_nome: string | null;
  subtipos: number;
  /** A duração digitada neste exame. Nula = herda do pai. */
  duracao_min: number | null;
  /** A que vale de verdade — própria, ou herdada. */
  duracao_efetiva: number | null;
  codigo_tuss: string | null;
  exige_autorizacao: boolean;
  requer_entrevista: boolean;
  /* ⚠️ `unknown[]`, e não `string[]`.
     As perguntas do St James são OBJETOS com tipo, e tratá-las
     como texto foi o que quase apagou as 21 perguntas dele em
     10/10/2026. O tipo honesto obriga quem mexe a passar pelo
     `lerPerguntas` do núcleo. */
  perguntas: unknown[] | null;
  preparo: string | null;
  horas_preparo: number | null;
  setor: string | null;
  telefone_setor: string | null;
  email_setor: string | null;
  ativo: boolean;
  quem_faz: number;
  /** O expediente de quem faz, em letras. Só para MOSTRAR. */
  expediente: string | null;
  futuros: number;
  /** ⭐ 26/10: os blocos do cartaz que o chat mostra. */
  orientacoes: BlocoDeOrientacao[] | null;
  /** Este exame só orienta: não agenda, não pede guia. */
  so_orientacao: boolean;
}

export async function examesParaGestao(
  clienteId: string
): Promise<ExameDaGestao[]> {
  const { data, error } = await supabase.rpc('exames_para_gestao', {
    p_cliente: clienteId
  });
  if (error) throw error;
  return (data ?? []) as ExameDaGestao[];
}

/**
 * Cria ou muda um exame, um subtipo ou um procedimento.
 *
 * ⭐ NULO NÃO MEXE, e por isso cada campo é opcional aqui também.
 *    A tela de gestão tem dezessete campos; uma correção rápida
 *    de nome não pode apagar o preparo de quinze linhas.
 */
export async function salvarExame(e: {
  clienteId: string;
  id?: string | null;
  nome: string;
  pai?: string | null;
  icone?: string | null;
  duracaoMin?: number | null;
  codigoTuss?: string | null;
  preparo?: string | null;
  horasPreparo?: number | null;
  exigeAutorizacao?: boolean | null;
  requerEntrevista?: boolean | null;
  perguntas?: unknown[] | null;
  setor?: string | null;
  telefoneSetor?: string | null;
  emailSetor?: string | null;
  ativo?: boolean;
  /** ⭐ 26/10: `[]` APAGA o cartaz; `null`/ausente não mexe. */
  orientacoes?: BlocoDeOrientacao[] | null;
  soOrientacao?: boolean | null;
}): Promise<{ ok: boolean; mensagem: string; id: string | null }> {
  const { data, error } = await supabase.rpc('salvar_servico', {
    p_cliente: e.clienteId,
    p_nome: e.nome,
    p_tipo: 'exame',
    p_id: e.id ?? null,
    p_especialidade: null,
    p_duracao_min: e.duracaoMin ?? null,
    p_ativo: e.ativo ?? true,
    p_recursos: null,
    p_pai: e.pai ?? null,
    p_preparo: e.preparo ?? null,
    p_horas_preparo: e.horasPreparo ?? null,
    p_codigo_tuss: e.codigoTuss ?? null,
    p_exige_autorizacao: e.exigeAutorizacao ?? null,
    p_requer_entrevista: e.requerEntrevista ?? null,
    p_perguntas: e.perguntas ?? null,
    p_setor: e.setor ?? null,
    p_telefone_setor: e.telefoneSetor ?? null,
    p_icone: e.icone ?? null,
    p_email_setor: e.emailSetor ?? null,
    p_orientacoes: e.orientacoes ?? null,
    p_so_orientacao: e.soOrientacao ?? null
  });
  if (error) throw error;
  const r = (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.', id: null };
  return r as { ok: boolean; mensagem: string; id: string | null };
}

/* ════════════════════════════════════════════════════════════
 *  USUÁRIOS, PERMISSÃO POR TELA, E O LOG      (10/10/2026)
 * ════════════════════════════════════════════════════════════ */

export interface LinhaDoLog {
  id: number;
  quando: string;
  quem: string;
  acao: string;
  alvo_tabela: string | null;
  alvo_id: string | null;
  origem: string | null;
  recurso: string | null;
  servico: string | null;
  convenio: string | null;
  paciente: string | null;
  antes: unknown;
  depois: unknown;
}

export async function logDoCliente(p: {
  clienteId: string;
  de?: string | null; ate?: string | null;
  acao?: string | null; usuario?: string | null;
  recurso?: string | null; servico?: string | null; convenio?: string | null;
  busca?: string | null; limite?: number;
}): Promise<LinhaDoLog[]> {
  const { data, error } = await supabase.rpc('log_do_cliente', {
    p_cliente: p.clienteId,
    p_de: p.de || null, p_ate: p.ate || null,
    p_acao: p.acao || null, p_usuario: p.usuario || null,
    p_recurso: p.recurso || null, p_servico: p.servico || null,
    p_convenio: p.convenio || null,
    p_busca: p.busca || null, p_limite: p.limite ?? 200
  });
  if (error) throw error;
  return (data ?? []) as LinhaDoLog[];
}

export async function acoesDoLog(clienteId: string):
  Promise<{ acao: string; quantas: number }[]> {
  const { data, error } = await supabase.rpc('acoes_do_log', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as { acao: string; quantas: number }[];
}

export interface UsuarioDoCliente {
  usuario_id: string;
  nome: string | null;
  email: string;
  papel: string;
  papel_nome: string | null;
  ativo: boolean;
  telas_mais: string[];
  telas_menos: string[];
  quantas_telas: number;
}

export async function usuariosDoCliente(clienteId: string):
  Promise<UsuarioDoCliente[]> {
  const { data, error } = await supabase.rpc('usuarios_do_cliente',
    { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as UsuarioDoCliente[];
}

export interface PapelDoCliente {
  papel: string;
  nome: string;
  permissoes: string[];
  telas: string[];
  quantas_pessoas: number;
}

export async function papeisDoCliente(clienteId: string):
  Promise<PapelDoCliente[]> {
  const { data, error } = await supabase.rpc('papeis_do_cliente',
    { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as PapelDoCliente[];
}

export async function salvarPapel(p: {
  clienteId: string; papel: string; nome?: string | null;
  telas?: string[] | null; permissoes?: string[] | null;
}): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('salvar_papel', {
    p_cliente: p.clienteId, p_papel: p.papel,
    p_nome: p.nome ?? null, p_telas: p.telas ?? null,
    p_permissoes: p.permissoes ?? null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' }) as
    { ok: boolean; mensagem: string };
}

export async function salvarUsuario(p: {
  clienteId: string; usuarioId: string;
  papel?: string | null; ativo?: boolean | null;
  telasMais?: string[] | null; telasMenos?: string[] | null;
  nome?: string | null;
}): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('salvar_usuario', {
    p_cliente: p.clienteId, p_usuario: p.usuarioId,
    p_papel: p.papel ?? null, p_ativo: p.ativo ?? null,
    p_telas_mais: p.telasMais ?? null, p_telas_menos: p.telasMenos ?? null,
    p_nome: p.nome ?? null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' }) as
    { ok: boolean; mensagem: string };
}

/** As telas que EU vejo. O menu desenha a partir disto. */
export async function minhasTelas(clienteId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('minhas_telas', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as string[];
}

/* ════════════════════════════════════════════════════════════
 *  O ADMIN DA PLATAFORMA                        (11/10/2026)
 * ════════════════════════════════════════════════════════════ */

/** Sou o operador do MedCalendar? É o que faz a seção aparecer. */
export async function souDaPlataforma(): Promise<boolean> {
  const { data, error } = await supabase.rpc('sou_da_plataforma');
  if (error) return false;   // sem resposta = não é; nunca o contrário
  return data === true;
}

export interface ClienteDaPlataforma {
  id: string;
  nome: string;
  slug: string;
  cnpj: string | null;
  ativo: boolean;
  demo: boolean;
  criado_em: string;
  nome_exibicao: string | null;
  cor: string | null;
  logo_url: string | null;
  /* ⭐ 19/10: a placa da porta, que a vitrine do chat mostra. */
  tagline: string | null;
  telefone: string | null;
  endereco: string | null;
  horario: string | null;
  modulos: number;
  usuarios: number;
  pacientes: number;
}

export async function clientesDaPlataforma(): Promise<ClienteDaPlataforma[]> {
  const { data, error } = await supabase.rpc('clientes_da_plataforma');
  if (error) throw error;
  return (data ?? []) as ClienteDaPlataforma[];
}

export interface ModuloDoCliente {
  modulo: string;
  ativo: boolean;
  expira_em: string | null;
  /** ligado · vencendo · vencido · desligado */
  situacao: string;
  dias: number | null;
}

/** Como está cada módulo deste cliente — para o painel do hospital. */
export async function modulosDoClienteDetalhe(
  clienteId: string
): Promise<ModuloDoCliente[]> {
  const { data, error } = await supabase.rpc('modulos_do_cliente',
    { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as ModuloDoCliente[];
}

export interface ModuloParaConfigurar extends ModuloDoCliente {
  /** Atendimentos futuros que somem da tela se este módulo cair. */
  futuros: number;
}

export async function modulosParaConfigurar(
  clienteId: string
): Promise<ModuloParaConfigurar[]> {
  const { data, error } = await supabase.rpc('modulos_para_configurar',
    { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as ModuloParaConfigurar[];
}

export async function salvarCliente(p: {
  clienteId: string;
  nome?: string | null; cnpj?: string | null;
  ativo?: boolean | null; demo?: boolean | null;
  nomeExibicao?: string | null; cor?: string | null; logoUrl?: string | null;
  /* ⭐ 19/10: a placa da porta, que a vitrine do chat mostra. */
  tagline?: string | null; telefone?: string | null;
  endereco?: string | null; horario?: string | null;
}): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('salvar_cliente', {
    p_cliente: p.clienteId,
    p_nome: p.nome ?? null, p_cnpj: p.cnpj ?? null,
    p_ativo: p.ativo ?? null, p_demo: p.demo ?? null,
    p_nome_exibicao: p.nomeExibicao ?? null,
    p_cor: p.cor ?? null, p_logo_url: p.logoUrl ?? null,
    p_tagline: p.tagline ?? null, p_telefone: p.telefone ?? null,
    p_endereco: p.endereco ?? null, p_horario: p.horario ?? null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' }) as
    { ok: boolean; mensagem: string };
}

export async function salvarModulosDoCliente(p: {
  clienteId: string; modulos: string[];
  expira?: string | null; semValidade?: boolean | null;
}): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('salvar_modulos_do_cliente', {
    p_cliente: p.clienteId, p_modulos: p.modulos,
    p_expira: p.expira || null, p_sem_validade: p.semValidade ?? null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' }) as
    { ok: boolean; mensagem: string };
}

export interface MeuAcesso {
  cliente_id: string;
  nome: string;
  slug: string;
  demo: boolean;
  ativo: boolean;
}

/**
 * ⭐⭐⭐ POR QUE ISTO NÃO É `meusClientes()` DE NOVO
 *
 * Desde 11/10/2026 `clientes.ativo` corta o acesso de verdade —
 * um hospital suspenso some de `public.clientes` inteiro.
 *
 * Aí a tela de "nenhum cliente" passaria a aparecer para duas
 * situações MUITO diferentes: "você nunca teve acesso" e "o seu
 * hospital está suspenso". Ela mandava rodar um comando SQL, o
 * que na segunda não resolve nada — e a recepção ligaria dizendo
 * que o sistema quebrou.
 *
 * Esta função atravessa a trava só para saber a DIFERENÇA, e não
 * devolve nada além dos hospitais a que a pessoa já está ligada.
 */
export async function meuAcesso(): Promise<MeuAcesso[]> {
  const { data, error } = await supabase.rpc('meu_acesso');
  if (error) throw error;
  return (data ?? []) as MeuAcesso[];
}

/* ════════════════════════════════════════════════════════════
 *  APARELHOS E SALAS                            (11/10/2026)
 *
 *  Os oito aparelhos do St James — Holter, Mapa, Eletro,
 *  Espirometria, Ergométrico, Polissonografia, Eletroencefalo —
 *  existiam no banco e não tinham tela nenhuma: `public.medicos`
 *  filtra `tipo = 'profissional'`, e era a única porta.
 * ════════════════════════════════════════════════════════════ */

export interface AparelhoDoCliente {
  id: string;
  nome: string;
  /** 'equipamento' | 'sala' */
  tipo: string;
  duracao_min: number;
  ativo: boolean;
  exames: number;
  faixas: number;
  expediente: string | null;
  futuros: number;
}

export async function aparelhosDoCliente(
  clienteId: string
): Promise<AparelhoDoCliente[]> {
  const { data, error } = await supabase.rpc('aparelhos_do_cliente',
    { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as AparelhoDoCliente[];
}

export async function salvarAparelho(p: {
  clienteId: string; nome: string; duracaoMin: number;
  id?: string | null; ativo?: boolean | null;
  tipo?: string; exames?: string[] | null;
}): Promise<{ ok: boolean; mensagem: string; id: string | null }> {
  const { data, error } = await supabase.rpc('salvar_aparelho', {
    p_cliente: p.clienteId, p_nome: p.nome, p_duracao_min: p.duracaoMin,
    p_id: p.id ?? null, p_ativo: p.ativo ?? null,
    p_tipo: p.tipo ?? 'equipamento', p_exames: p.exames ?? null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.', id: null }) as
    { ok: boolean; mensagem: string; id: string | null };
}

/** Os exames que ESTE aparelho faz — para marcar as caixinhas. */
export async function examesDoRecurso(
  clienteId: string, recursoId: string
): Promise<string[]> {
  const { data, error } = await supabase.rpc('servicos_do_recurso', {
    p_cliente: clienteId, p_recurso: recursoId, p_tipo: 'exame'
  });
  if (error) throw error;
  return (data ?? []).map((l: { id: string }) => l.id);
}

/* ════════════════════════════════════════════════════════════
 *  A FILA DE SOLICITAÇÕES                       (11/10/2026)
 *
 *  O Tom: *"acho melhor o setor receber a solicitação e
 *  providenciar a agenda."* Ninguém marca endoscopia sozinho.
 * ════════════════════════════════════════════════════════════ */

export interface SolicitacaoDaFila {
  id: string;
  situacao: string;
  criado_em: string;
  espera_dias: number;
  paciente_id: string;
  paciente: string;
  telefone: string | null;
  nascimento: string | null;
  servico_id: string;
  servico: string;
  setor: string | null;
  telefone_setor: string | null;
  convenio: string | null;
  preparo: string | null;
  perguntas: unknown[] | null;
  respostas: Record<string, string> | null;
  observacoes: string | null;
  preferencia: string | null;
  quem_abriu: string | null;
  quem_resolveu: string | null;
  resolvido_em: string | null;
  motivo: string | null;
  pedido_id: string | null;
  atencoes: number;
  /* ⭐ 26/10: a guia. `anexo_id` é a foto do pedido médico;
     `sem_pedido` é o motivo de o paciente ter caído na fila em
     vez de marcar sozinho. Um é o ARQUIVO, o outro é o FATO —
     e o fato precisa aparecer na tela mesmo quando o arquivo
     chegar depois, por telefone. */
  anexo_id: string | null;
  sem_pedido: boolean;
}

export async function solicitacoesDoCliente(p: {
  clienteId: string; situacao?: string | null; busca?: string | null;
  limite?: number;
}): Promise<SolicitacaoDaFila[]> {
  const { data, error } = await supabase.rpc('solicitacoes_do_cliente', {
    p_cliente: p.clienteId,
    p_situacao: p.situacao === undefined ? 'PENDENTE' : (p.situacao || null),
    p_busca: p.busca || null,
    p_limite: p.limite ?? 200
  });
  if (error) throw error;
  return (data ?? []) as SolicitacaoDaFila[];
}

export async function contagemDaFila(clienteId: string):
  Promise<{ situacao: string; quantas: number; mais_antiga_dias: number }[]> {
  const { data, error } = await supabase.rpc('contagem_da_fila',
    { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as
    { situacao: string; quantas: number; mais_antiga_dias: number }[];
}

export async function criarSolicitacao(p: {
  clienteId: string; servicoId: string;
  respostas: Record<string, string>;
  pacienteId?: string | null;
  nome?: string | null; cpf?: string | null; telefone?: string | null;
  email?: string | null; nascimento?: string | null;
  convenioId?: string | null; observacoes?: string | null;
  preferencia?: string | null;
}): Promise<{ ok: boolean; mensagem: string; id: string | null;
              paciente_id: string | null }> {
  const { data, error } = await supabase.rpc('criar_solicitacao', {
    p_cliente: p.clienteId, p_servico: p.servicoId,
    p_respostas: p.respostas,
    p_paciente: p.pacienteId ?? null,
    p_nome: p.nome ?? null, p_cpf: p.cpf ?? null,
    p_telefone: p.telefone ?? null, p_email: p.email ?? null,
    p_nascimento: p.nascimento || null,
    p_convenio: p.convenioId ?? null,
    p_observacoes: p.observacoes ?? null,
    p_preferencia: p.preferencia ?? null
  });
  if (error) throw error;
  return ((data ?? [])[0]
    ?? { ok: false, mensagem: 'Sem resposta.', id: null, paciente_id: null }) as
    { ok: boolean; mensagem: string; id: string | null; paciente_id: string | null };
}

export async function recusarSolicitacao(p: {
  clienteId: string; id: string; motivo: string; desistiu?: boolean;
}): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('recusar_solicitacao', {
    p_cliente: p.clienteId, p_id: p.id, p_motivo: p.motivo,
    p_desistiu: p.desistiu ?? false
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' }) as
    { ok: boolean; mensagem: string };
}

/** As perguntas da entrevista de UM exame. Só a tela de pedido usa. */
export async function perguntasDoExame(
  clienteId: string, servicoId: string
): Promise<unknown[]> {
  const { data, error } = await supabase.rpc('perguntas_do_exame', {
    p_cliente: clienteId, p_servico: servicoId
  });
  if (error) throw error;
  return (data ?? []) as unknown[];
}

/* ════════════════════════════════════════════════════════════
 *  O DASHBOARD                                  (11/10/2026)
 * ════════════════════════════════════════════════════════════ */

export interface ResumoDoDia {
  dia: string;
  marcados: number; confirmados: number; compareceram: number;
  faltaram: number; cancelados: number; encaixes: number;
  consultas: number; exames: number;
  fila_pendente: number; fila_mais_antiga: number; fila_atencao: number;
  conflitos: number; acima_do_limite: number; fora_da_faixa: number;
  medicos_sem_expediente: number; exames_sem_quem_faca: number;
  aparelhos_sem_horario: number;
  amanha: number;
}

export interface PendenciaDoDia {
  tipo: string; id: string; nome: string; detalhe: string;
}

export async function resumoDoDia(
  clienteId: string, dia?: string | null
): Promise<ResumoDoDia | null> {
  const { data, error } = await supabase.rpc('resumo_do_dia',
    { p_cliente: clienteId, p_dia: dia || null });
  if (error) throw error;
  return ((data ?? [])[0] ?? null) as ResumoDoDia | null;
}

export async function pendenciasDoDia(
  clienteId: string, dia?: string | null
): Promise<PendenciaDoDia[]> {
  const { data, error } = await supabase.rpc('pendencias_do_dia',
    { p_cliente: clienteId, p_dia: dia || null });
  if (error) throw error;
  return (data ?? []) as PendenciaDoDia[];
}


/* ════════════════════════════════════════════════════════════
 *  PERMISSÃO POR AÇÃO                           (13/10/2026)
 *
 *  O Tom: *"todos que têm acesso a determinada página podem
 *  fazer tudo. Abrir encaixe deveria ser para pessoas
 *  específicas."*
 * ════════════════════════════════════════════════════════════ */

export interface AcaoDoSistema {
  permissao: string;
  grupo: string;
  rotulo: string;
  ajuda: string;
  /** O que acontece com quem NÃO tem. */
  sem_ela: string;
}

/**
 * ⭐ O catálogo vem do BANCO, e não de uma lista nesta tela.
 *
 * Ação nova aparece para marcar no mesmo dia em que passa a
 * existir. Lista à mão envelheceria calada: a permissão nova
 * ficaria sem caixinha, ninguém a concederia, e a função que
 * depende dela recusaria todo mundo sem nada acusar o motivo.
 */
export async function acoesDoSistema(): Promise<AcaoDoSistema[]> {
  const { data, error } = await supabase.rpc('acoes_do_sistema');
  if (error) throw error;
  return (data ?? []) as AcaoDoSistema[];
}


/* ════════════════════════════════════════════════════════════
 *  MEDCALENDAR INSTITUCIONAL · CRESCER      (13/10/2026)
 *
 *  O Tom: *"queria primeiro algo MedCalendar institucional.
 *  Uma área multicliente onde eu conseguisse gerenciar os
 *  clientes do MedCalendar."*
 *
 *  Tudo aqui exige `sou_da_plataforma()` no BANCO. Esconder o
 *  botão é cortesia; a trava é lá.
 * ════════════════════════════════════════════════════════════ */

export async function criarCliente(p: {
  slug: string; nome: string; cnpj?: string | null;
  modulos?: string[]; email?: string | null;
}): Promise<{ ok: boolean; mensagem: string; id: string | null }> {
  const { data, error } = await supabase.rpc('criar_cliente', {
    p_slug: p.slug, p_nome: p.nome,
    p_cnpj: p.cnpj || null,
    p_modulos: p.modulos ?? ['agendamento'],
    p_email: p.email || null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.', id: null }) as
    { ok: boolean; mensagem: string; id: string | null };
}

export interface ClienteNoMonitor {
  id: string; nome: string; slug: string;
  ativo: boolean; demo: boolean;
  marcados_7d: number; marcados_30d: number; marcados_7d_antes: number;
  dias_parado: number | null;
  usuarios: number; usuarios_ativos_7d: number; pacientes: number;
  fila_pendente: number; exames_sem_quem_faca: number;
  modulos_vencendo: number;
}

export async function monitorDosClientes(): Promise<ClienteNoMonitor[]> {
  const { data, error } = await supabase.rpc('monitor_dos_clientes');
  if (error) throw error;
  return (data ?? []) as ClienteNoMonitor[];
}

export interface AssinaturaNaPlataforma {
  cliente_id: string; nome: string; slug: string; cliente_ativo: boolean;
  plano: string | null; valor_centavos: number | null;
  dia_vencimento: number | null; situacao: string | null;
  cortesia_ate: string | null; asaas_id: string | null;
  ultima_competencia: string | null; ultima_situacao: string | null;
  ultimo_vencimento: string | null;
  em_aberto: number; atraso_dias: number | null;
  aberto_centavos: number;
}

export async function assinaturasDaPlataforma(): Promise<AssinaturaNaPlataforma[]> {
  const { data, error } = await supabase.rpc('assinaturas_da_plataforma');
  if (error) throw error;
  return (data ?? []) as AssinaturaNaPlataforma[];
}

export interface CobrancaDoCliente {
  id: string; competencia: string; vencimento: string;
  valor_centavos: number; situacao: string;
  pago_em: string | null; valor_pago_centavos: number | null;
  asaas_id: string | null; link: string | null;
  origem_baixa: string | null; atraso_dias: number | null;
}

export async function cobrancasDoCliente(
  clienteId: string
): Promise<CobrancaDoCliente[]> {
  const { data, error } = await supabase.rpc('cobrancas_do_cliente',
    { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as CobrancaDoCliente[];
}

export async function salvarAssinatura(p: {
  clienteId: string;
  plano?: string | null; valorCentavos?: number | null;
  diaVencimento?: number | null; situacao?: string | null;
  cortesiaAte?: string | null; asaasId?: string | null;
  observacoes?: string | null;
}): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('salvar_assinatura', {
    p_cliente: p.clienteId,
    p_plano: p.plano ?? null,
    p_valor_centavos: p.valorCentavos ?? null,
    p_dia_vencimento: p.diaVencimento ?? null,
    p_situacao: p.situacao ?? null,
    p_cortesia_ate: p.cortesiaAte || null,
    p_asaas_id: p.asaasId ?? null,
    p_observacoes: p.observacoes ?? null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' }) as
    { ok: boolean; mensagem: string };
}

export async function gerarCobrancas(
  competencia?: string | null
): Promise<{ ok: boolean; mensagem: string; geradas: number }> {
  const { data, error } = await supabase.rpc('gerar_cobrancas',
    { p_competencia: competencia || null });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.', geradas: 0 }) as
    { ok: boolean; mensagem: string; geradas: number };
}

export async function baixarCobranca(p: {
  id: string; pagoEm?: string | null;
  valorCentavos?: number | null; origem?: string;
}): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('baixar_cobranca', {
    p_id: p.id, p_pago_em: p.pagoEm || null,
    p_valor_centavos: p.valorCentavos ?? null,
    p_origem: p.origem ?? 'na mão'
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' }) as
    { ok: boolean; mensagem: string };
}


/* ════════════════════════════════════════════════════════════
 *  WHATSAPP · O SEGREDO, O MODELO E A FILA   (13/10/2026)
 *
 *  O Tom: *"os modelos aprovados são os do número que estamos
 *  usando no apps script. Mas os modelos de outros hospitais
 *  precisarão ser aprovados."*
 *
 *  ⭐⭐⭐ É por isso que `modelosDoCliente` recebe um cliente.
 *  Modelo é do NÚMERO, não do sistema: hospital novo nasce sem
 *  nenhum, e o envio dele tem que recusar com essa frase em
 *  vez de tentar e queimar o número.
 * ════════════════════════════════════════════════════════════ */

export interface ChaveDeSegredo {
  chave: string; rotulo: string; ajuda: string;
}

/**
 * ⭐ O catálogo de chaves vem do BANCO, e `salvar_segredo`
 *    RECUSA chave fora dele.
 *
 *    Sem isso, um `whatsapp_token` com sublinhado seria
 *    gravado, a tela diria "Guardado." em verde, e o envio
 *    diria "falta configurar" para sempre — sem erro nenhum
 *    em lugar nenhum.
 */
export async function chavesDeSegredo(): Promise<ChaveDeSegredo[]> {
  const { data, error } = await supabase.rpc('chaves_de_segredo');
  if (error) throw error;
  return (data ?? []) as ChaveDeSegredo[];
}

export interface SegredoDoCliente {
  chave: string;
  /** Só os quatro últimos: `••••4f2a`. O resto nunca sai do banco. */
  fim: string;
  atualizado_em: string;
}

export async function segredosDoCliente(
  clienteId: string
): Promise<SegredoDoCliente[]> {
  const { data, error } = await supabase.rpc('segredos_do_cliente',
    { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as SegredoDoCliente[];
}

export async function salvarSegredo(p: {
  clienteId: string; chave: string; valor: string;
}): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('salvar_segredo', {
    p_cliente: p.clienteId, p_chave: p.chave, p_valor: p.valor
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' }) as
    { ok: boolean; mensagem: string };
}

export interface ModeloWhatsApp {
  chave: string; nome_meta: string; idioma: string;
  variaveis: string[]; previa: string | null; ativo: boolean;
}

export async function modelosDoCliente(
  clienteId: string
): Promise<ModeloWhatsApp[]> {
  const { data, error } = await supabase.rpc('modelos_do_cliente',
    { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as ModeloWhatsApp[];
}

export async function salvarModeloWhatsApp(p: {
  clienteId: string; chave: string; nomeMeta: string;
  variaveis?: string[]; idioma?: string | null;
  previa?: string | null; ativo?: boolean | null;
}): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('salvar_modelo_whatsapp', {
    p_cliente: p.clienteId, p_chave: p.chave, p_nome_meta: p.nomeMeta,
    p_variaveis: p.variaveis ?? [],
    p_idioma: p.idioma || null,
    p_previa: p.previa || null,
    p_ativo: p.ativo ?? null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' }) as
    { ok: boolean; mensagem: string };
}

export interface MensagemNaFila {
  id: string; situacao: string;
  criado_em: string; enviada_em: string | null;
  /** Já vem mascarado do banco: `(••) •••••-4321`. */
  telefone: string;
  paciente: string | null;
  modelo_chave: string; previa: string | null;
  erro: string | null; tentativas: number;
  provider_id: string | null;
}

export async function mensagensDoCliente(p: {
  clienteId: string; situacao?: string | null; limite?: number | null;
}): Promise<MensagemNaFila[]> {
  const { data, error } = await supabase.rpc('mensagens_do_cliente', {
    p_cliente: p.clienteId,
    p_situacao: p.situacao || null,
    p_limite: p.limite ?? null
  });
  if (error) throw error;
  return (data ?? []) as MensagemNaFila[];
}

export async function contagemDasMensagens(
  clienteId: string
): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('contagem_das_mensagens',
    { p_cliente: clienteId });
  if (error) throw error;
  const fora: Record<string, number> = {};
  for (const l of (data ?? []) as { situacao: string; quantas: number }[]) {
    fora[l.situacao] = l.quantas;
  }
  return fora;
}

export async function enfileirarMensagem(p: {
  clienteId: string; modelo: string; telefone: string;
  variaveis: string[]; previa?: string | null;
  agendamentoId?: string | null; pacienteId?: string | null;
}): Promise<{ ok: boolean; mensagem: string; id: string | null }> {
  const { data, error } = await supabase.rpc('enfileirar_mensagem', {
    p_cliente: p.clienteId, p_modelo: p.modelo,
    p_telefone: p.telefone, p_variaveis: p.variaveis,
    p_previa: p.previa || null,
    p_agendamento: p.agendamentoId || null,
    p_paciente: p.pacienteId || null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.', id: null }) as
    { ok: boolean; mensagem: string; id: string | null };
}


/* ════════════════════════════════════════════════════════════
 *  O ENCAIXE SEGUE A AGENDA              (13/10/2026)
 *
 *  O Tom: *"Se estou em uma agenda de exame, vai ser exame; se
 *  estou numa agenda de consulta, vai ser consulta. Hoje está
 *  aparecendo todas as especialidades, isso pode dar erro."*
 * ════════════════════════════════════════════════════════════ */

export interface ServicoDoRecurso {
  id: string;
  nome: string;
  nome_completo: string;
  tipo: 'consulta' | 'exame' | 'procedimento';
  pai_id: string | null;
  duracao_efetiva: number;
  /** especifico · geral · aberto */
  motivo: string;
  subtipos: number;
  /** A especialidade do serviço é uma das deste recurso? */
  da_especialidade: boolean;
  especialidade: string | null;
}

/**
 * ⭐⭐⭐ Esta é a MESMA função que a Agenda do Médico usa desde
 *    09/10, e que a Aparelhos usa para marcar as caixinhas.
 *
 *    Em 13/10 eu quase escrevi uma segunda, só para o encaixe —
 *    e o guarda de funções duplicadas pegou. A minha não
 *    conhecia a regra do pai com filhos: ofereceria
 *    "Ultrassonografia" em vez de "Ultrassonografia —
 *    Tireoide", e a guia do convênio sairia sem código TUSS.
 */
export async function servicosDoRecurso(
  clienteId: string, recursoId: string, tipo: string | null = null
): Promise<ServicoDoRecurso[]> {
  const { data, error } = await supabase.rpc('servicos_do_recurso',
    { p_cliente: clienteId, p_recurso: recursoId, p_tipo: tipo });
  if (error) throw error;
  return (data ?? []) as ServicoDoRecurso[];
}

export interface TipoDaAgenda {
  tipo_recurso: string;
  faz_consulta: boolean;
  faz_exame: boolean;
  /** consulta · exame · ambos · nenhum */
  agenda: 'consulta' | 'exame' | 'ambos' | 'nenhum';
}

export async function tipoDaAgenda(
  recursoId: string
): Promise<TipoDaAgenda | null> {
  const { data, error } = await supabase.rpc('tipo_da_agenda',
    { p_recurso: recursoId });
  if (error) throw error;
  return ((data ?? [])[0] ?? null) as TipoDaAgenda | null;
}


/* ════════════════════════════════════════════════════════════
 *  OS RANKINGS DO DASHBOARD                 (13/10/2026)
 *
 *  O Tom: *"O Dashboard tem a questão do top médicos,
 *  especialidades, exames, usuários, convênios etc."*
 * ════════════════════════════════════════════════════════════ */

export interface EixoDoRanking {
  eixo: string; rotulo: string; ajuda: string;
}

/** ⭐ O catálogo vem do banco: eixo novo aparece no mesmo dia. */
export async function eixosDoRanking(): Promise<EixoDoRanking[]> {
  const { data, error } = await supabase.rpc('eixos_do_ranking');
  if (error) throw error;
  return (data ?? []) as EixoDoRanking[];
}

export interface LinhaDoRanking {
  id: string | null;
  nome: string;
  detalhe: string | null;
  marcados: number;
  compareceram: number;
  faltaram: number;
  cancelados: number;
  /** 0 a 100. null = ninguém chegou a ter data passada. */
  taxa_presenca: number | null;
  /** Quanto este item representa do TOTAL do período. */
  fatia: number;
}

export async function rankingDoPeriodo(p: {
  clienteId: string; eixo: string;
  de?: string | null; ate?: string | null; limite?: number | null;
}): Promise<LinhaDoRanking[]> {
  const { data, error } = await supabase.rpc('ranking_do_periodo', {
    p_cliente: p.clienteId, p_eixo: p.eixo,
    p_de: p.de || null, p_ate: p.ate || null,
    p_limite: p.limite ?? 10
  });
  if (error) throw error;
  return (data ?? []) as LinhaDoRanking[];
}


/* ════════════════════════════════════════════════════════════
 *  O RECEPTIVO · CONVERSAS E PROTOCOLOS     (13/10/2026)
 *
 *  O Tom: *"No WhatsApp não quero tela de texto. Toda interação
 *  com paciente vai ser via chat. Quando o paciente falar um oi
 *  no número do WhatsApp quero aquelas automações que
 *  direcionam para o link do chat."*
 * ════════════════════════════════════════════════════════════ */

export interface ConversaNaLista {
  telefone: string;
  /** Já vem mascarado do banco: `(••) •••••-4321`. */
  telefone_curto: string;
  paciente: string | null;
  ultima_em: string;
  ultima_texto: string | null;
  ultima_direcao: 'ENTRADA' | 'SAIDA';
  intencao: string | null;
  urgente: boolean;
  quantas: number;
  /** Quantas mensagens ficaram sem resposta, e por quê. */
  sem_resposta: number;
  /** A janela de 24h da Meta ainda está aberta? */
  janela_aberta: boolean;
  janela_minutos: number;
  protocolo_aberto: boolean;
  /**
   * ⭐ 20/10: de qual setor é o protocolo aberto desta conversa,
   *    e se EU estou marcado nele.
   *
   *    Quem responde não é "a recepção": é quem está no setor.
   *    Sem isto, o cadastro de setores seria etiqueta bonita e
   *    a fila continuaria sendo uma só.
   */
  setor_id: string | null;
  setor: string | null;
  do_meu_setor: boolean;
  /** ⭐ 21/10: o número em que o paciente escreveu por último. */
  numero_id: string | null;
  numero: string | null;
  /** O recado aberto (o MESMO de Mensagens dos Pacientes) e quem atende. */
  protocolo_id: string | null;
  atendente: string | null;
  comigo: boolean;
}

export async function conversasDoCliente(
  clienteId: string, limite = 60
): Promise<ConversaNaLista[]> {
  const { data, error } = await supabase.rpc('conversas_do_cliente',
    { p_cliente: clienteId, p_limite: limite });
  if (error) throw error;
  return (data ?? []) as ConversaNaLista[];
}

export interface EventoDaConversa {
  id: string;
  direcao: 'ENTRADA' | 'SAIDA';
  texto: string | null;
  intencao: string | null;
  nivel: string | null;
  /** Por que o robô leu assim. Vai na tela, não só no log. */
  porque: string | null;
  /** Por que NÃO respondemos. Vazio = respondemos. */
  sem_resposta: string | null;
  criado_em: string;
  /** ⭐ 21/10: quem respondeu pelo painel. Nulo = o robô. */
  autor?: string | null;
  /** Resposta pelo painel que ainda não saiu. */
  pendente?: boolean;
}

export async function conversaCompleta(
  clienteId: string, telefone: string
): Promise<EventoDaConversa[]> {
  const { data, error } = await supabase.rpc('conversa_completa',
    { p_cliente: clienteId, p_telefone: telefone });
  if (error) throw error;
  return (data ?? []) as EventoDaConversa[];
}

export async function fecharProtocolo(p: {
  id: string; nota?: string | null;
}): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('fechar_protocolo',
    { p_id: p.id, p_nota: p.nota || null });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' }) as
    { ok: boolean; mensagem: string };
}


/* ════════════════════════════════════════════════════════════
 *  O CHAT DO PACIENTE — A PORTA PÚBLICA     (14/10/2026)
 *
 *  ⚠️ Tudo aqui é chamado SEM LOGIN, com a chave publicável.
 *     Nenhuma destas funções recebe `clienteId`: elas recebem o
 *     SLUG, e é o banco que resolve de qual hospital se trata.
 *
 *  ⭐ A diferença não é de estilo. Um `clienteId` vindo da tela
 *     seria um id que o visitante escolhe — e aí bastaria
 *     trocá-lo para ler a agenda de outro hospital. O slug está
 *     no endereço, e o banco confere tudo contra ele.
 * ════════════════════════════════════════════════════════════ */

export interface HospitalDoChat {
  cliente_id: string;
  nome: string;
  cor: string;
  logo_url: string | null;
  tagline: string;
  telefone: string | null;
  endereco: string | null;
  horario: string | null;
  horario_pa: string | null;
  politica_url: string | null;
  politica_versao: string;
  marcar_consulta: boolean;
  fuso: string;
  /* ⭐ 19/10: a placa da porta, e o que mais existe neste
     hospital — o menu do chat não pode oferecer porta que não
     abre. */
  cnpj: string | null;
  tem_exames: boolean;
}

export async function chatHospital(slug: string): Promise<HospitalDoChat | null> {
  const { data, error } = await supabase.rpc('chat_hospital', { p_slug: slug });
  if (error) throw error;
  return ((data ?? [])[0] ?? null) as HospitalDoChat | null;
}

export interface ItemDoChat {
  id: string;
  nome: string;
  /**
   * ⭐ Só as especialidades trazem. Vem de
   *    `public.chat_especialidades`, que escolhe entre o emoji
   *    que o hospital gravou, o do pai (uma subespecialidade
   *    herda o 🦴 de "Ortopedia") e o chute pelo nome. Nunca
   *    volta vazio — mas é opcional aqui porque os convênios
   *    usam a mesma interface e o ícone deles é fixo na tela.
   */
  icone?: string | null;
  /**
   * ⭐ Só as especialidades-PAI trazem. `true` = tocar neste
   *    botão abre a lista de subáreas em vez de ir para o
   *    convênio.
   *
   *    Vem do banco de propósito: a tela saber disto ANTES de
   *    desenhar evita chamar `chat_subespecialidades` para cada
   *    especialidade só para descobrir se deve perguntar.
   */
  tem_subareas?: boolean;
}

export async function chatEspecialidades(slug: string): Promise<ItemDoChat[]> {
  const { data, error } = await supabase.rpc('chat_especialidades', { p_slug: slug });
  if (error) throw error;
  return (data ?? []) as ItemDoChat[];
}

/**
 * As subáreas de uma especialidade — o segundo passo que o Tom
 * pediu em 17/10: *"eu clico em ortopedia e depois as opções
 * das subespecialidades."*
 *
 * ⚠️ Só chame quando `tem_subareas` for `true`. As duas
 *    respostas saem da MESMA regra no banco
 *    (`core.especialidade_tem_medico`), então elas não
 *    discordam — e há um placar que confere isso em todos os
 *    pais do hospital, um a um.
 */
export async function chatSubespecialidades(
  slug: string, especialidade: string
): Promise<ItemDoChat[]> {
  const { data, error } = await supabase.rpc('chat_subespecialidades', {
    p_slug: slug, p_especialidade: especialidade
  });
  if (error) throw error;
  return (data ?? []) as ItemDoChat[];
}

export async function chatConvenios(slug: string): Promise<ItemDoChat[]> {
  const { data, error } = await supabase.rpc('chat_convenios', { p_slug: slug });
  if (error) throw error;
  return (data ?? []) as ItemDoChat[];
}

export interface MedicoDoChat {
  id: string; nome: string; duracao_min: number;
  servico_id: string; servico: string;
}

export async function chatMedicos(p: {
  slug: string; especialidade: string;
  convenio?: string | null; nascimento?: string | null;
  de?: string | null; ate?: string | null;
}): Promise<MedicoDoChat[]> {
  const { data, error } = await supabase.rpc('chat_medicos', {
    p_slug: p.slug, p_especialidade: p.especialidade,
    p_convenio: p.convenio || null, p_nascimento: p.nascimento || null,
    p_de: p.de || null, p_ate: p.ate || null
  });
  if (error) throw error;
  return (data ?? []) as MedicoDoChat[];
}

/** A MESMA grade que a recepção lê — ver `chat_grade` no 036. */
export async function chatGrade(
  slug: string, recursoId: string, de: string, ate: string
): Promise<Grade> {
  const { data, error } = await supabase.rpc('chat_grade', {
    p_slug: slug, p_recurso: recursoId, p_de: de, p_ate: ate
  });
  if (error) throw error;
  return data as Grade;
}

/**
 * ⭐⭐⭐ DUAS SITUAÇÕES, DUAS RESPOSTAS — 19/10/2026
 *
 * `data_minima` é a ESPERA de quem já consultou: nada a fazer
 * senão voltar depois.
 *
 * `ja_tem_*` é o ENGANO de quem já tem consulta marcada: aí a
 * saída certa não é "não", é reagendar aquela consulta.
 *
 * O Tom recusou tratar as duas como "dia cinza", e tinha razão:
 * quem já tem consulta ligaria para o hospital para perguntar
 * por que não consegue marcar — tendo a consulta marcada.
 */
export interface PrimeiraDataDoChat {
  data_minima: string;
  dias_retorno: number;
  motivo: string;
  ja_tem_id: string | null;
  ja_tem_em: string | null;
  ja_tem_servico: string | null;
}

export async function chatPrimeiraData(
  slug: string, recursoId: string, cpf?: string | null
): Promise<PrimeiraDataDoChat | null> {
  const { data, error } = await supabase.rpc('chat_primeira_data', {
    p_slug: slug, p_recurso: recursoId, p_cpf: cpf || null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? null);
}

/**
 * ⭐ Reagendar pela porta pública. Ela NÃO recebe qual
 * agendamento: descobre sozinha, pelo CPF e pelo profissional.
 * O navegador não escolhe o alvo — ver o bloco no `036`.
 */
export async function chatReagendar(
  slug: string, cpf: string, agendamentoId: string, novoInicio: string
): Promise<{ ok: boolean; mensagem: string; agendamento_id: string | null }> {
  const { data, error } = await supabase.rpc('chat_reagendar', {
    p_slug: slug, p_cpf: cpf,
    p_agendamento: agendamentoId, p_novo_inicio: novoInicio
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.', agendamento_id: null });
}

/* ⭐ "Outros assuntos": o recado vira protocolo, na mesma fila
   que o WhatsApp receptivo alimenta. */
/** ⭐ 20/10: os setores vêm do CADASTRO do hospital. */
export interface SetorDoChat {
  id: string; nome: string; descricao: string | null;
  icone: string; no_whatsapp: boolean;
}

export async function chatSetores(slug: string): Promise<SetorDoChat[]> {
  const { data, error } = await supabase.rpc('chat_setores', { p_slug: slug });
  if (error) throw error;
  return (data ?? []) as SetorDoChat[];
}

export async function chatFalar(
  slug: string, cpf: string, telefone: string,
  setorId: string, mensagem: string
): Promise<{ ok: boolean; mensagem: string; protocolo: string | null }> {
  const { data, error } = await supabase.rpc('chat_falar', {
    p_slug: slug, p_cpf: cpf, p_telefone: telefone,
    p_setor: setorId, p_mensagem: mensagem
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.', protocolo: null });
}

/* ---------- os setores, no painel ---------- */

export interface SetorDoCliente {
  id: string; nome: string; descricao: string | null; icone: string | null;
  ordem: number; ativo: boolean; no_whatsapp: boolean;
  /** Quantas pessoas ATIVAS recebem o que chega aqui. */
  pessoas: number;
  abertos: number;
  /**
   * ⭐ Quem está marcado neste setor — ativos e inativos.
   *
   *    `pessoas` responde "alguém vai ler?"; `quem` responde
   *    "esta pessoa está marcada?". O formulário usa `quem`,
   *    porque abrir a ficha de alguém desativado sem as marcas
   *    dele e salvar apagaria os setores em silêncio.
   */
  quem: string[];
}

export async function setoresDoCliente(clienteId: string): Promise<SetorDoCliente[]> {
  const { data, error } = await supabase.rpc('setores_do_cliente', {
    p_cliente: clienteId
  });
  if (error) throw error;
  return (data ?? []) as SetorDoCliente[];
}

export async function salvarSetor(p: {
  clienteId: string; nome: string;
  descricao?: string | null; icone?: string | null;
  ordem?: number | null; ativo?: boolean | null;
  noWhatsapp?: boolean | null; id?: string | null;
}): Promise<{ ok: boolean; mensagem: string; id: string | null }> {
  const { data, error } = await supabase.rpc('salvar_setor', {
    p_cliente: p.clienteId, p_nome: p.nome,
    p_descricao: p.descricao ?? null, p_icone: p.icone ?? null,
    p_ordem: p.ordem ?? null, p_ativo: p.ativo ?? null,
    p_no_whatsapp: p.noWhatsapp ?? null, p_id: p.id ?? null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.', id: null });
}

export async function salvarSetoresDoUsuario(
  clienteId: string, usuarioId: string, setores: string[]
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('salvar_setores_do_usuario', {
    p_cliente: clienteId, p_usuario: usuarioId, p_setores: setores
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' });
}

/**
 * ⭐ 20/10: a MESMA verdade pelo lado do setor.
 *
 *    O Tom: *"incluir a cada usuário individualmente."* Isso
 *    tem duas portas naturais — abrindo a pessoa ("o que ela
 *    atende?") e abrindo o setor ("quem atende isto?") — e as
 *    duas escrevem a mesma coluna. Guardar uma segunda lista
 *    do lado do setor seria o defeito de sempre.
 */
export async function salvarQuemAtendeOSetor(
  clienteId: string, setorId: string, usuarios: string[]
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('salvar_quem_atende_o_setor', {
    p_cliente: clienteId, p_setor: setorId, p_usuarios: usuarios
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' });
}

/**
 * ⭐⭐⭐ 20/10: EXCLUIR um setor.
 *
 *    A tabela continua sem `grant delete` — quem apaga é esta
 *    função, que confere a permissão e escreve na auditoria
 *    antes. O recado que estava naquele setor FICA na fila,
 *    sem setor: foi a escolha do Tom.
 */
export async function excluirSetor(
  clienteId: string, id: string
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('excluir_setor', {
    p_cliente: clienteId, p_id: id
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' });
}


/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ MENSAGENS DOS PACIENTES            (20/10/2026)
 *
 *  A fila do Apps Script, com dono. O Tom: *"cada usuário só
 *  enxerga as mensagens do seu setor, assume a que quiser."*
 * ════════════════════════════════════════════════════════════ */
export type AbaDasMensagens =
  'atender' | 'atendendo' | 'comigo' | 'atendidos' | 'todos';

export type OrdemDasMensagens = 'antigos' | 'recentes';

export interface MensagemDoPainel {
  id: string;
  /** O número que o paciente recebeu, para ele citar. */
  protocolo: string;
  telefone: string;
  telefone_curto: string;
  paciente: string | null;
  assunto: string | null;
  texto: string | null;
  quantas: number;
  setor_id: string | null;
  setor: string | null;
  icone: string | null;
  urgente: boolean;
  situacao: string;
  aberto_em: string;
  horas: number;
  assumido_por: string | null;
  quem_atende: string | null;
  meu: boolean;
  /** Posso devolver/concluir esta? Quem decide é o banco. */
  posso_mexer: boolean;
}

export async function mensagensDoPainel(p: {
  clienteId: string;
  aba?: AbaDasMensagens;
  setor?: string | null;
  busca?: string | null;
  ordem?: OrdemDasMensagens;
  limite?: number;
}): Promise<MensagemDoPainel[]> {
  const { data, error } = await supabase.rpc('mensagens_do_painel', {
    p_cliente: p.clienteId,
    p_aba: p.aba ?? 'atender',
    p_setor: p.setor ?? null,
    p_busca: p.busca || null,
    p_ordem: p.ordem ?? 'antigos',
    p_limite: p.limite ?? 100
  });
  if (error) throw error;
  return (data ?? []) as MensagemDoPainel[];
}

export interface ContadoresDasMensagens {
  a_atender: number;
  em_atendimento: number;
  comigo: number;
  esperando_24h: number;
  concluidas_hoje: number;
}

export async function contadoresDasMensagens(clienteId: string):
  Promise<ContadoresDasMensagens> {
  const { data, error } = await supabase.rpc('contadores_das_mensagens',
    { p_cliente: clienteId });
  if (error) throw error;
  return ((data ?? [])[0] ?? {
    a_atender: 0, em_atendimento: 0, comigo: 0,
    esperando_24h: 0, concluidas_hoje: 0
  }) as ContadoresDasMensagens;
}

export async function assumirMensagem(
  clienteId: string, protocolo: string
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('assumir_mensagem', {
    p_cliente: clienteId, p_protocolo: protocolo
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' });
}

export async function devolverMensagem(
  clienteId: string, protocolo: string
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('devolver_mensagem', {
    p_cliente: clienteId, p_protocolo: protocolo
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' });
}

/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ "MEUS AGENDAMENTOS" E CANCELAR   (19/10/2026)
 *
 *  A escolha do Tom para a tela seguinte, e a razão dele é boa:
 *  cancelar precisa que o paciente veja o que tem marcado, e
 *  essa MESMA lista é a base do Reagendar. Uma tela destrava
 *  duas.
 * ════════════════════════════════════════════════════════════ */
export interface AgendamentoDoChat {
  id: string;
  quando: string;
  servico: string;
  profissional: string;
  /** ⭐ 20/10: para o Reagendar abrir o calendário certo. */
  recurso_id: string;
  eh_aparelho: boolean;
  situacao: string;
  pode_cancelar: boolean;
}

export async function chatMeusAgendamentos(
  slug: string, cpf: string
): Promise<AgendamentoDoChat[]> {
  const { data, error } = await supabase.rpc('chat_meus_agendamentos', {
    p_slug: slug, p_cpf: cpf
  });
  if (error) throw error;
  return (data ?? []) as AgendamentoDoChat[];
}

export async function chatCancelar(
  slug: string, cpf: string, agendamentoId: string, motivo?: string | null
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('chat_cancelar', {
    p_slug: slug, p_cpf: cpf,
    p_agendamento: agendamentoId, p_motivo: motivo ?? null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' });
}

/* ⭐ Exames pelo chat — mesma regra de subárea, outro nome. */
/** ⭐ 26/10, à tarde: um bloco do cartaz de orientações. */
export interface BlocoDeOrientacao {
  icone?: string | null;
  titulo?: string | null;
  texto?: string | null;
}

export interface ExameDoChat {
  id: string; nome: string; icone: string;
  tem_subtipos: boolean; entrevista: boolean;
  /* ⭐⭐⭐ 26/10, à tarde: o cartaz do Laboratório.
     O Tom: *"quando alguém clicar em cima do laboratório o chat
     mostre essas orientações"* — e, na mesma mensagem, a regra
     que manda em tudo: *"precisa deixar disponível e
     personalizável para qualquer hospital"*. Por isso é
     cadastro, e por isso vem do banco. */
  orientacoes?: BlocoDeOrientacao[] | null;
  /** Este exame NÃO agenda pelo chat: mostra o cartão e encerra. */
  so_orientacao?: boolean;
  /* ⭐ 26/10: as perguntas vêm JUNTO com o exame. Antes a tela
     sabia que havia entrevista e não tinha como mostrá-la —
     e o chat mandava o paciente ligar para o setor. */
  perguntas: unknown[] | null;
  preparo: string | null; setor: string | null; telefone_setor: string | null;
}

export async function chatExames(slug: string): Promise<ExameDoChat[]> {
  const { data, error } = await supabase.rpc('chat_exames', { p_slug: slug });
  if (error) throw error;
  return (data ?? []) as ExameDoChat[];
}

/* ⭐⭐⭐ 26/10: O SUBTIPO TAMBÉM TEM ENTREVISTA.
 *
 * O Tom: *"Testei a Colonoscopia e não está indo no chat para a
 * entrevista configurada no painel."* O `chat_exames` devolvia
 * `entrevista`; o `chat_subtipos` NÃO. Quem escolhia o subtipo
 * caía no caminho de marcar horário direto, e a entrevista que
 * o setor tinha configurado simplesmente não acontecia — sem
 * erro nenhum, que é o jeito mais caro de errar.
 *
 * A regra do banco: o subtipo herda do pai quando ele próprio
 * não pede entrevista. Aqui a tela só obedece. */
export interface SubtipoDoChat {
  id: string; nome: string; icone: string; preparo: string | null;
  entrevista: boolean; perguntas: unknown[] | null;
  /** ⭐ Herdados do pai quando o subtipo não tem os seus. */
  orientacoes?: BlocoDeOrientacao[] | null;
  so_orientacao?: boolean;
}

export async function chatSubtipos(
  slug: string, exameId: string
): Promise<SubtipoDoChat[]> {
  const { data, error } = await supabase.rpc('chat_subtipos', {
    p_slug: slug, p_exame: exameId
  });
  if (error) throw error;
  return (data ?? []) as SubtipoDoChat[];
}

export interface QuemFazNoChat {
  id: string; nome: string; eh_aparelho: boolean;
  duracao_min: number; geral: boolean;
}

export async function chatQuemFaz(
  slug: string, servicos: string[], convenioId?: string | null,
  de?: string | null, ate?: string | null
): Promise<QuemFazNoChat[]> {
  const { data, error } = await supabase.rpc('chat_quem_faz', {
    p_slug: slug, p_servicos: servicos,
    p_convenio: convenioId ?? null,
    p_nascimento: null, p_de: de ?? null, p_ate: ate ?? null
  });
  if (error) throw error;
  return (data ?? []) as QuemFazNoChat[];
}

export async function chatMarcarExame(p: {
  slug: string; recursoId: string; servicos: string[];
  inicio: string; nome: string; cpf: string; telefone: string;
  nascimento?: string | null; convenioId?: string | null;
  /* ⭐ 26/10: sem a guia o banco RECUSA, com motivo='SEM_PEDIDO'.
     A decisão do Tom: *"se não tiver anexo não deixa ir para os
     horários"*. A trava é do banco, não da tela — tela some,
     banco fica. */
  anexoId?: string | null;
}): Promise<{ ok: boolean; mensagem: string; pedido_id: string | null;
              motivo: string | null; marcados: number }> {
  const { data, error } = await supabase.rpc('chat_marcar_exame', {
    p_slug: p.slug, p_recurso: p.recursoId, p_servicos: p.servicos,
    p_inicio: p.inicio, p_nome: p.nome, p_cpf: p.cpf,
    p_telefone: p.telefone, p_nascimento: p.nascimento ?? null,
    p_email: null, p_convenio: p.convenioId ?? null,
    p_anexo: p.anexoId ?? null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.',
                               pedido_id: null, motivo: null, marcados: 0 });
}

/* ⭐⭐⭐ O EXAME QUE VIRA PEDIDO NA FILA        (26/10/2026)
 *
 * O Tom, com todas as letras: *"os exames sem anexo viram
 * solicitação e vão para a fila, recepção entra em contato e
 * conclui o agendamento."*
 *
 * Dois caminhos chegam aqui, e são caminhos diferentes:
 *   • o exame PEDE ENTREVISTA  → responde e vai para a fila,
 *     com ou sem guia (o setor é que decide a agenda);
 *   • o exame NÃO pede, mas a guia não veio → fila também,
 *     marcada com `sem_pedido`, para a recepção ligar.
 *
 * Um exame, uma solicitação — mesmo quando a guia é uma só e
 * lista três. É por isso que `p_servicos` é uma lista e a
 * resposta tem `quantos`. */
export async function chatSolicitarExame(p: {
  slug: string; servicos: string[];
  respostas?: Record<string, string> | null;
  nome: string; cpf: string; telefone: string;
  nascimento?: string | null; email?: string | null;
  convenioId?: string | null; anexoId?: string | null;
  preferencia?: string | null;
}): Promise<{ ok: boolean; mensagem: string;
              protocolo: string | null; quantos: number }> {
  const { data, error } = await supabase.rpc('chat_solicitar_exame', {
    p_slug: p.slug, p_servicos: p.servicos,
    p_respostas: p.respostas ?? {},
    p_nome: p.nome, p_cpf: p.cpf, p_telefone: p.telefone,
    p_nascimento: p.nascimento ?? null, p_email: p.email ?? null,
    p_convenio: p.convenioId ?? null, p_anexo: p.anexoId ?? null,
    p_preferencia: p.preferencia ?? null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.',
                               protocolo: null, quantos: 0 });
}

/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ A FOTO DO PEDIDO MÉDICO            (26/10/2026)
 *
 *  O navegador NÃO fala com o Storage. Ele entrega o arquivo à
 *  Edge Function `anexo-do-pedido`, e ela é que confere tamanho,
 *  tipo, consentimento e freio ANTES de o arquivo existir.
 *
 *  Se a tela gravasse direto, a política do bucket teria de
 *  liberar `anon` — e `anon` é a chave que está no código desta
 *  página, visível para o mundo. O Storage do hospital viraria
 *  disco de quem quisesse.
 * ════════════════════════════════════════════════════════════ */
export async function enviarAnexoDoPedido(p: {
  slug: string; cpf: string; arquivo: File;
  /* ⭐ 26/10, à tarde: a guia a que esta folha pertence. A
     primeira folha vai sem; da segunda em diante vai o id que
     voltou na primeira, e é isso que faz frente e verso serem
     o MESMO pedido médico. */
  guiaId?: string | null;
}): Promise<{ ok: boolean; mensagem: string; id?: string;
              guia?: string; pagina?: number }> {
  const form = new FormData();
  form.append('slug', p.slug);
  form.append('cpf', p.cpf);
  form.append('arquivo', p.arquivo);
  if (p.guiaId) form.append('guia', p.guiaId);

  const { data, error } = await supabase.functions.invoke('anexo-do-pedido', {
    body: form
  });
  if (error) {
    return { ok: false, mensagem: explicarErroDaFuncao('anexo-do-pedido', error) };
  }
  return (data ?? { ok: false, mensagem: 'Sem resposta.' }) as
    { ok: boolean; mensagem: string; id?: string; guia?: string; pagina?: number };
}

export interface PaginaDaGuia { url: string; tipo: string; pagina: number }

/** ⭐ Abrir a guia no painel: URLs assinadas que valem 5 minutos.
 *  Quem decide se pode ver é o BANCO, com o login de quem
 *  clicou — a mesma regra do resto do painel.
 *
 *  ⚠️ Devolve TODAS as folhas. Abrir só a que está apontada na
 *     fila mostraria a frente e esconderia o verso. */
export async function verAnexo(anexoId: string):
  Promise<{ ok: boolean; paginas?: PaginaDaGuia[]; url?: string;
            tipo?: string; faltaram?: number; mensagem?: string }> {
  const { data, error } = await supabase.functions.invoke('ver-anexo', {
    body: { anexo: anexoId }
  });
  if (error) {
    return { ok: false, mensagem: explicarErroDaFuncao('ver-anexo', error) };
  }
  return (data ?? { ok: false, mensagem: 'Sem resposta.' }) as
    { ok: boolean; paginas?: PaginaDaGuia[]; url?: string;
      tipo?: string; faltaram?: number; mensagem?: string };
}

export interface QuemEhNoChat {
  /** ⭐ 20/10: o freio pegou — NÃO é "você não é paciente". */
  travado: boolean;
  achou: boolean;
  /** SÓ o primeiro nome. O banco nunca devolve o completo. */
  primeiro_nome: string | null;
  /** `(••) •••••-4321`. */
  telefone_fim: string | null;
  tem_telefone: boolean;
  mensagem: string | null;
  /** ⭐ 20/10: "Maria A*** S***" — para o RESUMO. Nunca o completo. */
  nome_mascarado?: string | null;
}

export async function chatReconhecer(
  slug: string, cpf: string
): Promise<QuemEhNoChat> {
  const { data, error } = await supabase.rpc('chat_reconhecer', {
    p_slug: slug, p_cpf: cpf
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? {
    travado: false, achou: false, primeiro_nome: null, telefone_fim: null,
    tem_telefone: false, mensagem: 'Sem resposta.'
  }) as QuemEhNoChat;
}

export async function chatConsentir(p: {
  slug: string; cpf: string; finalidades: string[];
  versao?: string | null; telefone?: string | null;
}): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('chat_consentir', {
    p_slug: p.slug, p_cpf: p.cpf, p_finalidades: p.finalidades,
    p_versao: p.versao || null, p_telefone: p.telefone || null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' });
}

export async function chatMarcar(p: {
  slug: string; recursoId: string; servicoId: string; inicio: string;
  nome: string; cpf: string; telefone: string;
  nascimento?: string | null; email?: string | null;
  convenioId?: string | null; observacoes?: string | null;
}): Promise<{ ok: boolean; mensagem: string; agendamento_id: string | null;
              motivo: string | null }> {
  const { data, error } = await supabase.rpc('chat_marcar', {
    p_slug: p.slug, p_recurso: p.recursoId, p_servico: p.servicoId,
    p_inicio: p.inicio, p_nome: p.nome, p_cpf: p.cpf, p_telefone: p.telefone,
    p_nascimento: p.nascimento || null, p_email: p.email || null,
    p_convenio: p.convenioId || null, p_observacoes: p.observacoes || null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? {
    ok: false, mensagem: 'Sem resposta.', agendamento_id: null, motivo: null
  });
}


/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ QUAIS CONVÊNIOS COBREM CADA EXAME   (20/10/2026, noite)
 *
 *  A regra (lista vazia = todos; subtipo segue o exame; particular
 *  passa sempre) mora no banco, em `servico_aceita_convenio`. A
 *  tela só DESENHA a lista própria de cada exame e pergunta ao
 *  banco o que não é coberto — não refaz a conta.
 * ════════════════════════════════════════════════════════════ */

/** A lista PRÓPRIA de cada exame: exame → convênios marcados. */
export async function conveniosDosExames(clienteId: string): Promise<Map<string, string[]>> {
  const { data, error } = await supabase.rpc('convenios_dos_exames', { p_cliente: clienteId });
  if (error) throw error;
  const m = new Map<string, string[]>();
  for (const r of (data ?? []) as { servico_id: string; convenio_id: string }[]) {
    m.set(r.servico_id, [...(m.get(r.servico_id) ?? []), r.convenio_id]);
  }
  return m;
}

/** Troca a lista INTEIRA. Vazia = coberto por todos os convênios. */
export async function salvarConveniosDoExame(
  clienteId: string, servicoId: string, convenios: string[]
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('salvar_convenios_do_exame', {
    p_cliente: clienteId, p_servico: servicoId, p_convenios: convenios
  });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' };
}

/** Os exames do pedido que o convênio NÃO cobre. Vazio = pode marcar. */
export async function examesQueOConvenioNaoCobre(
  servicos: string[], convenioId: string | null
): Promise<{ id: string; nome: string }[]> {
  if (!servicos.length || !convenioId) return [];
  const { data, error } = await supabase.rpc('exames_que_o_convenio_nao_cobre', {
    p_servicos: servicos, p_convenio: convenioId
  });
  if (error) throw error;
  return (data ?? []) as { id: string; nome: string }[];
}

/** ⭐ 20/10, mais tarde: os exames (e subtipos) que o convênio cobre,
    para o chat desenhar só esses. `null` = particular sem cadastro. */
export async function chatExamesDoConvenio(
  slug: string, convenioId: string | null
): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('chat_exames_do_convenio', {
    p_slug: slug, p_convenio: convenioId
  });
  if (error) throw error;
  return new Set(((data ?? []) as { id: string }[]).map(r => r.id));
}

/* ════════════════════════════════════════════════════════════
 *  ⭐ 24/10: O ERRO DE UMA EDGE FUNCTION, EM PORTUGUÊS — UM SÓ
 *
 *  A `criar-usuario` já explicava cada causa (não publicada,
 *  login recusado, quebrou por dentro, sem resposta). A
 *  `redefinir-senha` e a `responder-whatsapp` tinham uma cópia
 *  mais pobre, e o Tom viu "Failed to send a request to the Edge
 *  Function" sem saber o que fazer. Agora as três usam esta.
 * ════════════════════════════════════════════════════════════ */
export function explicarErroDaFuncao(funcao: string, error: unknown): string {
  const status = (error as { context?: { status?: number } }).context?.status;
  const nome = (error as { name?: string }).name ?? '';
  if (status === 404) {
    return `A Edge Function "${funcao}" não foi encontrada no Supabase. `
      + 'Confira se ela foi publicada com esse nome exato.';
  }
  if (status === 401 || status === 403) {
    return `O Supabase recusou o seu login ao chamar "${funcao}" (código ${status}). `
      + 'Saia do painel, entre de novo e tente outra vez.';
  }
  if (status) {
    return `A Edge Function "${funcao}" respondeu com erro (código ${status}). `
      + `Veja em Supabase → Edge Functions → ${funcao} → Logs.`;
  }
  if (nome === 'FunctionsFetchError') {
    return `Não consegui falar com a Edge Function "${funcao}". Confira se ela está publicada `
      + 'no Supabase com esse nome exato, colando o arquivo da pasta supabase/para_publicar.';
  }
  return `Erro ao chamar "${funcao}": ` + ((error as Error)?.message ?? String(error));
}

/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ NOVO USUÁRIO   (20/10/2026, noite)
 *  O login nasce na Edge Function `criar-usuario` (ela tem a
 *  chave de serviço; o navegador nunca). O vínculo com o
 *  hospital é o banco que grava — ver `042_novo_usuario.sql`.
 * ════════════════════════════════════════════════════════════ */
export async function criarUsuario(p: {
  clienteId: string; nome: string; email: string; papel: string; senha: string;
}): Promise<{ ok: boolean; mensagem: string; ja_existia?: boolean }> {
  const { data, error } = await supabase.functions.invoke('criar-usuario', {
    body: { cliente: p.clienteId, nome: p.nome, email: p.email, papel: p.papel, senha: p.senha }
  });
  if (error) {
    /* ⚠️ 21/10: antes, QUALQUER erro virava "não está publicado".
       O Tom viu essa frase e não dava para saber se a função
       faltava, se recusou o login dele ou se quebrou no meio —
       três causas, uma frase. Agora cada uma diz o que é, com o
       código que o Supabase devolveu. */
    const mensagem = explicarErroDaFuncao('criar-usuario', error);
    return { ok: false, mensagem };
  }
  return (data ?? { ok: false, mensagem: 'Sem resposta.' }) as
    { ok: boolean; mensagem: string; ja_existia?: boolean };
}

/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ CONVÊNIO É OPCIONAL   (21/10/2026)
 *  Sem a chave gravada = atende (como sempre foi). Só a
 *  plataforma liga e desliga — `044_convenios_opcionais.sql`.
 * ════════════════════════════════════════════════════════════ */
export function atendeConveniosDaConfig(config: Record<string, unknown>): boolean {
  return config['convenios.atende'] !== false;
}

export async function definirAtendeConvenios(
  clienteId: string, atende: boolean
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('definir_atende_convenios', {
    p_cliente: clienteId, p_atende: atende
  });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' };
}

export async function chatAtendeConvenios(slug: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('chat_atende_convenios', { p_slug: slug });
  if (error) throw error;
  return data !== false;
}


/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ RESPONDER PELO NÚMERO OFICIAL   (21/10/2026)
 *  As regras são do banco (`045_responder_pelo_painel.sql`); o
 *  envio é da Edge Function `responder-whatsapp` (ela tem o token).
 * ════════════════════════════════════════════════════════════ */
export async function possoResponderWhatsapp(clienteId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('posso_responder_whatsapp', { p_cliente: clienteId });
  if (error) return false;
  return data === true;
}

export async function assumirConversa(
  clienteId: string, telefone: string
): Promise<{ ok: boolean; mensagem: string; protocolo_id: string | null }> {
  const { data, error } = await supabase.rpc('assumir_conversa', {
    p_cliente: clienteId, p_telefone: telefone
  });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.', protocolo_id: null };
}

export async function responderWhatsapp(
  clienteId: string, telefone: string, texto: string
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.functions.invoke('responder-whatsapp', {
    body: { cliente: clienteId, telefone, texto }
  });
  if (error) {
    return { ok: false, mensagem: explicarErroDaFuncao('responder-whatsapp', error) };
  }
  return (data ?? { ok: false, mensagem: 'Sem resposta.' }) as { ok: boolean; mensagem: string };
}

/** Quem tem o privilégio individual, neste hospital. */
export async function quemRespondeWhatsapp(clienteId: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('quem_responde_whatsapp', { p_cliente: clienteId });
  if (error) return new Set();
  return new Set(((data ?? []) as { usuario_id: string }[]).map(r => r.usuario_id));
}

export async function definirRespondeWhatsapp(
  clienteId: string, usuarioId: string, pode: boolean
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('definir_responde_whatsapp', {
    p_cliente: clienteId, p_usuario: usuarioId, p_pode: pode
  });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' };
}

/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ O ATENDIMENTO DAS CONVERSAS   (21/10/2026)
 *  `046_atendimento_das_conversas.sql`.
 * ════════════════════════════════════════════════════════════ */
export interface IndicadoresDasConversas {
  aguardando: number; paradas_2h: number; janela_acabando: number;
  sem_atendente: number; finalizadas_hoje: number;
}
export async function indicadoresDasConversas(clienteId: string): Promise<IndicadoresDasConversas | null> {
  const { data, error } = await supabase.rpc('indicadores_das_conversas', { p_cliente: clienteId });
  if (error) throw error;
  return ((data ?? [])[0] ?? null) as IndicadoresDasConversas | null;
}
export async function paraQuemTransferir(clienteId: string): Promise<{ usuario_id: string; nome: string }[]> {
  const { data, error } = await supabase.rpc('para_quem_transferir', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as { usuario_id: string; nome: string }[];
}
export async function transferirConversa(
  clienteId: string, protocolo: string, para: string
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('transferir_conversa', {
    p_cliente: clienteId, p_protocolo: protocolo, p_para: para
  });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' };
}
export async function finalizarJanelasFechadas(
  clienteId: string
): Promise<{ ok: boolean; mensagem: string; fechadas: number }> {
  const { data, error } = await supabase.rpc('finalizar_janelas_fechadas', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.', fechadas: 0 };
}

/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ OS NÚMEROS DE WHATSAPP DO HOSPITAL   (22/10/2026)
 *  Só a plataforma — `047_numeros_no_painel.sql`.
 * ════════════════════════════════════════════════════════════ */
export interface NumeroWhatsApp {
  id: string; nome: string; phone_number_id: string; waba_id: string;
  papel: 'PRINCIPAL' | 'RESERVA'; prioridade: number;
  estado: 'NO_AR' | 'RESTRITO' | 'BANIDO' | 'DESLIGADO';
  estado_motivo: string | null; estado_desde: string;
  /** "••••a1B2", ou nulo sem token. O token inteiro nunca volta. */
  token_fim: string | null;
}
export async function numerosDoCliente(clienteId: string): Promise<NumeroWhatsApp[]> {
  const { data, error } = await supabase.rpc('numeros_do_cliente', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as NumeroWhatsApp[];
}
export async function salvarNumeroWhatsapp(p: {
  clienteId: string; id: string | null; nome: string; phoneNumberId: string; wabaId: string;
  papel: 'PRINCIPAL' | 'RESERVA'; prioridade: number; token: string;
}): Promise<{ ok: boolean; mensagem: string; numero_id: string | null }> {
  const { data, error } = await supabase.rpc('salvar_numero_whatsapp', {
    p_cliente: p.clienteId, p_id: p.id, p_nome: p.nome, p_phone_number_id: p.phoneNumberId,
    p_waba_id: p.wabaId, p_papel: p.papel, p_prioridade: p.prioridade, p_token: p.token || null
  });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.', numero_id: null };
}
export async function mudarEstadoDoNumero(
  numeroId: string, estado: NumeroWhatsApp['estado'], motivo: string
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('mudar_estado_do_numero', {
    p_numero: numeroId, p_estado: estado, p_motivo: motivo || null
  });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' };
}


/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ O MOTOR DE AVISOS   (22/10/2026) — `048_motor_de_avisos.sql`
 * ════════════════════════════════════════════════════════════ */
export interface ModeloDoSistema {
  chave: string; rotulo: string; variaveis: string[]; botoes: string[]; quando: string;
}
/** A lista dos modelos mora NO BANCO — a tela e o motor leem a mesma. */
export async function modelosDoSistema(): Promise<ModeloDoSistema[]> {
  const { data, error } = await supabase.rpc('modelos_do_sistema');
  if (error) throw error;
  return (data ?? []) as ModeloDoSistema[];
}
export interface DecisaoDeAviso {
  agendamento_id: string; tipo: string; enviar: boolean; motivo: string;
  paciente: string; inicio: string; horas_para: number;
}
/** O ENSAIO: o que o motor faria agora, sem enviar nada. */
export async function ensaioDosAvisos(clienteId: string): Promise<DecisaoDeAviso[]> {
  const { data, error } = await supabase.rpc('ensaio_dos_avisos', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as DecisaoDeAviso[];
}
export async function ligarMotorDeAvisos(
  clienteId: string, ligado: boolean
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('ligar_motor_de_avisos', {
    p_cliente: clienteId, p_ligado: ligado
  });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' };
}
/** O botão manual de Agendamentos, pelo banco (as variáveis são de lá). */
export async function avisarPacienteAgora(
  clienteId: string, agendamentoId: string
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('avisar_paciente_agora', {
    p_cliente: clienteId, p_agendamento: agendamentoId
  });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' };
}


/* ⭐⭐⭐ 22/10: os tempos dos avisos, pelo painel do hospital. */
export interface ConfigDosAvisos {
  ligado: boolean; confirmacao: boolean;
  vespera: boolean; vespera_horas: number;
  reenvio: boolean; reenvio_espera_horas: number; reenvio_minimo_antes_horas: number;
  lembrete: boolean; lembrete_horas: number;
  exame_horas: number; hora_inicio: number; hora_fim: number;
  conversa_minutos: number;
}
export async function configDosAvisos(clienteId: string): Promise<ConfigDosAvisos> {
  const { data, error } = await supabase.rpc('config_dos_avisos', { p_cliente: clienteId });
  if (error) throw error;
  return data as ConfigDosAvisos;
}
export async function salvarConfigDosAvisos(
  clienteId: string, c: ConfigDosAvisos
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('salvar_config_dos_avisos', { p_cliente: clienteId, p_config: c });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' };
}
/** O tempo PRÓPRIO de cada exame (vazio = padrão do hospital). */
export async function avisosDosExames(clienteId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('avisos_dos_exames', { p_cliente: clienteId });
  if (error) throw error;
  return new Map(((data ?? []) as { servico_id: string; aviso_horas: number }[])
    .map(r => [r.servico_id, r.aviso_horas]));
}
export async function salvarAvisoDoExame(
  clienteId: string, servicoId: string, horas: number | null
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('salvar_aviso_do_exame', {
    p_cliente: clienteId, p_servico: servicoId, p_horas: horas
  });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' };
}

/** ⭐ 23/10: excluir um número (só a plataforma; fica no registro). */
export async function excluirNumeroWhatsapp(numeroId: string): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('excluir_numero_whatsapp', { p_numero: numeroId });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' };
}

/* ⭐⭐⭐ 23/10: o agendador dos avisos (pg_cron) — só a plataforma. */
export interface EstadoDoAgendador {
  pg_cron: boolean; pg_net: boolean; url: string | null;
  tarefas: { nome: string; quando: string; ativa: boolean;
             ultima: { em: string; status: string; mensagem: string | null } | null }[];
}
export async function estadoDoAgendador(): Promise<EstadoDoAgendador | null> {
  const { data, error } = await supabase.rpc('estado_do_agendador');
  if (error) throw error;
  return (data ?? null) as EstadoDoAgendador | null;
}
export async function ligarAgendador(url: string, segredo: string): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('ligar_agendador', { p_url_envio: url, p_segredo: segredo });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' };
}
export async function desligarAgendador(): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('desligar_agendador');
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' };
}


/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ MEU PERFIL E REDEFINIR SENHA   (23/10/2026) — `051`
 * ════════════════════════════════════════════════════════════ */
export async function salvarMeuNome(nome: string): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('salvar_meu_nome', { p_nome: nome });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' };
}
/** Confere a senha ATUAL antes de trocar: quem sentou no computador
    de outra pessoa não a tranca para fora. */
export async function trocarMinhaSenha(
  email: string, atual: string, nova: string
): Promise<{ ok: boolean; mensagem: string }> {
  const { error: e1 } = await supabase.auth.signInWithPassword({ email, password: atual });
  if (e1) return { ok: false, mensagem: 'A senha atual não confere.' };
  const { error: e2 } = await supabase.auth.updateUser({ password: nova });
  if (e2) return { ok: false, mensagem: 'Não consegui trocar a senha: ' + e2.message };
  return { ok: true, mensagem: 'Senha trocada. Use a nova na próxima vez que entrar.' };
}
export async function redefinirSenha(
  clienteId: string, usuarioId: string, senha: string
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.functions.invoke('redefinir-senha', {
    body: { cliente: clienteId, usuario: usuarioId, senha }
  });
  if (error) {
    return { ok: false, mensagem: explicarErroDaFuncao('redefinir-senha', error) };
  }
  return (data ?? { ok: false, mensagem: 'Sem resposta.' }) as { ok: boolean; mensagem: string };
}

/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ A TELA DO MÉDICO — O CONSULTÓRIO DELE   (26/10/2026)
 *
 *  O Tom mandou os três arquivos do painel médico que roda hoje
 *  no Apps Script e disse que no futuro o médico vai fazer
 *  prescrição, receita e prontuário por esta tela.
 *
 *  ------------------------------------------------------------
 *  ⚠️ NENHUMA FUNÇÃO DAQUI MANDA O ID DO MÉDICO
 *
 *  É a primeira linha do `MedicoService.gs` dele, e vale ouro:
 *
 *  > *"NENHUMA funcao daqui aceita medicoId como parametro. O
 *  >  medico vem do TOKEN, sempre. (…) agenda de medico e lista
 *  >  de pacientes, que e dado de saude."*
 *
 *  Aqui o token é o login do Supabase. Se um dia alguém
 *  acrescentar `medicoId` a uma destas chamadas, estará abrindo
 *  a agenda de um médico para outro.
 * ════════════════════════════════════════════════════════════ */

export async function souMedico(clienteId: string): Promise<{
  ok: boolean; recurso_id: string | null; nome: string | null;
  eh_aparelho: boolean;
}> {
  const { data, error } = await supabase.rpc('sou_medico', { p_cliente: clienteId });
  if (error) throw error;
  return ((data ?? [])[0] ?? {
    ok: false, recurso_id: null, nome: null, eh_aparelho: false
  });
}

export interface AtendimentoDoDia {
  id: string;
  inicio: string;
  hora: string;
  duracao_min: number;
  paciente: string;
  idade: number | null;
  convenio: string;
  servico: string;
  situacao: string;
  eh_retorno: boolean;
  eh_encaixe: boolean;
  ja_tem_retorno: boolean;
  /** ⭐ O encaixe do prontuário. Hoje sempre 0. */
  anotacoes: number;
}

/** ⚠️ Repare: não há parâmetro de médico. De propósito. */
export async function minhaAgendaDoDia(
  clienteId: string, dia?: string | null
): Promise<AtendimentoDoDia[]> {
  const { data, error } = await supabase.rpc('minha_agenda_do_dia', {
    p_cliente: clienteId, p_dia: dia ?? null
  });
  if (error) throw error;
  return (data ?? []) as AtendimentoDoDia[];
}

export async function marcarPresencaDoMedico(
  clienteId: string, agendamentoId: string, situacao: string
): Promise<{ ok: boolean; mensagem: string; situacao: string | null }> {
  const { data, error } = await supabase.rpc('marcar_presenca_do_medico', {
    p_cliente: clienteId, p_agendamento: agendamentoId, p_situacao: situacao
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? {
    ok: false, mensagem: 'Sem resposta.', situacao: null
  });
}

/** ⭐ `pede_motivo` vem do banco como FATO, não como frase.
 *  A tela não pode decidir lendo o texto em português: regra
 *  sobre o mensageiro quebra quando o mensageiro muda. */
export async function criarRetornoDoMedico(p: {
  clienteId: string; origemId: string; inicio: string; motivo?: string | null;
}): Promise<{ ok: boolean; mensagem: string; id: string | null;
              pede_motivo: boolean }> {
  const { data, error } = await supabase.rpc('criar_retorno_do_medico', {
    p_cliente: p.clienteId, p_origem: p.origemId,
    p_inicio: p.inicio, p_motivo: p.motivo ?? null
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? {
    ok: false, mensagem: 'Sem resposta.', id: null, pede_motivo: false
  });
}

/* ---------------- ligar o médico ao login ---------------- */

export interface LoginParaMedico {
  usuario_id: string; nome: string; email: string;
  papel: string; eh_este: boolean;
}

export async function loginsParaMedico(
  clienteId: string, recursoId?: string | null
): Promise<LoginParaMedico[]> {
  const { data, error } = await supabase.rpc('logins_para_medico', {
    p_cliente: clienteId, p_recurso: recursoId ?? null
  });
  if (error) throw error;
  return (data ?? []) as LoginParaMedico[];
}

export async function ligarMedicoAoLogin(
  clienteId: string, recursoId: string, usuarioId: string | null
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('ligar_medico_ao_login', {
    p_cliente: clienteId, p_recurso: recursoId, p_usuario: usuarioId
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' });
}

/* ════════════════════════════════════════════════════════════
 *  ACESSO DOS MÉDICOS — a lista de quem entra   (26/10/2026)
 *
 *  ⚠️ `estado` vem PRONTO do banco, e não é calculado aqui de
 *     propósito. A escadinha "tem login? está ativo? já
 *     entrou?" tem um dono só (`public.acessos_dos_medicos`),
 *     porque no dia em que um relatório fizer a mesma pergunta
 *     ele vai perguntar ao banco, não ao React.
 * ════════════════════════════════════════════════════════════ */
export type EstadoDoAcesso =
  | 'sem_acesso' | 'nunca_entrou' | 'bloqueado'
  | 'fora_do_hospital' | 'entrando';

export interface AcessoDeMedico {
  recurso_id: string;
  medico: string;
  conselho: string | null;
  tipo: 'profissional' | 'equipamento';
  recurso_ativo: boolean;
  usuario_id: string | null;
  pessoa: string | null;
  email: string | null;
  papel: string | null;
  papel_nome: string | null;
  acesso_ativo: boolean | null;
  ultimo_acesso: string | null;
  estado: EstadoDoAcesso;
}

export async function acessosDosMedicos(
  clienteId: string
): Promise<AcessoDeMedico[]> {
  const { data, error } = await supabase.rpc('acessos_dos_medicos', {
    p_cliente: clienteId
  });
  if (error) throw error;
  return (data ?? []) as AcessoDeMedico[];
}

/* ════════════════════════════════════════════════════════════
 *  A SENHA PROVISÓRIA   (27/10/2026)
 *
 *  O Tom: *"o ideal é que o hospital libere no painel o acesso e
 *  ele crie a senha que preferir no primeiro login."*
 *
 *  ⚠️ A marca mora no BANCO, não aqui. Quem entra pela porta
 *     `/medico` não passa pelo painel, e quem chama a API não
 *     passa por tela nenhuma — a pergunta tem que ser a mesma
 *     nos três lugares.
 * ════════════════════════════════════════════════════════════ */
export async function minhaSenhaEProvisoria(): Promise<boolean> {
  const { data, error } = await supabase.rpc('minha_senha_e_provisoria');
  if (error) throw error;
  return data === true;
}

/**
 * Troca a senha de quem ENTROU COM UMA PROVISÓRIA.
 *
 * ⚠️ Sem conferir a senha atual, e isto é de propósito: ele
 *    acabou de digitá-la para entrar, há dois segundos. Pedir de
 *    novo seria pedir que ele leia o WhatsApp do hospital outra
 *    vez, de pé, no consultório.
 *
 *    A conferência existe no `trocarMinhaSenha` (Meu perfil),
 *    onde ela protege de quem senta no computador alheio com o
 *    painel aberto. Aqui a sessão acabou de nascer da senha.
 */
export async function trocarSenhaProvisoria(
  nova: string
): Promise<{ ok: boolean; mensagem: string }> {
  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) {
    return { ok: false, mensagem: 'Não consegui trocar a senha: ' + error.message };
  }
  const { data, error: e2 } = await supabase.rpc('minha_senha_e_minha');
  if (e2) return { ok: false, mensagem: e2.message };
  return ((data ?? [])[0] ?? { ok: true, mensagem: 'Senha trocada.' });
}

/* ════════════════════════════════════════════════════════════
 *  IMPORTAR AS AGENDAS DA PLANILHA            (27/10/2026)
 * ════════════════════════════════════════════════════════════ */
export interface AgendasImportadas {
  criados: number; ignorados: number; recusados: number;
  varridos: number; pacientes_novos: number; sem_cpf: number;
  detalhes: { linha: string; motivo: string }[];
}

export interface OQueAVarreduraLeva {
  origem: string; quantas: number; futuros: number;
  primeiro: string | null; ultimo: string | null;
}

export async function oQueAVarreduraLeva(
  clienteId: string
): Promise<OQueAVarreduraLeva[]> {
  const { data, error } = await supabase.rpc('o_que_a_varredura_leva', {
    p_cliente: clienteId
  });
  if (error) throw error;
  return (data ?? []) as OQueAVarreduraLeva[];
}

/**
 * ⚠️ `varrer` e `linhas` NÃO VÃO JUNTOS — o banco recusa.
 *
 *  Medido com a planilha do Tom: varrer 10.140 consultas leva
 *  ~5s e um lote leva ~2s; juntos passam dos 8 segundos que o
 *  Supabase dá. Quem varre manda a lista vazia.
 */
export async function importarAgendamentos(
  clienteId: string,
  linhas: unknown[],
  confirmar: boolean,
  varrer = false,
  primeiro = false,
): Promise<AgendasImportadas> {
  const { data, error } = await supabase.rpc('importar_agendamentos', {
    p_cliente: clienteId, p_linhas: linhas,
    p_confirmar: confirmar, p_varrer: varrer, p_primeiro: primeiro
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? {
    criados: 0, ignorados: 0, recusados: 0, varridos: 0,
    pacientes_novos: 0, sem_cpf: 0, detalhes: []
  }) as AgendasImportadas;
}


/* ════════════════════════════════════════════════════════════
 *  O MÓDULO CIRURGIAS                             31/10/2026
 *
 *  O Tom mandou o sistema que roda hoje no Apps Script e pediu
 *  para ele virar módulo do MedCalendar, ligável por cliente.
 *
 *  ⚠️ Tudo aqui passa por RPC, e nenhuma tela monta `select`
 *     sobre as tabelas de cirurgia. O motivo é o CPF: a política
 *     de `core.pacientes` proíbe o médico de ler o cadastro, e
 *     um `select` com `join` devolveria a tela VAZIA para ele —
 *     sem erro nenhum, que é o pior jeito de falhar.
 *
 *     As RPCs do `063` são `security definer`, refazem as duas
 *     travas (hospital e médico) e CALAM o CPF e o telefone
 *     quando quem pergunta é médico. Decisão do Tom, 27/10.
 * ════════════════════════════════════════════════════════════ */

export interface EtapaCirurgia {
  id: string;
  chave: string;
  nome: string;
  cor: string;
  ordem: number;
  /** entrada · andamento · fim_bom · fim_ruim */
  natureza: 'entrada' | 'andamento' | 'fim_bom' | 'fim_ruim';
  quantas: number;
}

export interface CartaoCirurgia {
  id: string;
  numero: string;
  etapa_id: string;
  etapa: string;
  etapa_cor: string;
  paciente: string;
  /** ⚠️ null quando quem pergunta é médico. Não é erro: é a regra. */
  paciente_cpf: string | null;
  paciente_telefone: string | null;
  medico: string;
  convenio: string | null;
  procedimento: string;
  procedimentos: number;
  carater: 'eletiva' | 'urgencia';
  urgente: boolean;
  data_prevista: string | null;
  cid: string;
  criado_em: string;
  pendencias: number;
  pendencias_ok: number;
  percentual: number;
  assinada: boolean;
}

export interface ProcedimentoTuss {
  codigo: string;
  descricao: string;
  categoria: string | null;
}

/** As colunas do quadro, com a contagem. 1 consulta. */
export async function etapasDeCirurgia(clienteId: string): Promise<EtapaCirurgia[]> {
  const { data, error } = await supabase.rpc('cirurgia_etapas', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as EtapaCirurgia[];
}

/**
 * Os cartões do quadro.
 *
 * ⚠️ O teto é explícito e a tela AVISA quando ele corta. Teto que
 *    corta em silêncio é pior que tela lenta — é a lição de 30/10,
 *    quando "Este mês" parava em 08/10 e ninguém sabia por quê.
 */
export async function cirurgiasDoQuadro(
  clienteId: string, busca: string | null = null, limite = 400
): Promise<CartaoCirurgia[]> {
  const { data, error } = await supabase.rpc('cirurgias_kanban', {
    p_cliente: clienteId, p_busca: busca, p_limite: limite
  });
  if (error) throw error;
  return (data ?? []) as CartaoCirurgia[];
}

/** Uma solicitação inteira: guia, procedimentos, OPME, pendências,
    linha do tempo e selo. 1 consulta. */
export async function detalheDaCirurgia(id: string): Promise<any> {
  const { data, error } = await supabase.rpc('cirurgia_detalhe', { p_id: id });
  if (error) throw error;
  return data;
}

/**
 * A MESMA solicitação, mais o timbre: cabeçalho do hospital,
 * logo do convênio e o endereço onde a assinatura se confere.
 *
 * ⚠️ É o `cirurgia_detalhe` por dentro, de propósito. Se a guia
 *    impressa montasse o paciente por uma consulta própria, o
 *    CPF que a TELA esconde do médico sairia IMPRESSO — e a
 *    regra de 27/10 valeria só até alguém apertar Ctrl+P.
 */
export async function cirurgiaParaImprimir(id: string): Promise<any> {
  const { data, error } = await supabase.rpc('cirurgia_para_imprimir', { p_id: id });
  if (error) throw error;
  return data;
}

/** A conferência pública de uma assinatura, pelo código. */
export async function verificarAssinaturaCirurgia(codigo: string): Promise<any | null> {
  const { data, error } = await supabase.rpc('verificar_assinatura_cirurgia', {
    p_codigo: codigo
  });
  if (error) throw error;
  const l = Array.isArray(data) ? data[0] : data;
  return l ?? null;
}

/** O autocomplete TUSS. */
export async function buscarTuss(termo: string, limite = 20): Promise<ProcedimentoTuss[]> {
  if (termo.trim().length < 2) return [];
  const { data, error } = await supabase.rpc('buscar_tuss', {
    p_termo: termo, p_limite: limite
  });
  if (error) throw error;
  return (data ?? []) as ProcedimentoTuss[];
}

/**
 * O pedido do médico.
 *
 * ⭐ Repare no que NÃO vai aqui: o CRM, o nome e a especialidade
 *    do médico. Eles saem do LOGIN, dentro do banco.
 *
 *    No protótipo o formulário mandava `medicoCRM` junto e o
 *    servidor gravava o que viesse — quem abrisse o console do
 *    navegador assinava uma guia no CRM de outro médico.
 */
export async function criarSolicitacaoCirurgia(
  clienteId: string, dados: Record<string, unknown>
): Promise<{ ok: boolean; motivo: string; id: string | null; numero: string | null }> {
  const { data, error } = await supabase.rpc('criar_solicitacao_cirurgia', {
    p_cliente: clienteId, p_dados: dados
  });
  if (error) throw error;
  const l = (data ?? [])[0];
  return l ?? { ok: false, motivo: 'Sem resposta do servidor.', id: null, numero: null };
}

/** A assinatura eletrônica. O que ela assina é o conteúdo GRAVADO,
    lido do banco — não o que a tela tem na mão. */
export async function assinarCirurgia(id: string): Promise<{
  ok: boolean; motivo: string; codigo: string | null;
  hash: string | null; assinado_em: string | null;
}> {
  const { data, error } = await supabase.rpc('assinar_cirurgia', { p_id: id });
  if (error) throw error;
  const l = (data ?? [])[0];
  return l ?? { ok: false, motivo: 'Sem resposta do servidor.', codigo: null, hash: null, assinado_em: null };
}

/** Mover no quadro. `avisar` enfileira o WhatsApp do paciente. */
export async function moverCirurgia(
  id: string, etapaId: string, observacao: string | null = null, avisar = false
): Promise<{ ok: boolean; motivo: string; etapa: string | null; avisou: boolean }> {
  const { data, error } = await supabase.rpc('mover_cirurgia', {
    p_id: id, p_etapa: etapaId, p_observacao: observacao, p_avisar: avisar
  });
  if (error) throw error;
  const l = (data ?? [])[0];
  return l ?? { ok: false, motivo: 'Sem resposta do servidor.', etapa: null, avisou: false };
}

export async function marcarPendenciaCirurgia(
  pendenciaId: string, concluida: boolean
): Promise<{ ok: boolean; motivo: string; total: number; feitas: number; percentual: number }> {
  const { data, error } = await supabase.rpc('marcar_pendencia_cirurgia', {
    p_pendencia: pendenciaId, p_concluida: concluida
  });
  if (error) throw error;
  const l = (data ?? [])[0];
  return l ?? { ok: false, motivo: 'Sem resposta do servidor.', total: 0, feitas: 0, percentual: 0 };
}


/* ════════════════════════════════════════════════════════════
 *  A COTAÇÃO DE OPME                              31/10/2026
 *
 *  Decisão do Tom: o fornecedor recebe o link por WhatsApp.
 * ════════════════════════════════════════════════════════════ */

export interface FornecedorCirurgia {
  id: string;
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  ativo: boolean;
  cotacoes: number;
  respondidas: number;
}

export async function fornecedoresDeCirurgia(clienteId: string):
  Promise<FornecedorCirurgia[]> {
  const { data, error } = await supabase.rpc('fornecedores_de_cirurgia',
    { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as FornecedorCirurgia[];
}

export async function salvarFornecedorCirurgia(p: {
  clienteId: string; id?: string | null; nome: string;
  cnpj?: string | null; telefone?: string | null;
  email?: string | null; ativo?: boolean;
}): Promise<{ ok: boolean; motivo: string; id: string | null }> {
  const { data, error } = await supabase.rpc('salvar_fornecedor_cirurgia', {
    p_cliente: p.clienteId, p_id: p.id ?? null, p_nome: p.nome,
    p_cnpj: p.cnpj ?? null, p_telefone: p.telefone ?? null,
    p_email: p.email ?? null, p_ativo: p.ativo ?? true
  });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, motivo: 'Sem resposta.', id: null };
}

/** Manda o pedido de cotação. O link vai por WhatsApp. */
export async function enviarCotacaoOpme(
  solicitacaoId: string, fornecedores: string[], dias = 7
): Promise<{ ok: boolean; motivo: string; enviadas: number; sem_telefone: number }> {
  const { data, error } = await supabase.rpc('enviar_cotacao_opme', {
    p_solicitacao: solicitacaoId, p_fornecedores: fornecedores, p_dias: dias
  });
  if (error) throw error;
  return (data ?? [])[0] ??
    { ok: false, motivo: 'Sem resposta.', enviadas: 0, sem_telefone: 0 };
}

/** As propostas lado a lado. A mais barata em cima. */
export async function cotacoesDaCirurgia(solicitacaoId: string): Promise<any> {
  const { data, error } = await supabase.rpc('cotacoes_da_cirurgia',
    { p_solicitacao: solicitacaoId });
  if (error) throw error;
  return data;
}

/** ⭐ 05/11: com menos de 3 propostas respondidas, o banco exige a justificativa. */
export async function escolherCotacaoOpme(cotacaoId: string, justificativa: string | null = null):
  Promise<{ ok: boolean; motivo: string }> {
  const { data, error } = await supabase.rpc('escolher_cotacao_opme',
    { p_cotacao: cotacaoId, p_justificativa: justificativa });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, motivo: 'Sem resposta.' };
}

/* ---------- a porta pública do fornecedor ---------- */

/** ⚠️ Chamadas por quem NÃO tem login. A trava é o código. */
export async function cotacaoParaFornecedor(codigo: string): Promise<any> {
  const { data, error } = await supabase.rpc('cotacao_para_fornecedor',
    { p_codigo: codigo });
  if (error) throw error;
  return data;
}

export async function responderCotacaoOpme(
  codigo: string, itens: unknown[], extras: Record<string, unknown>
): Promise<{ ok: boolean; motivo: string; total: number | null }> {
  const { data, error } = await supabase.rpc('responder_cotacao_opme', {
    p_codigo: codigo, p_itens: itens, p_extras: extras
  });
  if (error) throw error;
  return (data ?? [])[0] ?? { ok: false, motivo: 'Sem resposta.', total: null };
}

/**
 * O PDF do fornecedor.
 *
 * ⭐ Quem grava é a Edge Function, com a chave de serviço — a
 *    mesma mecânica da foto do pedido médico (`052`). O
 *    fornecedor NÃO fala com o Storage direto: senão qualquer
 *    pessoa com um código encheria o bucket do hospital.
 */
export async function anexarPdfDaCotacao(codigo: string, arquivo: File):
  Promise<{ ok: boolean; mensagem: string; id?: string }> {
  const form = new FormData();
  form.append('codigo', codigo);
  form.append('arquivo', arquivo);
  const { data, error } = await supabase.functions.invoke('anexo-da-cotacao', {
    body: form
  });
  if (error) {
    return { ok: false, mensagem: explicarErroDaFuncao('anexo-da-cotacao', error) };
  }
  return (data ?? { ok: false, mensagem: 'Sem resposta.' }) as
    { ok: boolean; mensagem: string; id?: string };
}


/* ---------- a guia que se preenche (31/10) ---------- */

export interface MeuCadastroDeMedico {
  ok: boolean;
  recurso_id: string | null;
  nome: string | null;
  conselho: string | null;
  conselho_uf: string | null;
  cbos: string | null;
  especialidade: string | null;
  /** ⭐ O que falta no cadastro para a guia sair completa. */
  faltando: string[];
}

/**
 * Quem eu sou, para esta guia.
 *
 * ⭐ O formulário NÃO deixa editar nada disto — vem do login. Mas
 *    o médico precisa LER antes de assinar: "não dá para editar"
 *    e "não dá para ver" são decisões diferentes, e eu tinha
 *    tomado as duas sem querer.
 */
export async function meuCadastroDeMedico(clienteId: string):
  Promise<MeuCadastroDeMedico> {
  const { data, error } = await supabase.rpc('meu_cadastro_de_medico',
    { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? [])[0] ?? {
    ok: false, recurso_id: null, nome: null, conselho: null,
    conselho_uf: null, cbos: null, especialidade: null, faltando: []
  };
}

export interface PacienteDaGuia {
  achou: boolean;
  motivo: string;
  paciente_id: string | null;
  nome: string | null;
  nascimento: string | null;
  sexo: string | null;
  /** ⚠️ sim/não. O número NUNCA vem — a regra de 27/10. */
  tem_telefone: boolean;
  convenio_id: string | null;
  convenio_nome: string | null;
  carteirinha: string | null;
  plano: string | null;
}

/**
 * O paciente, pelo CPF COMPLETO.
 *
 * ⚠️ Por CPF inteiro e só. Busca por nome ou por pedaço do CPF
 *    transformaria isto no cadastro do hospital servido a
 *    conta-gotas para quem a política proíbe de lê-lo. E toda
 *    consulta fica na auditoria. Ver `banco/065`.
 */
export async function pacienteParaCirurgia(clienteId: string, cpf: string):
  Promise<PacienteDaGuia> {
  const { data, error } = await supabase.rpc('paciente_para_cirurgia',
    { p_cliente: clienteId, p_cpf: cpf });
  if (error) throw error;
  return (data ?? [])[0] ?? {
    achou: false, motivo: 'Sem resposta.', paciente_id: null, nome: null,
    nascimento: null, sexo: null, tem_telefone: false,
    convenio_id: null, convenio_nome: null, carteirinha: null, plano: null
  };
}


/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ AS CONTAS — uma por atendimento (03/11) — `072_as_contas.sql`
 * ════════════════════════════════════════════════════════════ */
export interface CartoesDoFaturamento {
  competencia: string;
  pronto_valor: number; pronto_contas: number;
  pendencia_valor: number; pendencia_contas: number;
  risco_valor: number; risco_contas: number;
  sem_preco_contas: number;
  ha_lote_enviado: boolean;
}
export async function cartoesDoFaturamento(
  clienteId: string, competencia: string | null, prestadorId: string | null
): Promise<CartoesDoFaturamento | null> {
  const { data, error } = await supabase.rpc('cartoes_do_faturamento', {
    p_cliente: clienteId, p_competencia: competencia, p_prestador: prestadorId
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? null) as CartoesDoFaturamento | null;
}
export type EstadoDaConta = 'PRONTA' | 'COM_PENDENCIA' | 'EM_RISCO' | 'SEM_PRECO' | 'CANCELADA';
export interface PendenciaDeConta {
  estado: EstadoDaConta; convenio: string; prestador: string;
  quantas: number; valor: number | null; exemplos: string | null;
}
export async function pendenciasDasContas(
  clienteId: string, competencia: string | null, prestadorId: string | null
): Promise<PendenciaDeConta[]> {
  const { data, error } = await supabase.rpc('pendencias_das_contas', {
    p_cliente: clienteId, p_competencia: competencia, p_prestador: prestadorId
  });
  if (error) throw error;
  return (data ?? []) as PendenciaDeConta[];
}
export interface ContaDoMes {
  id: string; data_atendimento: string; paciente: string | null; servico: string;
  convenio: string; prestador: string | null; valor: number | null;
  exige_autorizacao: boolean; autorizacao_senha: string | null;
  autorizacao_validade: string | null; estado: EstadoDaConta;
}
export async function contasDoMes(
  clienteId: string, competencia: string | null, estado: EstadoDaConta | null
): Promise<ContaDoMes[]> {
  const { data, error } = await supabase.rpc('contas_do_mes', {
    p_cliente: clienteId, p_competencia: competencia, p_estado: estado
  });
  if (error) throw error;
  return (data ?? []) as ContaDoMes[];
}
export async function registrarAutorizacao(
  clienteId: string, contaId: string, senha: string, validade: string | null
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('registrar_autorizacao', {
    p_cliente: clienteId, p_conta: contaId, p_senha: senha, p_validade: validade
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' }) as { ok: boolean; mensagem: string };
}


/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ CIRURGIAS — O FLUXO E OS PRAZOS (04/11) — `073`
 * ════════════════════════════════════════════════════════════ */
export interface PrazoDaCirurgia {
  solicitacao_id: string; dia_do_pedido: string; limite_final: string;
  dias_restantes: number; em_atraso: boolean; etapa_atrasada: boolean;
  pendencias_atrasadas: number;
}
export async function prazosDasCirurgias(clienteId: string): Promise<PrazoDaCirurgia[]> {
  const { data, error } = await supabase.rpc('prazos_das_cirurgias', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as PrazoDaCirurgia[];
}
export interface PendenciaDoTipo {
  descricao: string; setor: string | null; dia_limite: number; antes_de: string;
}
export interface TipoDeCirurgia {
  id: string; nome: string; ativo: boolean; pendencias: PendenciaDoTipo[];
}
export async function tiposDeCirurgia(clienteId: string): Promise<TipoDeCirurgia[]> {
  const { data, error } = await supabase.rpc('tipos_de_cirurgia', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as TipoDeCirurgia[];
}
export async function salvarTipoCirurgia(
  clienteId: string, id: string | null, nome: string, ativo: boolean, pendencias: PendenciaDoTipo[]
): Promise<{ ok: boolean; mensagem: string; id: string | null }> {
  const { data, error } = await supabase.rpc('salvar_tipo_cirurgia', {
    p_cliente: clienteId, p_id: id, p_nome: nome, p_ativo: ativo, p_pendencias: pendencias
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.', id: null }) as
    { ok: boolean; mensagem: string; id: string | null };
}
export async function definirTipoDaCirurgia(
  solicitacaoId: string, tipoId: string
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('definir_tipo_da_cirurgia', {
    p_solicitacao: solicitacaoId, p_tipo: tipoId
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, mensagem: 'Sem resposta.' }) as { ok: boolean; mensagem: string };
}
export interface TipoEPrazos {
  tipo_id: string | null;
  tipos: { id: string; nome: string }[];
  pendencias: { id: string; prazo: string | null; antes_de: string | null; atrasada: boolean }[];
}
export async function tipoEPrazosDaCirurgia(solicitacaoId: string): Promise<TipoEPrazos | null> {
  const { data, error } = await supabase.rpc('tipo_e_prazos_da_cirurgia', { p_solicitacao: solicitacaoId });
  if (error) throw error;
  return (data ?? null) as TipoEPrazos | null;
}


/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ CIRURGIAS — A VIABILIDADE, PARTE A (05/11) — `074`
 *
 *  ⚠️ Mexeu aqui? Mexa em `previa/dados-falsos.ts` no mesmo minuto.
 * ════════════════════════════════════════════════════════════ */
export type Semaforo = 'verde' | 'amarelo' | 'vermelho' | 'incompleta';

/** Uma coisa que ninguém cadastrou. NUNCA é zero. */
export interface FaltaDaViabilidade {
  codigo: string | null; descricao: string; falta: string; motivo: string;
}
export interface ItemDaViabilidade {
  origem: 'procedimento' | 'tipo'; codigo: string; descricao: string;
  quantidade: number; pedida: number; de_pedido: boolean;
  custo_variavel: number | null; custo_fixo: number | null;
  preco_unitario: number | null; receita: number | null; fonte_preco: string | null;
}
/** A conta, guardada (snapshot) ou só calculada (prévia). */
export interface ContaDaViabilidade {
  modelo: 'pacote' | 'conta_aberta';
  data_preco: string;
  receita: number; diretos: number; fixos: number;
  margem_contribuicao: number; resultado: number; percentual: number | null;
  semaforo: Semaforo;
  faltando: FaltaDaViabilidade[];
  riscos: { tipo: string; texto: string }[];
  detalhe: {
    itens: ItemDaViabilidade[];
    diarias: number | null; diarias_de: string | null;
    opme: { tem: boolean; custo: number | null; receita: number | null;
            regra: string | null; taxa: number | null; no_pacote: boolean };
    pacote: { valor: number; diarias_incluidas: number; opme_incluida: boolean; vigente_desde: string } | null;
    limites: { verde: number; amarelo: number };
    /** PARTE B: nulo quando não há anestesista (e então está em `faltando`). */
    anestesia?: AnestesiaDaConta | null;
  };
}
export interface AnestesiaDaConta {
  anestesista_id: string; anestesista: string; valor_dia: number; dias_semana: number[];
  dia: string | null; cirurgias_no_dia: number; custo_do_dia: number; rateio: number;
  sozinha: boolean; ponto_de_equilibrio: number | null; nunca_empata: boolean;
  cenarios: { cirurgias: number; anestesia: number; resultado: number; percentual: number | null }[];
}
export interface DiaDeAnestesia { dia: string; dia_semana: string; anestesistas: string[] | null; cirurgias: number }
export interface ViabilidadeGuardada extends ContaDaViabilidade {
  id: string; seq: number; calculada_em: string; origem: string;
  situacao: 'PENDENTE' | 'APROVADA' | 'RECUSADA' | 'MANTIDA';
  decidida_em: string | null; decidida_por_nome: string | null; motivo_decisao: string | null;
  condicao_minimo_no_dia: number | null;
}
export interface ViabilidadeDaCirurgia {
  etapa: string;
  na_aprovacao: boolean;
  depois_da_aprovacao: boolean;
  pode_aprovar: boolean;
  pode_gerir: boolean;
  regra_opme: 'custo_mais_taxa' | 'tabela' | null;
  opme_valor_tabela: number | null;
  diarias: number | null;
  diarias_autorizadas: number | null;
  atual: ViabilidadeGuardada | null;
  previa: ContaDaViabilidade | null;
  procedimentos: { id: string; codigo: string; descricao: string; quantidade: number; autorizada: number | null }[];
  opme: { id: string; descricao: string; quantidade: number; autorizada: number | null }[];
  /* PARTE B */
  data_prevista: string | null;
  data_cirurgia: string | null;
  anestesista_id: string | null;
  /* ⭐ 06/11 (080): a hora, a duração e a sala */
  hora_inicio: string | null;
  duracao_min: number | null;
  sala_id: string | null;
  salas: { id: string; nome: string }[];
  anestesistas: { id: string; nome: string; dias_semana: number[]; padrao: boolean }[];
  condicao: { minimo: number; cirurgias_no_dia: number | null } | null;
  proximos_dias: DiaDeAnestesia[];
  historico: { seq: number; calculada_em: string; origem: string; situacao: string;
               resultado: number; percentual: number | null; semaforo: Semaforo;
               motivo: string | null; por: string | null; decidida_em: string | null;
               minimo_no_dia: number | null }[];
}
type OkMensagem = { ok: boolean; mensagem: string };
const SEM_RESPOSTA: OkMensagem = { ok: false, mensagem: 'Sem resposta do servidor.' };

export async function viabilidadeDaCirurgia(solicitacaoId: string): Promise<ViabilidadeDaCirurgia | null> {
  const { data, error } = await supabase.rpc('viabilidade_da_cirurgia', { p_solicitacao: solicitacaoId });
  if (error) throw error;
  return (data ?? null) as ViabilidadeDaCirurgia | null;
}
export async function aprovarViabilidade(
  solicitacaoId: string, aprovar: boolean, motivo: string | null, minimoNoDia: number | null = null
): Promise<OkMensagem> {
  const { data, error } = await supabase.rpc('aprovar_viabilidade', {
    p_solicitacao: solicitacaoId, p_aprovar: aprovar, p_motivo: motivo, p_minimo_no_dia: minimoNoDia
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? SEM_RESPOSTA) as OkMensagem;
}
export async function calcularViabilidadeAgora(solicitacaoId: string): Promise<OkMensagem> {
  const { data, error } = await supabase.rpc('calcular_viabilidade_agora', { p_solicitacao: solicitacaoId });
  if (error) throw error;
  return ((data ?? [])[0] ?? SEM_RESPOSTA) as OkMensagem;
}
export async function registrarAutorizacaoDoConvenio(
  solicitacaoId: string,
  procedimentos: { id: string; quantidade: number }[],
  opme: { id: string; quantidade: number }[],
  diarias: number | null,
  motivo: string
): Promise<OkMensagem & { voltou: boolean }> {
  const { data, error } = await supabase.rpc('registrar_autorizacao_do_convenio', {
    p_solicitacao: solicitacaoId, p_procedimentos: procedimentos, p_opme: opme,
    p_diarias: diarias, p_motivo: motivo
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ...SEM_RESPOSTA, voltou: false }) as OkMensagem & { voltou: boolean };
}
export async function salvarOpmeTabela(solicitacaoId: string, valor: number | null): Promise<OkMensagem> {
  const { data, error } = await supabase.rpc('salvar_opme_tabela', { p_solicitacao: solicitacaoId, p_valor: valor });
  if (error) throw error;
  return ((data ?? [])[0] ?? SEM_RESPOSTA) as OkMensagem;
}

export type NaturezaDoCusto = 'variavel' | 'fixo';
export interface CustoDeCirurgia {
  id: string; codigo: string; descricao: string; natureza: NaturezaDoCusto;
  grupo: string; valor: number; unidade: string | null; ativo: boolean;
}
export interface CadastrosDaViabilidade {
  pode_editar: boolean;
  limites: { verde: number; amarelo: number };
  custos: CustoDeCirurgia[];
  convenios: { id: string; nome: string; opme_modo: 'custo_mais_taxa' | 'tabela' | null; opme_taxa: number | null }[];
  tipos: { id: string; nome: string }[];
  anestesistas: Anestesista[];
  pacotes: { id: string; convenio_id: string; convenio: string; tipo_id: string; tipo: string;
             valor: number; diarias_incluidas: number; opme_incluida: boolean; vigente_desde: string }[];
  precos_itens: { id: string; convenio_id: string; convenio: string; codigo: string;
                  descricao: string | null; valor: number; vigente_desde: string }[];
}
export async function cadastrosDaViabilidade(clienteId: string): Promise<CadastrosDaViabilidade | null> {
  const { data, error } = await supabase.rpc('cadastros_da_viabilidade', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? null) as CadastrosDaViabilidade | null;
}
export async function salvarCustoCirurgia(
  clienteId: string, c: Omit<CustoDeCirurgia, 'id'> & { id: string | null }
): Promise<OkMensagem & { id: string | null }> {
  const { data, error } = await supabase.rpc('salvar_custo_cirurgia', {
    p_cliente: clienteId, p_id: c.id, p_codigo: c.codigo, p_descricao: c.descricao,
    p_natureza: c.natureza, p_grupo: c.grupo, p_valor: c.valor, p_unidade: c.unidade, p_ativo: c.ativo
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ...SEM_RESPOSTA, id: null }) as OkMensagem & { id: string | null };
}
export async function salvarOpmeDoConvenio(
  clienteId: string, convenioId: string, modo: 'custo_mais_taxa' | 'tabela' | null, taxa: number | null
): Promise<OkMensagem> {
  const { data, error } = await supabase.rpc('salvar_opme_do_convenio', {
    p_cliente: clienteId, p_convenio: convenioId, p_modo: modo, p_taxa: taxa
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? SEM_RESPOSTA) as OkMensagem;
}
export async function salvarPacoteConvenio(
  clienteId: string, convenioId: string, tipoId: string, valor: number,
  diariasIncluidas: number, opmeIncluida: boolean, vigenteDesde: string | null
): Promise<OkMensagem> {
  const { data, error } = await supabase.rpc('salvar_pacote_convenio', {
    p_cliente: clienteId, p_convenio: convenioId, p_tipo: tipoId, p_valor: valor,
    p_diarias_incluidas: diariasIncluidas, p_opme_incluida: opmeIncluida, p_vigente_desde: vigenteDesde
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? SEM_RESPOSTA) as OkMensagem;
}
export async function salvarPrecoItem(
  clienteId: string, convenioId: string, codigo: string, descricao: string | null,
  valor: number, vigenteDesde: string | null
): Promise<OkMensagem> {
  const { data, error } = await supabase.rpc('salvar_preco_item', {
    p_cliente: clienteId, p_convenio: convenioId, p_codigo: codigo, p_descricao: descricao,
    p_valor: valor, p_vigente_desde: vigenteDesde
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? SEM_RESPOSTA) as OkMensagem;
}
export async function salvarLimitesViabilidade(clienteId: string, verde: number, amarelo: number): Promise<OkMensagem> {
  const { data, error } = await supabase.rpc('salvar_limites_viabilidade', {
    p_cliente: clienteId, p_verde: verde, p_amarelo: amarelo
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? SEM_RESPOSTA) as OkMensagem;
}
export interface ItemDoTipo { codigo: string; descricao: string; quantidade: number; eh_diaria: boolean }
export async function itensDosTipos(clienteId: string): Promise<{ tipo_id: string; itens: ItemDoTipo[] }[]> {
  const { data, error } = await supabase.rpc('itens_dos_tipos', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as { tipo_id: string; itens: ItemDoTipo[] }[];
}
export async function salvarItensDoTipo(tipoId: string, itens: ItemDoTipo[]): Promise<OkMensagem> {
  const { data, error } = await supabase.rpc('salvar_itens_do_tipo', { p_tipo: tipoId, p_itens: itens });
  if (error) throw error;
  return ((data ?? [])[0] ?? SEM_RESPOSTA) as OkMensagem;
}


/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ A VIABILIDADE, PARTE B — O ANESTESISTA (05/11, noite) — `074`
 * ════════════════════════════════════════════════════════════ */
export interface Anestesista {
  id: string; nome: string; valor_dia: number; dias_semana: number[]; padrao: boolean; ativo: boolean;
}
export async function salvarAnestesista(
  clienteId: string, a: Omit<Anestesista, 'id'> & { id: string | null }
): Promise<OkMensagem & { id: string | null }> {
  const { data, error } = await supabase.rpc('salvar_anestesista', {
    p_cliente: clienteId, p_id: a.id, p_nome: a.nome, p_valor_dia: a.valor_dia,
    p_dias_semana: a.dias_semana, p_padrao: a.padrao, p_ativo: a.ativo
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ...SEM_RESPOSTA, id: null }) as OkMensagem & { id: string | null };
}
/** Marca o dia (e o anestesista). Não recusa: devolve AVISOS. */
export async function agendarCirurgia(
  solicitacaoId: string, data: string | null, anestesistaId: string | null,
  hora: string | null = null, duracaoMin: number | null = null, salaId: string | null = null
): Promise<OkMensagem & { avisos: string[] }> {
  const { data: r, error } = await supabase.rpc('agendar_cirurgia', {
    p_solicitacao: solicitacaoId, p_data: data, p_anestesista: anestesistaId,
    p_hora: hora, p_duracao_min: duracaoMin, p_sala: salaId
  });
  if (error) throw error;
  return ((r ?? [])[0] ?? { ...SEM_RESPOSTA, avisos: [] }) as OkMensagem & { avisos: string[] };
}
export interface ViabilidadeDoDia {
  dia: string; dia_semana: string; anestesistas: string | null; cirurgias: number;
  custo_anestesia: number; rateio: number | null; minimo_exigido: number | null; cumpre: boolean;
  resultado_previsto: number; incompletas: number;
}
export async function viabilidadeDosDias(clienteId: string, de: string, ate: string): Promise<ViabilidadeDoDia[]> {
  const { data, error } = await supabase.rpc('viabilidade_dos_dias', { p_cliente: clienteId, p_de: de, p_ate: ate });
  if (error) throw error;
  return (data ?? []) as ViabilidadeDoDia[];
}


/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ CIRURGIAS — OS AVISOS POR SETOR (05/11, entrega 3A) — `075`
 *
 *  Nascem DESLIGADOS do WhatsApp: ficam no painel até a troca.
 * ════════════════════════════════════════════════════════════ */
export interface ContatoDoSetor {
  id: string; nome: string; telefone: string; usuario_id: string | null; usuario: string | null; ativo: boolean;
  /** Ligada a um usuário com `cirurgias.aprovar`: recebe os botões APROVAR/REPROVAR (075, parte B). */
  aprova: boolean;
}
export interface ConfigDosAvisosDeCirurgia {
  pode_editar: boolean;
  pode_ligar: boolean;
  whatsapp_ligado: boolean;
  etapas: { id: string; nome: string; cor: string; setor_id: string | null }[];
  setores: { id: string; nome: string; contatos: ContatoDoSetor[] }[];
  /** Nomes de setor usados nas pendências que o cadastro de setores não conhece. */
  setores_sem_cadastro: string[];
  usuarios: { id: string; nome: string }[];
}
export async function configDosAvisosDeCirurgia(clienteId: string): Promise<ConfigDosAvisosDeCirurgia | null> {
  const { data, error } = await supabase.rpc('config_dos_avisos_de_cirurgia', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? null) as ConfigDosAvisosDeCirurgia | null;
}
export async function salvarContatoSetor(
  clienteId: string, c: { id: string | null; setor_id: string; nome: string; telefone: string;
                          usuario_id: string | null; ativo: boolean }
): Promise<OkMensagem & { id: string | null }> {
  const { data, error } = await supabase.rpc('salvar_contato_setor', {
    p_cliente: clienteId, p_id: c.id, p_setor: c.setor_id, p_nome: c.nome, p_telefone: c.telefone,
    p_usuario: c.usuario_id, p_ativo: c.ativo
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ...SEM_RESPOSTA, id: null }) as OkMensagem & { id: string | null };
}
export async function definirSetorDaEtapa(etapaId: string, setorId: string | null): Promise<OkMensagem> {
  const { data, error } = await supabase.rpc('definir_setor_da_etapa', { p_etapa: etapaId, p_setor: setorId });
  if (error) throw error;
  return ((data ?? [])[0] ?? SEM_RESPOSTA) as OkMensagem;
}
export async function ligarAvisosDeCirurgia(clienteId: string, ligado: boolean): Promise<OkMensagem> {
  const { data, error } = await supabase.rpc('ligar_avisos_de_cirurgia', { p_cliente: clienteId, p_ligado: ligado });
  if (error) throw error;
  return ((data ?? [])[0] ?? SEM_RESPOSTA) as OkMensagem;
}
export type SituacaoDoAviso = 'NO_PAINEL' | 'NA_FILA' | 'SEM_CONTATO' | 'SEM_SETOR';
export interface AvisoDeCirurgia {
  id: string; criado_em: string;
  tipo: 'etapa' | 'pendencia_vespera' | 'pendencia_atrasada' | 'aprovacao' | 'comentario' | 'resumo';
  /** Nulos no RESUMO das 7h: ele é do setor, sem cirurgia (076). */
  numero: string | null; paciente: string | null; solicitacao_id: string | null;
  setor: string | null; contato: string | null;
  telefone: string | null; situacao: SituacaoDoAviso; mensagem_situacao: string | null; texto: string;
}
export async function avisosRecentesDeCirurgia(clienteId: string): Promise<AvisoDeCirurgia[]> {
  const { data, error } = await supabase.rpc('avisos_recentes_de_cirurgia', { p_cliente: clienteId, p_limite: 150 });
  if (error) throw error;
  return (data ?? []) as AvisoDeCirurgia[];
}


/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ CIRURGIAS — O ACOMPANHAMENTO, PARTE A (05/11) — `076`
 * ════════════════════════════════════════════════════════════ */
export interface EventoDaCirurgia {
  quando: string;
  tipo: 'etapa' | 'pendencia' | 'comentario' | 'viabilidade' | 'cotacao' | 'aviso';
  titulo: string;
  texto: string | null;
  por?: string | null;
  cor?: string | null;
  mencoes?: string[];
  atrasada?: boolean;
  sem_destino?: boolean;
}
/** Nulo = sem acesso. O médico recebe só as etapas. */
export async function linhaDoTempoDaCirurgia(solicitacaoId: string): Promise<EventoDaCirurgia[] | null> {
  const { data, error } = await supabase.rpc('linha_do_tempo_da_cirurgia', { p_solicitacao: solicitacaoId });
  if (error) throw error;
  return (data ?? null) as EventoDaCirurgia[] | null;
}
export async function comentarCirurgia(
  solicitacaoId: string, texto: string, setores: string[], contatos: string[]
): Promise<OkMensagem & { avisados: number }> {
  const { data, error } = await supabase.rpc('comentar_cirurgia', {
    p_solicitacao: solicitacaoId, p_texto: texto, p_setores: setores, p_contatos: contatos
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ...SEM_RESPOSTA, avisados: 0 }) as OkMensagem & { avisados: number };
}
export interface ResumoDoDia {
  dia: string;
  setores: { setor: string; cadastrado: boolean; atrasadas: number; hoje: number; amanha: number;
             itens: { solicitacao_id: string; numero: string; paciente: string; descricao: string;
                      prazo: string; quando: 'atrasada' | 'hoje' | 'amanha' }[] }[];
}
export async function resumoDoDiaDeCirurgia(clienteId: string): Promise<ResumoDoDia | null> {
  const { data, error } = await supabase.rpc('resumo_do_dia_de_cirurgia', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? null) as ResumoDoDia | null;
}


/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ CIRURGIAS — A CONTA E OS RELATÓRIOS (05/11, entrega 4B) — `077`
 * ════════════════════════════════════════════════════════════ */
export interface ContaDaCirurgia {
  tem_conta: boolean;
  tem_viabilidade: boolean;
  realizada_a_cirurgia: boolean;
  pode_lancar: boolean;
  conta: { valor_faturado: number; faturado_em: string; glosa: number; recebido: number | null;
           recebido_em: string | null; observacao: string | null } | null;
  prevista: { receita: number; diretos: number; fixos: number; resultado: number;
              percentual: number | null; anestesia: number } | null;
  realizada: { receita: number; fonte: string; diretos: number; fixos: number; anestesia: number;
               cirurgias_no_dia: number | null; resultado: number | null; percentual: number | null } | null;
  diferenca: number | null;
}
/** Nulo = sem acesso (faturamento.ver ou a diretoria). */
export async function contaDaCirurgia(solicitacaoId: string): Promise<ContaDaCirurgia | null> {
  const { data, error } = await supabase.rpc('conta_da_cirurgia', { p_solicitacao: solicitacaoId });
  if (error) throw error;
  return (data ?? null) as ContaDaCirurgia | null;
}
export async function salvarContaCirurgia(
  solicitacaoId: string, c: { faturado: number; faturado_em: string; glosa: number;
                              recebido: number | null; recebido_em: string | null; observacao: string | null }
): Promise<OkMensagem> {
  const { data, error } = await supabase.rpc('salvar_conta_cirurgia', {
    p_solicitacao: solicitacaoId, p_faturado: c.faturado, p_faturado_em: c.faturado_em, p_glosa: c.glosa,
    p_recebido: c.recebido, p_recebido_em: c.recebido_em, p_observacao: c.observacao
  });
  if (error) throw error;
  return ((data ?? [])[0] ?? SEM_RESPOSTA) as OkMensagem;
}
export interface RelatorioDeCirurgias {
  erro?: string;
  de: string; ate: string; financeiro: boolean;
  funil: { total: number; negadas: number; canceladas: number;
           etapas: { etapa: string; chave: string; cor: string; chegaram: number; estao_agora: number }[] };
  prazos: { prazo_total: number; agendadas: number; agendadas_no_prazo: number; abertas_fora_do_prazo: number;
            etapas: { etapa: string; chave: string; dia_limite: number | null; passagens: number;
                      dias_medios: number; fora_do_limite: number }[] };
  margem?: { cirurgias: { solicitacao_id: string; numero: string; paciente: string; convenio: string | null;
                          realizada_em: string; prevista: number | null; realizada: number | null;
                          fonte: string | null; diferenca: number | null; tem_conta: boolean }[];
             prevista_total: number; realizada_total: number; sem_conta: number };
  opme: { escolhidas: number; com_3_propostas: number; com_motivo: number;
          total_escolhido: number; economia_sobre_a_maior: number };
  convenios: { convenio: string; cirurgias: number; negadas: number; dias_autorizacao: number | null;
               faturado: number | null; glosa: number | null; glosa_percentual: number | null; recebido: number | null }[];
  atrasos: { setor: string; abertas_atrasadas: number; concluidas_depois_do_prazo: number; concluidas_no_prazo: number }[];
}
export async function relatorioDeCirurgias(clienteId: string, de: string, ate: string): Promise<RelatorioDeCirurgias | null> {
  const { data, error } = await supabase.rpc('relatorio_de_cirurgias', { p_cliente: clienteId, p_de: de, p_ate: ate });
  if (error) throw error;
  return (data ?? null) as RelatorioDeCirurgias | null;
}


/* ════════════════════════════════════════════════════════════
 *  ⭐⭐ A TELA INICIAL PERSONALIZADA (06/11) — `078`
 *  A saudação e o "hoje" de cada módulo. Cada linha só vem para
 *  quem pode ver aquele número.
 * ════════════════════════════════════════════════════════════ */
/** `acao: false` = informação (a agenda do dia), não pendência: não entra no
    "Precisa de você hoje". */
export interface LinhaDoHoje { n: number; texto: string; alerta: boolean; pagina?: string; acao?: boolean }
/** ⭐ Versão 4: os mini-gráficos de cada módulo — cada um só vem para
    quem pode ver aqueles números (o mesmo critério das linhas). */
export interface GraficosDoDia {
  atendimento?: { inicio: number; hora_agora: number; por_hora: number[] };
  cirurgias?: { total: number; por_etapa: { chave: string; nome: string; n: number }[] };
  faturamento?: { realizadas_no_mes: number; lancadas: number };
}
export interface TelaInicial {
  nome: string | null;
  periodo: 'manha' | 'tarde' | 'noite';
  dia: string;
  hoje: Record<string, LinhaDoHoje[]>;
  graficos?: GraficosDoDia;
}
export async function telaInicial(clienteId: string): Promise<TelaInicial | null> {
  const { data, error } = await supabase.rpc('tela_inicial', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? null) as TelaInicial | null;
}


/* ════════════════════════════════════════════════════════════
 *  ⭐⭐ OS FORNECEDORES DE OPME, LIGADOS AOS TIPOS (06/11) — `079`
 * ════════════════════════════════════════════════════════════ */
export interface FornecedorOpme {
  id: string; nome: string; cnpj: string | null; telefone: string | null; email: string | null; ativo: boolean;
  tipos: { id: string; nome: string }[];
  cotacoes: number; respondidas: number; escolhidas: number;
}
export async function fornecedoresOpme(clienteId: string): Promise<FornecedorOpme[]> {
  const { data, error } = await supabase.rpc('fornecedores_opme', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as FornecedorOpme[];
}
export async function definirTiposDoFornecedor(fornecedorId: string, tipos: string[]): Promise<{ ok: boolean; motivo: string }> {
  const { data, error } = await supabase.rpc('definir_tipos_do_fornecedor', { p_fornecedor: fornecedorId, p_tipos: tipos });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, motivo: 'Sem resposta do banco.' }) as { ok: boolean; motivo: string };
}
/** A cotação: todos os ativos, com os ligados ao tipo da cirurgia primeiro (`sugerido`). */
export async function fornecedoresParaCotacao(solicitacaoId: string): Promise<(FornecedorCirurgia & { sugerido: boolean })[]> {
  const { data, error } = await supabase.rpc('fornecedores_para_cotacao', { p_solicitacao: solicitacaoId });
  if (error) throw error;
  return (data ?? []) as (FornecedorCirurgia & { sugerido: boolean })[];
}


/* ════════════════════════════════════════════════════════════
 *  ⭐⭐⭐ O CALENDÁRIO CIRÚRGICO E O MAPA DA TV (06/11) — `080`
 * ════════════════════════════════════════════════════════════ */
export interface SalaCirurgica { id: string; nome: string; ordem?: number; ativa?: boolean }
export interface CirurgiaDoCalendario {
  id: string; numero: string; data: string; hora: string | null; duracao: number | null;
  sala_id: string | null; sala: string | null; paciente: string; procedimento: string | null;
  cirurgiao: string | null; anestesista: string | null; etapa: string; etapa_chave: string; realizada: boolean;
}
export interface CalendarioCirurgico { erro?: string; agora: string; salas: SalaCirurgica[]; cirurgias: CirurgiaDoCalendario[] }
/** Nulo = sem acesso (o médico não vê a agenda da equipe). */
export async function calendarioCirurgico(clienteId: string, de: string, ate: string): Promise<CalendarioCirurgico | null> {
  const { data, error } = await supabase.rpc('calendario_cirurgico', { p_cliente: clienteId, p_de: de, p_ate: ate });
  if (error) throw error;
  return (data ?? null) as CalendarioCirurgico | null;
}
export async function salasCirurgicas(clienteId: string): Promise<SalaCirurgica[]> {
  const { data, error } = await supabase.rpc('salas_cirurgicas', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? []) as SalaCirurgica[];
}
export async function salvarSalaCirurgica(clienteId: string, id: string | null, nome: string, ordem: number, ativa: boolean) {
  const { data, error } = await supabase.rpc('salvar_sala_cirurgica', { p_cliente: clienteId, p_id: id, p_nome: nome, p_ordem: ordem, p_ativa: ativa });
  if (error) throw error;
  return ((data ?? [])[0] ?? { ok: false, motivo: 'Sem resposta do banco.' }) as { ok: boolean; motivo: string };
}
/** O código do link da TV — nulo para quem não gere/configura as cirurgias. */
export async function linkDoMapaTv(clienteId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('link_do_mapa_tv', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? null) as string | null;
}
export async function trocarLinkDoMapaTv(clienteId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('trocar_link_do_mapa_tv', { p_cliente: clienteId });
  if (error) throw error;
  return (data ?? null) as string | null;
}
export interface CirurgiaDaTv {
  data: string; hora: string | null; duracao: number | null; sala_id: string | null;
  paciente: string; procedimento: string | null; cirurgiao: string | null; realizada: boolean;
}
export interface MapaDaTv {
  hospital: string; cor: string | null; logo: string | null; agora: string; semana_de: string;
  salas: SalaCirurgica[]; cirurgias: CirurgiaDaTv[];
}
/** A TV, SEM login: só com o código. O paciente vem pelas iniciais (o banco corta). */
export async function mapaDaTv(codigo: string): Promise<MapaDaTv | null> {
  const { data, error } = await supabase.rpc('mapa_tv', { p_codigo: codigo });
  if (error) throw error;
  return (data ?? null) as MapaDaTv | null;
}
