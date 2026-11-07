/**
 * ============================================================
 *  O MENU LATERAL
 *
 *  As cinco seções e os 21 itens do sistema de hoje, na mesma
 *  ordem e com os mesmos ícones. Copiado do `AdminFrontend.html`
 *  — quem usa a recepção acha tudo no mesmo lugar.
 *
 *  ------------------------------------------------------------
 *  `modulo`: O QUE LIGA E DESLIGA POR CLIENTE
 *
 *  O sistema do St James tem tudo ligado porque é de um hospital
 *  só. Aqui cada cliente contrata o que quer, e o menu mostra só
 *  o que ele contratou — `core.clientes_modulos` decide.
 *
 *  Um item sem `modulo` é do núcleo: aparece sempre.
 *
 *  ------------------------------------------------------------
 *  `pronto`: O QUE JÁ EXISTE
 *
 *  As telas vão sendo construídas uma a uma. Um item ainda não
 *  construído aparece no menu, apagado, e diz que está por vir.
 *
 *  Isso é de propósito. Esconder o que falta faria o sistema
 *  parecer completo e você descobrir o buraco na frente de um
 *  cliente. Assim o mapa inteiro está à vista, e o que falta tem
 *  nome.
 * ============================================================
 */

export interface ItemMenu {
  pagina: string;
  rotulo: string;
  icone: string;
  modulo?: string;
  pronto?: boolean;
  /**
   * ⭐ Só o operador do MedCalendar vê. Não é "módulo", e não é
   *   "permissão": é uma terceira coisa, porque a área
   *   institucional não pertence a cliente nenhum — ela fala
   *   SOBRE os clientes.
   *
   *   Confundir com módulo faria a seção virar algo vendável, e
   *   um hospital poderia acabar contratando a tela que
   *   configura os outros hospitais.
   */
  plataforma?: boolean;
}

export interface SecaoMenu {
  titulo: string;
  itens: ItemMenu[];
  /**
   * ⭐⭐⭐ A QUE MÓDULO DO APP ESTA SEÇÃO PERTENCE   (31/10/2026)
   *
   *  O Tom: *"Quero fazer uma tela inicial que vai ter módulos a
   *  escolher. Atendimento é tudo que está pronto atualmente. E o
   *  módulo Cirurgias."*
   *
   *  Seção sem `grupo` é de **Atendimento** — que é tudo o que
   *  existia até hoje. Assim nenhuma seção precisou ser marcada
   *  uma a uma, e a próxima que alguém criar sem pensar nisso cai
   *  no lugar certo em vez de sumir do menu.
   *
   *  ⚠️ `sempre: true` é para a área institucional: ela não é do
   *     hospital e não pertence a módulo nenhum.
   */
  grupo?: GrupoDoApp;
  sempre?: boolean;
}

/** Os módulos que a tela inicial oferece. */
export type GrupoDoApp = 'atendimento' | 'cirurgias' | 'faturamento';

export interface ModuloDoApp {
  grupo: GrupoDoApp;
  nome: string;
  frase: string;
  icone: string;
  cor: string;
  /** O módulo do cliente que precisa estar ligado. */
  modulo?: string;
  /** Onde cair ao entrar. */
  inicial: string;
}

/**
 * ⭐ A LISTA QUE A TELA INICIAL DESENHA.
 *
 *  O cartão só aparece quando as DUAS coisas valem:
 *    · o hospital contratou o módulo (`core.clientes_modulos`), e
 *    · o usuário tem alguma tela dele no papel.
 *
 *  Decisão do Tom, 31/10: *"todo mundo escolhe ao entrar, mas só
 *  tem acesso aos módulos quem tiver permissão de usuário."*
 */
export const MODULOS_DO_APP: ModuloDoApp[] = [
  {
    grupo: 'atendimento',
    nome: 'Atendimento',
    frase: 'Agenda, exames, chat do paciente e cadastros.',
    icone: 'fa-calendar-check',
    cor: 'var(--primary)',
    /* ⭐ Agendamentos, e não o Dashboard: é a tela em que a
       recepção vive, e é onde o sistema sempre abriu. Trocar a
       porta de entrada de quem já usa é cobrar treinamento de
       novo por uma tela que já funciona. */
    inicial: 'agendamentos'
  },
  {
    grupo: 'cirurgias',
    nome: 'Cirurgias',
    frase: 'Pedidos, quadro de etapas, OPME, viabilidade e pendências.',
    icone: 'fa-diagram-project',
    cor: '#7C3AED',
    modulo: 'cirurgias',
    inicial: 'cirurgias'
  },
  /* ⭐⭐⭐ 02/11/2026 — O MÓDULO FATURAMENTO
   *
   *  O Tom: *"tirar convênio das configurações do módulo
   *  agendamento e criar um módulo faturamento."*
   *
   *  ⚠️ Convênios MUDA DE LUGAR, NÃO DE DONO. O cadastro
   *     continua alimentando a marcação — desligar este módulo
   *     não pode esvaziar a caixinha de convênio da recepção.
   *     Quem prova isso é o caso
   *     "desligar o Faturamento NAO some com os convenios da
   *     marcacao" em `core.conferir_faturamento()`.
   */
  {
    grupo: 'faturamento',
    nome: 'Faturamento',
    frase: 'Convênios, tabela de preços, contas e autorizações.',
    icone: 'fa-file-invoice-dollar',
    cor: '#0F766E',
    modulo: 'faturamento',
    /* ⭐ Entra pelo Painel: é onde se vê o que falta antes de
       sair clicando em cadastro. */
    inicial: 'painelfat'
  }
];

export const MENU: SecaoMenu[] = [
  {
    titulo: 'Principal',
    itens: [
      { pagina: 'dashboard', rotulo: 'Dashboard', icone: 'fa-chart-pie', pronto: true },
      /* ⭐⭐⭐ 26/10: O CONSULTÓRIO DO MÉDICO.
       *
       *  Em PRIMEIRO na seção, e não no fim de "Consultas": para
       *  quem entra como médico, esta é a única tela que importa,
       *  e ela tem que ser a primeira coisa embaixo do polegar.
       *
       *  ⚠️ Ela só aparece para quem tem a tela `meu-dia` no
       *     papel — e o papel `medico` a ganhou no `053`. Quem
       *     não é médico não vê o item, porque para ele a tela
       *     abriria dizendo "você não tem agenda aqui". */
      { pagina: 'meu-dia', rotulo: 'Meu Dia', icone: 'fa-user-doctor',
        modulo: 'agendamento', pronto: true }
    ]
  },
  {
    titulo: 'Consultas',
    itens: [
      { pagina: 'agendamentos',    rotulo: 'Agendamentos',        icone: 'fa-calendar-alt',  modulo: 'agendamento', pronto: true },
      { pagina: 'novoagendamento', rotulo: 'Novo Agendamento',    icone: 'fa-plus-circle',   modulo: 'agendamento', pronto: true },
      { pagina: 'medicos',         rotulo: 'Médicos',             icone: 'fa-user-md',       modulo: 'agendamento', pronto: true },
      { pagina: 'especialidades',  rotulo: 'Especialidades',      icone: 'fa-stethoscope',   modulo: 'agendamento', pronto: true },
      { pagina: 'calendario',      rotulo: 'Agenda do Médico',    icone: 'fa-calendar-days', modulo: 'agendamento', pronto: true }
    ]
  },
  {
    /* ⭐⭐⭐ 31/10/2026 — O MÓDULO CIRURGIAS
     *
     *  O Tom: *"introduzir no novo sistema um novo módulo de
     *  cirurgias, que posso ligar e desligar para cada cliente."*
     *
     *  A seção inteira some quando o hospital não tem o módulo
     *  `cirurgias` — é o `modulo` abaixo que faz isso, e é a
     *  mesma linha que faltou nos Exames em 09/10 e no Chat em
     *  13/10.
     *
     *  ⚠️ O médico vê as DUAS, e isso é de propósito: na de
     *     gestão ele enxerga só as cirurgias dele (a política de
     *     linha do `063`), e é onde acompanha o pedido andando
     *     sem precisar ligar para o administrativo. */
    titulo: 'Cirurgias',
    grupo: 'cirurgias',
    itens: [
      { pagina: 'cirurgias',    rotulo: 'Quadro de Cirurgias', icone: 'fa-diagram-project', modulo: 'cirurgias', pronto: true },
      { pagina: 'novacirurgia', rotulo: 'Nova Solicitação',    icone: 'fa-file-medical',    modulo: 'cirurgias', pronto: true },
      // ⭐ 04/11: os tipos de cirurgia, com as pendências de cada um (073).
      /* ⭐ 06/11: o calendário cirúrgico (hoje/semana/mês) e o mapa da TV (080). */
      { pagina: 'calendariocirurgico', rotulo: 'Calendário Cirúrgico', icone: 'fa-calendar-days', modulo: 'cirurgias', pronto: true },
      { pagina: 'tiposcirurgia', rotulo: 'Tipos de Cirurgia', icone: 'fa-tags',          modulo: 'cirurgias', pronto: true },
      /* ⭐ 06/11: os fornecedores de OPME, ligados aos tipos (079). */
      { pagina: 'fornecedoresopme', rotulo: 'Fornecedores de OPME', icone: 'fa-truck-medical', modulo: 'cirurgias', pronto: true },
      /* ⭐ 05/11: custos, preços, pacotes, OPME e semáforo da viabilidade
         (074). Só a diretoria a recebe por padrão (`telas_padrao`). */
      { pagina: 'custoscirurgia', rotulo: 'Custos de Cirurgia', icone: 'fa-scale-balanced', modulo: 'cirurgias', pronto: true },
      /* ⭐ 05/11: os avisos por setor (075) — etapa → setor, as pessoas
         de cada setor e o que foi avisado. */
      { pagina: 'avisoscirurgia', rotulo: 'Avisos de Cirurgia', icone: 'fa-bell', modulo: 'cirurgias', pronto: true },
      /* ⭐ 05/11: funil, prazos, margem prevista × realizada, OPME,
         convênios e atrasos (077). Só a diretoria, por padrão. */
      { pagina: 'relatorioscirurgia', rotulo: 'Relatórios de Cirurgia', icone: 'fa-chart-column', modulo: 'cirurgias', pronto: true }
    ]
  },
  {
    /* ════════════════════════════════════════════════════════
     *  ⭐⭐⭐ 02/11/2026 — FATURAMENTO
     *
     *  Convênios saiu de "Configurações" e veio para cá. Era a
     *  tela mais mal colocada do painel: ninguém procura o
     *  valor que a Bradesco paga dentro de Configurações.
     *
     *  ⚠️ A seção inteira some quando o hospital não tem o
     *     módulo `faturamento` — e a CAIXINHA DE CONVÊNIO DA
     *     MARCAÇÃO continua cheia. São coisas diferentes: uma é
     *     a tela, a outra é o cadastro.
     */
    titulo: 'Faturamento',
    grupo: 'faturamento',
    itens: [
      /* ⭐⭐⭐ 03/11: o Tom mandou o print do menu e escreveu
         "Nenhum painel." Ele é a PRIMEIRA tela do módulo, e é
         onde se entra ao escolher Faturamento. */
      { pagina: 'painelfat',    rotulo: 'Painel',            icone: 'fa-chart-pie',           modulo: 'faturamento', pronto: true },
      // ⭐ 03/11, noite: as contas por atendimento (072).
      { pagina: 'contas',       rotulo: 'Contas',            icone: 'fa-file-invoice-dollar', modulo: 'faturamento', pronto: true },
      { pagina: 'convenios',    rotulo: 'Convênios',        icone: 'fa-id-card',              modulo: 'faturamento', pronto: true },
      /* ⭐ Os CNPJs que faturam. O St James tem dois — Hospital
         Novo Jarinu e Jarimed — e na Orizon cada um tem conta
         própria. */
      { pagina: 'prestadores',  rotulo: 'CNPJs faturadores', icone: 'fa-building-columns',    modulo: 'faturamento', pronto: true },
      { pagina: 'precos',       rotulo: 'Tabela de preços',  icone: 'fa-table-list',          modulo: 'faturamento', pronto: true }
    ]
  },
  {
    titulo: 'Exames',
    itens: [
      /* ════════════════════════════════════════════════════
       *  ⭐ TRÊS TELAS SAÍRAM DO MAPA EM 11/10/2026
       *
       *  O sistema de hoje tem sete itens aqui. Três deles
       *  passaram a ser respondidos por telas que já existem:
       *
       *   · "Preparos por Subtipo"  → a Gestão de Exames edita o
       *     preparo e as horas de jejum do exame E do subtipo,
       *     na mesma lista;
       *   · "Agenda de Exames"      → a tela de Agendamentos
       *     filtra por tipo e por exame desde 10/10;
       *   · "Lista de Exames"       → idem.
       *
       *  ⚠️ Mantê-las seria mantê-las DIVERGINDO. Duas telas que
       *     respondem "quais exames estão marcados amanhã" acabam
       *     discordando — foi assim que o almoço sumiu de uma
       *     agenda e não da outra, no sistema antigo.
       *
       *  E "Médicos de Exames" + "Horários Médicos Exames"
       *  viraram UMA: o que faltava de verdade não era o médico
       *  (a tela de Médicos já liga médico a exame), era o
       *  APARELHO — que não tinha tela nenhuma.
       * ════════════════════════════════════════════════════ */
      { pagina: 'exames',                rotulo: 'Gestão de Exames',       icone: 'fa-microscope',     modulo: 'exames', pronto: true },
      { pagina: 'aparelhos',             rotulo: 'Aparelhos e Salas',      icone: 'fa-wave-square',    modulo: 'exames', pronto: true },
      { pagina: 'filaexames',            rotulo: 'Fila de Solicitações',   icone: 'fa-list-check',     modulo: 'exames', pronto: true }
    ]
  },
  {
    titulo: 'Atendimento',
    itens: [
      /* ════════════════════════════════════════════════════
       *  ⭐⭐⭐ A "CENTRAL DE MENSAGENS" SAIU DAQUI — 13/10/2026
       *
       *  O Tom, perguntado o que queria no WhatsApp:
       *
       *      *"No WhatsApp não quero tela de texto. Toda
       *      interação com paciente vai ser via chat."*
       *
       *  Eram três itens aqui e em Configurações: "Mensagens",
       *  "WhatsApp" (os textos) e "Monitor Notificações".
       *
       *  ⭐ Item de menu que leva a uma tela que o dono do
       *     produto NÃO quer é pior que item faltando: alguém
       *     clica, vê "por construir", e passa a achar que o
       *     sistema está pela metade.
       *
       *  O que o hospital precisa ver do WhatsApp é o que
       *  CHEGA — e isso é a tela de Conversas, logo abaixo em
       *  Configurações.
       * ════════════════════════════════════════════════════ */
      /* ⭐⭐⭐ 20/10/2026: AQUI ERA "SETORES", E NÃO É MAIS.
       *
       *  O item existia, não estava pronto, e no dia em que o
       *  setor ganhou cadastro o lugar dele ficou claro: dentro
       *  de **Usuários**, ao lado de Pessoas e Papéis. Setor é
       *  sobre QUEM ATENDE — a mesma tela onde se diz quem
       *  entra e o que cada um enxerga.
       *
       *  O que entra no lugar é a tela que o Tom pediu com a
       *  foto do Apps Script na mão: a FILA. Ela é do dia a dia
       *  da recepção, e é por isso que ela fica em Atendimento
       *  e o cadastro não.
       */
      { pagina: 'mensagens', rotulo: 'Mensagens dos Pacientes',
        icone: 'fa-comment-medical', modulo: 'chat', pronto: true }
    ]
  },
  {
    titulo: 'Configurações',
    itens: [
      // ⭐ Fica em Configurações, e não em Cadastros, de
      //    propósito: é uma tela que roda uma vez, na virada.
      //    Ao lado de "Médicos" ela convidaria ao clique diário.
      { pagina: 'importar',            rotulo: 'Importar planilha',   icone: 'fa-file-import', pronto: true },
      { pagina: 'usuarios',            rotulo: 'Usuários',            icone: 'fa-users-cog', pronto: true },
      // ⭐ 22/10: os tempos dos avisos por WhatsApp (a Diretoria ganha a tela).
      { pagina: 'avisos',              rotulo: 'Avisos',              icone: 'fa-bell', pronto: true },
      { pagina: 'logs',                rotulo: 'Registro de atividades', icone: 'fa-clipboard-list', pronto: true },
      // ⭐ 26/10, noite: a lista de quem entra pela porta
      //    `/medico` — quem entra, quem NUNCA entrou e quem
      //    está bloqueado.
      { pagina: 'acessomedicos',       rotulo: 'Acesso dos Médicos',  icone: 'fa-key', pronto: true },
      // ⭐ Pronta em 13/10/2026: é a tela que fecha o buraco de
      //    21/08 — *"eu não consigo ver as mensagens que estão
      //    chegando"*. Ela não tem campo de resposta, de
      //    propósito: toda interação com paciente passa pelo chat.
      { pagina: 'conversas',           rotulo: 'Conversas',           icone: 'fa-comments', modulo: 'chat', pronto: true },
      { pagina: 'relatorios',          rotulo: 'Relatórios/PDF',      icone: 'fa-file-pdf' }
    ]
  },

  /* ════════════════════════════════════════════════════════
   *  ⭐ A ÁREA INSTITUCIONAL — SÓ O OPERADOR DA PLATAFORMA
   *
   *  11/10/2026. Fica por último de propósito: ela não é do
   *  hospital, e no dia a dia de quem usa o painel não existe.
   *
   *  ⚠️ Quem decide se ela aparece é o BANCO
   *     (`public.sou_da_plataforma`), não a tela. E as funções
   *     por trás recusam sozinhas quem não é operador — a seção
   *     some do menu E a porta fica trancada, que são duas
   *     coisas diferentes.
   * ════════════════════════════════════════════════════════ */
  {
    titulo: 'MedCalendar',
    // ⭐ 31/10: ela não é de módulo nenhum — aparece em todos.
    sempre: true,
    itens: [
      { pagina: 'clientes', rotulo: 'Clientes', icone: 'fa-hospital',
        plataforma: true, pronto: true }
    ]
  }
];

/**
 * ------------------------------------------------------------
 *  A LISTA PLANA DAS TELAS — para a tela de permissões
 *
 *  ⭐ Sai do MESMO `MENU` que desenha a barra lateral. Uma
 *  segunda lista escrita à mão envelheceria calada: a tela nova
 *  entra no menu, não entra na lista de permissões, e passa a
 *  ser vista por todo mundo sem ninguém decidir isso.
 * ------------------------------------------------------------
 */
export interface TelaDoSistema {
  pagina: string;
  rotulo: string;
  icone: string;
  secao: string;
  modulo?: string;
  pronto?: boolean;
}

export const TELAS_DO_SISTEMA: TelaDoSistema[] =
  MENU.flatMap(s => s.itens
    // ⚠️ A área da plataforma NÃO entra na tela de permissões.
    //    Lá se dá acesso a telas do hospital; oferecer a área
    //    institucional naquela lista deixaria alguém marcá-la
    //    para uma recepcionista — e ela ficaria marcada, sem
    //    efeito, até o dia em que tivesse efeito.
    .filter(i => !i.plataforma)
    .map(i => ({ ...i, secao: s.titulo })));

/** O rótulo que vai na barra de cima. */
export function tituloDaPagina(pagina: string): string {
  for (const s of MENU)
    for (const i of s.itens)
      if (i.pagina === pagina) return i.rotulo;
  return 'MedCalendar';
}

/** O ícone do WhatsApp é da família `fab`, os outros são `fas`. */
export function familiaDoIcone(icone: string): string {
  return icone === 'fa-whatsapp' ? 'fab' : 'fas';
}
