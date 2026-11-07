import type {
  HospitalDoChat, ItemDoChat, MedicoDoChat,
  AgendamentoDoChat, ExameDoChat, QuemFazNoChat, SetorDoChat,
  BlocoDeOrientacao
} from '../dados';
import { comoHora } from '../grade';
import { porExtensoNoFuso, instanteNoFuso } from '../../../nucleo/formato';
import type { RespostasDaEntrevista } from '../../../nucleo/entrevista';
/* ⭐ 26/10: a MESMA tela de responder que o painel usa.
   Uma segunda cópia das perguntas aqui seria a segunda resposta
   para "como se responde uma entrevista" — e o IMC em metros ou
   centímetros já custou um dia uma vez. */
import { ResponderEntrevista } from '../ResponderEntrevista';

/**
 * ============================================================
 *  O QUE A CONVERSA MOSTRA EM CADA PASSO
 *
 *  Separado do `Chat.tsx` de propósito: lá mora o estado e as
 *  chamadas ao banco; aqui mora só o desenho.
 *
 *  ⭐ A regra que vale para todos os passos: **o paciente nunca
 *     digita o que dá para tocar.** Especialidade, convênio,
 *     médico, dia e hora são botões. Só CPF, nome, nascimento e
 *     telefone são teclado — e para esses o `inputMode` abre o
 *     teclado certo.
 *
 *     Num celular, cada campo de texto é uma chance de errar e
 *     de desistir.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ 14/10 · POR QUE ESTE ARQUIVO FOI REFEITO
 *
 *  O Tom, vendo a primeira versão ao lado do chat que ele já
 *  usa todo dia:
 *
 *      *"Botões bagunçados fora da ordem, sem animações, sem
 *        ícones das especialidades."*
 *
 *  Eu tinha desenhado esta tela **sem nunca ter visto a folha
 *  de estilo dele** — o arquivo que subiu com o nome do CSS era
 *  o JS outra vez, e eu segui adiante em vez de pedir de novo.
 *
 *  ⚠️ A lição não é sobre CSS. É a de sempre, noutra roupa:
 *     **eu respondi uma pergunta que não tinha os dados para
 *     responder**, e a resposta saiu parecendo certa. "Como
 *     este chat deve parecer?" tinha UMA resposta já escrita, e
 *     eu inventei uma segunda.
 *
 *  ⭐ A estrutura abaixo é a dele, item por item:
 *
 *        <button class="option-btn">
 *          <div class="option-icon">🧸</div>
 *          <div class="option-text">
 *            <strong>Pediatria</strong><small>…</small>
 *          </div>
 *          <i class="fas fa-chevron-right"></i>
 *        </button>
 *
 *     Ícone à esquerda, texto no meio, seta à direita, tudo em
 *     UMA coluna. O `chat.css` tem o porquê de cada parte.
 * ============================================================ */

/**
 * ⭐⭐ UM SÓ LUGAR QUE SABE DESENHAR UMA OPÇÃO.
 *
 * Especialidade, convênio e médico são a MESMA coisa na tela:
 * ícone, título, linha de baixo e seta. Três cópias deste JSX
 * seriam três lugares para alguém mudar dois e esquecer um — e
 * o paciente veria duas listas com desenhos diferentes na mesma
 * conversa, sem saber por quê.
 */
function Opcao(p: {
  icone: string;
  titulo: string;
  detalhe?: string | null;
  aoTocar: () => void;
  /** Vira `data-...` para a prova de tela achar o botão certo. */
  marca?: Record<string, string>;
}) {
  return (
    <button className="chat-opcao" onClick={p.aoTocar} {...(p.marca ?? {})}>
      {/* `aria-hidden`: o leitor de tela já vai ler o título. Sem
          isto ele anuncia "ursinho de pelúcia, Pediatria". */}
      <span className="chat-opcao-icone" aria-hidden="true">{p.icone}</span>
      <span className="chat-opcao-texto">
        <strong>{p.titulo}</strong>
        {!!p.detalhe && <small>{p.detalhe}</small>}
      </span>
      <i className="fas fa-chevron-right chat-opcao-seta" aria-hidden="true" />
    </button>
  );
}

export function Passo(p: {
  etapa: string;
  hospital: HospitalDoChat;
  especialidades: ItemDoChat[];
  subareas: ItemDoChat[];
  especialidadePai: ItemDoChat | null;
  convenios: ItemDoChat[];
  medicos: MedicoDoChat[];
  especialidade: ItemDoChat | null;
  convenio: ItemDoChat | null;
  medico: MedicoDoChat | null;
  nome: string;
  /** ⭐ 20/10: "Tom C***" — o resumo de quem foi reconhecido pelo CPF.
      Vazio para quem digitou o próprio nome (aí vale o `nome`). */
  nomeDoResumo: string;
  /** ⭐ 21/10: a clínica atende convênio? Sem convênio, o resumo nem cita. */
  atendeConvenios: boolean;
  telefoneFim: string | null;
  aceitaAgendamento: boolean;
  aceitaWhatsapp: boolean;
  aoAceitarAgendamento: (v: boolean) => void;
  aoAceitarWhatsapp: (v: boolean) => void;
  aoSeguirDoLgpd: () => void;
  aoSouEu: (sim: boolean) => void;
  aoConfirmarTelefone: (mesmo: boolean) => void;
  /** ⭐ 20/10, noite: o recado está completo, ou quer acrescentar? */
  aoConfirmarRecado: (completa: boolean) => void;
  aoMenu: (acao: string, rotulo: string) => void;
  aoVoltarAoMenu: () => void;
  aoEspecialidade: (e: ItemDoChat) => void;
  aoSubespecialidade: (s: ItemDoChat | null) => void;
  aoConvenio: (c: ItemDoChat | null) => void;
  aoMedico: (m: MedicoDoChat) => void;
  /* ⭐ 19/10, noite: ver/cancelar e exames. */
  meus: AgendamentoDoChat[];
  cancelando: AgendamentoDoChat | null;
  exames: ExameDoChat[];
  subtipos: ItemDoChat[];
  quemFaz: QuemFazNoChat[];
  exame: ExameDoChat | null;
  modoExame: boolean;
  pedidoNome: string;
  /** ⭐ 20/10: os subtipos escolhidos, na ordem em que serão
      marcados — um horário em sequência para cada. */
  itensDoPedido: { id: string; nome: string }[];
  executor: QuemFazNoChat | null;
  /** O que já está marcado no passo de subtipo (multi-escolha). */
  marcados: string[];
  aoMarcarSubtipo: (t: ItemDoChat) => void;
  aoSeguirDoSubtipo: () => void;
  aoVerAgendamento: (a: AgendamentoDoChat) => void;
  /* ⭐ 20/10: falar com o hospital. Os setores vêm do CADASTRO. */
  setores: SetorDoChat[];
  protocolo: string;
  aoSetor: (s: SetorDoChat) => void;
  aoConfirmarCancelar: () => void;
  aoExame: (e: ExameDoChat) => void;
  aoQuemFaz: (q: QuemFazNoChat) => void;
  /* ⭐ 26/10: a guia do pedido médico e a entrevista do exame. */
  anexoId: string | null;
  enviandoFoto: boolean;
  /** ⭐ 26/10, à tarde: as folhas já enviadas da guia. */
  paginas: { id: string; nome: string; pagina: number }[];
  maxPaginas: number;
  aoEnviarFoto: (arquivo: File) => void;
  aoRemoverPagina: (id: string) => void;
  aoSeguirDasFotos: () => void;
  aoSemFoto: () => void;
  perguntasDoPedido: unknown[] | null;
  respostas: RespostasDaEntrevista;
  aoResponder: (r: RespostasDaEntrevista) => void;
  aoSeguirDaEntrevista: () => void;
  /** ⭐ 26/10, à tarde: o cartaz de orientações do exame. */
  orientacoes: BlocoDeOrientacao[];
  soOrientacao: boolean;
  aoSeguirDoCartaz: () => void;
  /** ⭐ 19/10: a consulta que ele já tem com este profissional. */
  jaTem: { quando: string; servico: string | null } | null;
  remarcando: boolean;
  aoRemarcar: () => void;
  aoOutroProfissional: () => void;
  mes: string;
  casinhas: (string | null)[];
  vagasNoMes: Map<string, number>;
  minimo: string;
  motivoMinimo: string;
  aoAndarMes: (passo: number) => void;
  aoDia: (d: string) => void;
  dia: string;
  horasDoDia: number[];
  aoHora: (min: number) => void;
  hora: number;
  fuso: string;
  aoConfirmar: () => void;
  meses: string[];
  diasCurtos: string[];
}) {
  const e = p.etapa;

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ O MENU — 17/10/2026
   *
   *  Os cinco itens do chat que o Tom já usa, com os mesmos
   *  emojis (`JS_Paciente.html`, linhas 285-305). Quatro deles
   *  ainda não existem e **dizem isso** quando tocados, com o
   *  telefone do hospital — em vez de sumirem.
   *
   *  ⭐ Botão que some não resolve o problema de quem queria
   *     cancelar: ele escreve "quero cancelar" num chat que só
   *     sabe marcar, e a consulta continua de pé.
   * ════════════════════════════════════════════════════════ */
  if (e === 'menu') {
    const itens: { acao: string; icone: string; titulo: string;
                   detalhe: string; pronto: boolean }[] = [
      { acao: 'agendar',  icone: '📅', titulo: 'Agendar consulta',
        detalhe: 'Marcar com um especialista', pronto: true },
      { acao: 'exame',    icone: '🔬', titulo: 'Solicitar exame',
        detalhe: 'Endoscopia, ultrassom, laboratório…', pronto: true },
      { acao: 'reagendar', icone: '🔄', titulo: 'Reagendar',
        detalhe: 'Mudar a data ou o horário', pronto: true },
      { acao: 'cancelar', icone: '❌', titulo: 'Cancelar',
        detalhe: 'Desmarcar um agendamento', pronto: true },
      { acao: 'outros',   icone: '💬', titulo: 'Outros assuntos',
        detalhe: 'Deixar uma mensagem para a recepção', pronto: true }
    ];
    return (
      <div className="chat-opcoes" data-bloco="menu">
        {itens.map(i => (
          <Opcao key={i.acao} icone={i.icone} titulo={i.titulo}
                 detalhe={i.detalhe}
                 marca={{ 'data-menu': i.acao,
                          'data-pronto': String(i.pronto) }}
                 aoTocar={() => p.aoMenu(i.acao, i.titulo)} />
        ))}
      </div>
    );
  }

  /* ---------------- o que ainda não existe ---------------- */
  if (e === 'so-telefone') {
    return (
      <div className="chat-opcoes" data-bloco="so-telefone">
        <Opcao icone="↩️" titulo="Voltar ao início"
               detalhe="Ver as outras opções"
               marca={{ 'data-acao': 'voltar-menu' }}
               aoTocar={p.aoVoltarAoMenu} />
      </div>
    );
  }

  /* ---------------- o telefone do cadastro ---------------- */
  if (e === 'confirma-telefone') {
    return (
      <div className="chat-opcoes" data-bloco="confirma-telefone">
        <Opcao icone="✅" titulo="Sim, é esse"
               detalhe="Confirmo o número"
               marca={{ 'data-acao': 'telefone-mesmo' }}
               aoTocar={() => p.aoConfirmarTelefone(true)} />
        <Opcao icone="✏️" titulo="Mudou"
               detalhe="Informar outro número"
               marca={{ 'data-acao': 'telefone-mudou' }}
               aoTocar={() => p.aoConfirmarTelefone(false)} />
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ ELE JÁ TEM CONSULTA COM ESTE PROFISSIONAL
   *                                           (19/10/2026)
   *
   *  O Tom recusou o "dia cinza" para este caso:
   *
   *    *"Quero que avise que já há um agendamento futuro com
   *     esse profissional e informe a data, caso queira
   *     reagendar clique no botão reagendar."*
   *
   *  ⭐ Dois botões, e os dois levam a algum lugar. Um aviso
   *     com um beco sem saída é pior que o dia cinza: pelo
   *     menos o cinza não promete nada.
   * ════════════════════════════════════════════════════════ */
  if (e === 'ja-tem' && p.jaTem) {
    const d = new Date(p.jaTem.quando);
    return (
      <div className="chat-opcoes" data-bloco="ja-tem">
        <div className="chat-ja-tem" data-aviso="ja-tem">
          <strong>
            {d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            {' às '}
            {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </strong>
          {!!p.jaTem.servico && <span>{p.jaTem.servico}</span>}
        </div>
        <Opcao icone="🔄" titulo="Reagendar essa consulta"
               detalhe="Escolher outra data e horário"
               marca={{ 'data-acao': 'remarcar' }}
               aoTocar={p.aoRemarcar} />
        <Opcao icone="👤" titulo="Escolher outro profissional"
               detalhe="Ver a lista de novo"
               marca={{ 'data-acao': 'outro-profissional' }}
               aoTocar={p.aoOutroProfissional} />
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ FALAR COM O HOSPITAL   (20/10/2026)
   *
   *  A última opção do menu que ainda dizia "ainda não".
   *
   *  ⚠️ A ideia óbvia seria mostrar um telefone. Mas quem abre
   *     o chat às 22h não quer um telefone: quer deixar o
   *     recado e ir dormir.
   *
   *  ⚠️⚠️ ESTA LISTA ERA CINCO STRINGS AQUI DENTRO, e o Tom
   *      recusou com uma frase que resolve o desenho:
   *
   *      *"isso são setores dentro do painel, onde usuários
   *       recebem as mensagens do seu setor."*
   *
   *      Três coisas erradas na lista no código: todo hospital
   *      teria os mesmos cinco assuntos ("Ouvidoria" não existe
   *      em clínica pequena); o recado caía numa fila só, e
   *      quem responde resultado de exame não é quem responde
   *      reclamação; e mudar a lista exigiria um envio de
   *      código — ou seja, exigiria a mim.
   *
   *  ⭐ Assunto não é texto de tela: é CADASTRO.
   * ════════════════════════════════════════════════════════ */
  if (e === 'assunto') {
    return (
      <div className="chat-opcoes" data-bloco="assuntos">
        {p.setores.map(st => (
          <Opcao key={st.id} icone={st.icone || '💬'} titulo={st.nome}
                 detalhe={st.descricao}
                 marca={{ 'data-setor': st.id,
                          'data-whatsapp': st.no_whatsapp ? 'sim' : 'nao' }}
                 aoTocar={() => p.aoSetor(st)} />
        ))}
      </div>
    );
  }

  /* ⚠️ O passo 'recado' NÃO desenha campo aqui.
  
       A primeira versão punha um `textarea` dentro do balão, e
       isso daria DOIS campos de digitação na mesma tela: o do
       balão e a barra de baixo, que o chat já tem para CPF,
       nome e telefone.
  
       ⭐ Dois campos é a pergunta "em qual eu escrevo?" — e no
          celular um deles fica escondido atrás do teclado. O
          recado usa a MESMA barra, que é a que a pessoa já
          aprendeu a usar nos passos anteriores. */

  if (e === 'recado-conferir') {
    return (
      <div className="chat-opcoes" data-bloco="recado-conferir">
        <Opcao icone="✅" titulo="Está completa"
               detalhe="Enviar para o hospital"
               marca={{ 'data-acao': 'recado-enviar' }}
               aoTocar={() => p.aoConfirmarRecado(true)} />
        <Opcao icone="✏️" titulo="Quero acrescentar"
               detalhe="Escrever mais antes de enviar"
               marca={{ 'data-acao': 'recado-acrescentar' }}
               aoTocar={() => p.aoConfirmarRecado(false)} />
      </div>
    );
  }

  if (e === 'recado-enviado') {
    return (
      <div className="chat-opcoes" data-bloco="recado-enviado">
        <div className="chat-ja-tem" data-aviso="protocolo">
          <strong>{p.protocolo}</strong>
          <span>Seu número de protocolo</span>
        </div>
        <Opcao icone="↩️" titulo="Voltar ao início"
               detalhe="Ver as outras opções"
               marca={{ 'data-acao': 'voltar-menu' }}
               aoTocar={p.aoVoltarAoMenu} />
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ O QUE ELE JÁ TEM MARCADO   (19/10/2026, noite)
   *
   *  Escolha do Tom para a tela seguinte. Cada linha diz
   *  QUANDO, O QUÊ e COM QUEM — e só oferece cancelar quando
   *  ainda dá tempo.
   *
   *  ⚠️ O que não pode ser cancelado aparece MESMO ASSIM, em
   *     cinza, com o porquê. Sumir com ele faria o paciente
   *     achar que o atendimento não existe.
   * ════════════════════════════════════════════════════════ */
  if (e === 'meus') {
    return (
      <div className="chat-opcoes" data-bloco="meus">
        {p.meus.map(a => {
          const d = new Date(a.quando);
          const quando = d.toLocaleDateString('pt-BR',
                           { day: '2-digit', month: '2-digit', year: 'numeric' })
            + ' às ' + d.toLocaleTimeString('pt-BR',
                           { hour: '2-digit', minute: '2-digit' });
          return a.pode_cancelar ? (
            <Opcao key={a.id} icone="🗓️" titulo={quando}
                   detalhe={`${a.servico} · ${a.profissional}`}
                   marca={{ 'data-agendamento': a.id, 'data-cancelavel': 'sim' }}
                   aoTocar={() => p.aoVerAgendamento(a)} />
          ) : (
            <div key={a.id} className="chat-opcao apagada"
                 data-agendamento={a.id} data-cancelavel="nao">
              <span className="chat-opcao-icone" aria-hidden="true">🕐</span>
              <span className="chat-opcao-texto">
                <strong>{quando}</strong>
                <small>{a.servico} · {a.profissional}</small>
                <small className="chat-opcao-nota">
                  Falta pouco para o horário — para desmarcar, ligue para nós.
                </small>
              </span>
            </div>
          );
        })}
        <Opcao icone="↩️" titulo="Voltar ao início"
               detalhe="Ver as outras opções"
               marca={{ 'data-acao': 'voltar-menu' }}
               aoTocar={p.aoVoltarAoMenu} />
      </div>
    );
  }

  if (e === 'cancelando' && p.cancelando) {
    return (
      <div className="chat-opcoes" data-bloco="cancelando">
        <Opcao icone="✅" titulo="Sim, cancelar"
               detalhe="A vaga volta para a agenda"
               marca={{ 'data-acao': 'confirmar-cancelar' }}
               aoTocar={p.aoConfirmarCancelar} />
        <Opcao icone="↩️" titulo="Não, deixa como está"
               detalhe="Voltar para a lista"
               marca={{ 'data-acao': 'desistir-cancelar' }}
               aoTocar={() => p.aoVerAgendamento(p.cancelando!)} />
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ EXAMES   (19/10/2026, noite)
   *
   *  O Tom: *"mesma regra de subespecialidade para os subtipos
   *  de exames."* Então é a mesma tela, com outro nome: o exame
   *  de cima primeiro, os subtipos num segundo passo.
   * ════════════════════════════════════════════════════════ */
  if (e === 'exame') {
    return (
      <div className="chat-opcoes" data-bloco="exames">
        {p.exames.map(x => (
          <Opcao key={x.id} icone={x.icone || '🔬'} titulo={x.nome}
                 detalhe={x.entrevista
                   ? 'Passa por avaliação antes'
                   : (x.tem_subtipos ? 'Tem mais de um tipo' : undefined)}
                 marca={{ 'data-exame': x.id,
                          'data-entrevista': x.entrevista ? 'sim' : 'nao' }}
                 aoTocar={() => p.aoExame(x)} />
        ))}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ O PEDIDO DE EXAME TEM MAIS DE UM   (20/10/2026)
   *
   *  O Tom: *"o exames precisa dar pra escolher quantos
   *  subtipos tiverem no pedido. Exemplo USG. E cada subtipo
   *  preenche um horário em sequência, lembra?"*
   *
   *  Lembro — é a regra do pedido múltiplo que o painel já tem
   *  desde 09/10, e eu construí o chat com escolha de UM. A
   *  guia do médico quase nunca pede um ultrassom: pede abdome
   *  E tireoide, e os dois são feitos na mesma ida.
   *
   *  ⭐ Por isso aqui é caixinha, não botão: a lista continua
   *     aberta depois do toque, e o "Continuar" só destrava com
   *     pelo menos um marcado.
   *
   *  ⚠️ A ORDEM importa: ela é a ordem em que os horários vão
   *     ser ocupados, em sequência. Por isso a lista mostra o
   *     número ao lado do que já foi marcado — o paciente
   *     precisa poder conferir o que pediu, e em que ordem.
   * ════════════════════════════════════════════════════════ */
  if (e === 'subtipo') {
    const n = p.marcados.length;
    return (
      <div className="chat-opcoes" data-bloco="subtipos">
        {p.subtipos.map(t => {
          const pos = p.marcados.indexOf(t.id);
          return (
            <button key={t.id}
                    className={'chat-opcao chat-opcao-marcavel'
                               + (pos >= 0 ? ' marcada' : '')}
                    data-subtipo={t.id}
                    data-marcado={pos >= 0 ? 'sim' : 'nao'}
                    onClick={() => p.aoMarcarSubtipo(t)}>
              <span className="chat-opcao-caixa" aria-hidden="true">
                {pos >= 0 ? pos + 1 : ''}
              </span>
              <span className="chat-opcao-texto">
                <strong>{t.nome}</strong>
              </span>
            </button>
          );
        })}

        <button className="chat-opcao forte"
                data-acao="seguir-subtipos"
                disabled={n === 0}
                onClick={p.aoSeguirDoSubtipo}>
          <i className="fas fa-check" />{' '}
          {n === 0 ? 'Escolha ao menos um'
                   : n === 1 ? 'Continuar com 1 exame'
                             : `Continuar com ${n} exames`}
        </button>
      </div>
    );
  }

  if (e === 'quem-faz') {
    return (
      <div className="chat-opcoes" data-bloco="quem-faz">
        {p.quemFaz.map(q => (
          <Opcao key={q.id} icone={q.eh_aparelho ? '🖥️' : '👤'} titulo={q.nome}
                 /* ⭐ Dizer que é APARELHO importa: o paciente que
                    lê "Ultrassom 2" como se fosse gente acha que
                    o sistema está quebrado. */
                 detalhe={q.eh_aparelho ? 'Equipamento do hospital' : undefined}
                 marca={{ 'data-quem-faz': q.id,
                          'data-aparelho': q.eh_aparelho ? 'sim' : 'nao' }}
                 aoTocar={() => p.aoQuemFaz(q)} />
        ))}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ A FOTO DO PEDIDO MÉDICO   (26/10/2026)
   *
   *  O Tom: *"o fluxo de exames não está solicitando foto do
   *  pedido médico. (…) Preciso desse fluxo."*
   *
   *  ⭐ `capture="environment"` abre a CÂMERA DE TRÁS direto no
   *     celular, sem passar pela galeria. Quem está com a guia
   *     na mão toca uma vez e fotografa.
   *
   *  ⭐⭐ E o `accept` aceita PDF também: metade das guias de
   *      convênio chega por e-mail, já em PDF, e obrigar a
   *      fotografar a tela do computador seria absurdo.
   *
   *  ⚠️ O botão "não estou com o pedido" NÃO é desistência: é
   *     o caminho da fila, e ele DIZ o que vai acontecer. Botão
   *     de escape sem explicação é o que faz o paciente ligar
   *     para o hospital perguntando o que aconteceu.
   * ════════════════════════════════════════════════════════ */
  if (e === 'pedido-foto') {
    const n = p.paginas.length;
    const cheio = n >= p.maxPaginas;
    return (
      <div className="chat-opcoes" data-bloco="pedido-foto">
        {/* ⭐⭐⭐ 26/10, à tarde: AS FOLHAS JÁ ENVIADAS.
            O Tom: *"as vezes tem mais de uma folha"*. Sem esta
            lista o paciente não teria como saber se a segunda
            foto entrou — e mandaria a mesma três vezes. */}
        {n > 0 && (
          <div className="chat-folhas" data-bloco="folhas-da-guia">
            {p.paginas.map(f => (
              <div key={f.id} className="chat-folha" data-folha={f.id}>
                <span className="chat-folha-num" aria-hidden="true">{f.pagina}</span>
                <span className="chat-folha-nome">{f.nome}</span>
                <button type="button" className="chat-folha-tirar"
                        data-acao="remover-folha"
                        aria-label={`Remover a folha ${f.pagina}`}
                        onClick={() => p.aoRemoverPagina(f.id)}>
                  <i className="fas fa-times" />
                </button>
              </div>
            ))}
          </div>
        )}

        <label className={'chat-opcao chat-opcao-arquivo'
                          + (p.enviandoFoto || cheio ? ' ocupada' : '')}
               data-acao="escolher-foto">
          <span className="chat-opcao-icone" aria-hidden="true">
            {p.enviandoFoto ? '⏳' : '📷'}
          </span>
          <span className="chat-opcao-texto">
            <strong>
              {p.enviandoFoto ? 'Enviando…'
                : cheio ? `Máximo de ${p.maxPaginas} folhas`
                : n === 0 ? 'Enviar o pedido médico'
                : 'Enviar outra folha'}
            </strong>
            <small>
              {n === 0
                ? 'Foto da guia (JPG, PNG) ou PDF, até 8 MB'
                : `${n} folha${n > 1 ? 's' : ''} enviada${n > 1 ? 's' : ''}`
                  + (cheio ? '' : ` · cabem até ${p.maxPaginas}`)}
            </small>
          </span>
          <input type="file" data-campo="arquivo-pedido"
                 accept="image/jpeg,image/png,image/webp,application/pdf"
                 capture="environment"
                 disabled={p.enviandoFoto || cheio}
                 onChange={ev => {
                   const a = ev.target.files?.[0];
                   /* ⚠️ Limpa o campo: sem isso, escolher O MESMO
                      arquivo de novo (depois de uma recusa) não
                      dispara `change` nenhum, e a tela ficaria
                      parada sem motivo visível. */
                   ev.target.value = '';
                   if (a) p.aoEnviarFoto(a);
                 }} />
        </label>

        {/* ⚠️ O "Continuar" só aparece com folha na mão, e é ele
            que fecha a guia. Seguir sozinho no primeiro envio
            tornaria a segunda folha impossível — que é
            exatamente o que o Tom pediu para existir. */}
        {n > 0 && (
          <button className="chat-opcao forte"
                  data-acao="seguir-fotos"
                  disabled={p.enviandoFoto}
                  onClick={p.aoSeguirDasFotos}>
            <i className="fas fa-check" />{' '}
            {n === 1 ? 'Continuar com 1 folha' : `Continuar com ${n} folhas`}
          </button>
        )}

        <Opcao icone="🕐" titulo="Não estou com o pedido agora"
               detalhe="A recepção entra em contato para concluir"
               marca={{ 'data-acao': 'sem-pedido' }}
               aoTocar={p.aoSemFoto} />
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ O CARTAZ DE ORIENTAÇÕES   (26/10/2026, à tarde)
   *
   *  O Tom mandou a arte do Laboratório Clínico do St James e
   *  pediu: *"quando alguém clicar em cima do laboratório o
   *  chat mostre essas orientações"*.
   *
   *  ⚠️ Nada aqui é do St James. Os blocos vêm do CADASTRO do
   *     exame — *"criar um sistema para mais de um cliente
   *     precisa deixar disponível e personalizável para
   *     qualquer hospital"*, palavra dele. Outro hospital
   *     escreve os seus e a tela é a mesma.
   * ════════════════════════════════════════════════════════ */
  if (e === 'orientacoes') {
    return (
      <div className="chat-opcoes" data-bloco="orientacoes">
        <div className="chat-cartaz">
          {p.orientacoes.map((b, i) => (
            <div key={i} className="chat-cartaz-bloco" data-bloco-orientacao={i}>
              <span className="chat-cartaz-icone" aria-hidden="true">
                {b.icone || 'ℹ️'}
              </span>
              <span className="chat-cartaz-texto">
                {!!b.titulo && <strong>{b.titulo}</strong>}
                {!!b.texto && <span>{b.texto}</span>}
              </span>
            </div>
          ))}
          {!p.orientacoes.length && (
            <div className="chat-cartaz-bloco">
              <span className="chat-cartaz-icone" aria-hidden="true">ℹ️</span>
              <span className="chat-cartaz-texto">
                <span>Fale com o setor para combinar este exame.</span>
              </span>
            </div>
          )}
        </div>

        {p.soOrientacao ? (
          <>
            {/* O telefone do setor é o próximo passo de verdade
                para quem ficou com dúvida — não um beco. */}
            {!!p.exame?.telefone_setor && (
              <Opcao icone="📞" titulo={p.exame.telefone_setor}
                     detalhe={p.exame.setor ?? 'Falar com o setor'}
                     marca={{ 'data-acao': 'telefone-setor' }}
                     aoTocar={() => { window.location.href =
                       'tel:' + (p.exame?.telefone_setor ?? '').replace(/\D/g, ''); }} />
            )}
            <Opcao icone="↩️" titulo="Voltar ao início"
                   detalhe="Ver as outras opções"
                   marca={{ 'data-acao': 'voltar-menu' }}
                   aoTocar={p.aoVoltarAoMenu} />
          </>
        ) : (
          <button className="chat-opcao forte"
                  data-acao="seguir-cartaz"
                  onClick={p.aoSeguirDoCartaz}>
            <i className="fas fa-check" /> Entendi, continuar
          </button>
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
   *  ⭐⭐⭐ A ENTREVISTA DO EXAME, NO CHAT   (26/10/2026)
   *
   *  O Tom: *"Testei a Colonoscopia e não está indo no chat
   *  para a entrevista configurada no painel."*
   *
   *  As perguntas são as MESMAS do painel, pela MESMA tela. O
   *  "1,68 ou 168" da altura, a marca de atenção, o IMC
   *  calculado — tudo isso já estava resolvido num lugar só, e
   *  reescrever aqui seria pedir para divergir.
   * ════════════════════════════════════════════════════════ */
  if (e === 'entrevista') {
    return (
      <div className="chat-opcoes chat-entrevista" data-bloco="entrevista">
        <ResponderEntrevista perguntas={p.perguntasDoPedido}
                             respostas={p.respostas}
                             aoMudar={p.aoResponder} />
        <button className="chat-opcao forte"
                data-acao="seguir-entrevista"
                onClick={p.aoSeguirDaEntrevista}>
          <i className="fas fa-paper-plane" /> Enviar para o setor
        </button>
      </div>
    );
  }

  /* ⭐ O pedido entrou na fila: protocolo e porta de saída. */
  if (e === 'pedido-enviado') {
    return (
      <div className="chat-opcoes" data-bloco="pedido-enviado">
        <div className="chat-ja-tem" data-aviso="protocolo">
          <strong>{p.protocolo}</strong>
          <span>Seu número de protocolo</span>
        </div>
        {/* ⚠️ O telefone do setor continua aqui — não como beco,
            como atalho para quem tem pressa. */}
        {!!p.exame?.telefone_setor && (
          <Opcao icone="📞" titulo={p.exame.telefone_setor}
                 detalhe={p.exame.setor ?? 'Falar com o setor'}
                 marca={{ 'data-acao': 'telefone-setor' }}
                 aoTocar={() => { window.location.href =
                   'tel:' + (p.exame?.telefone_setor ?? '').replace(/\D/g, ''); }} />
        )}
        <Opcao icone="↩️" titulo="Voltar ao início"
               detalhe="Ver as outras opções"
               marca={{ 'data-acao': 'voltar-menu' }}
               aoTocar={p.aoVoltarAoMenu} />
      </div>
    );
  }

  /* ---------------- a subárea ---------------- */
  if (e === 'subespecialidade' && p.subareas.length) {
    return (
      <div className="chat-opcoes" data-bloco="subespecialidades">
        {/* ⭐⭐ "NÃO SEI" EM PRIMEIRO, e não no fim.
            Quem não sabe se é ombro ou coluna é quem mais
            precisa desta linha — e quem menos vai rolar a lista
            inteira para achá-la. Seguir por aqui usa a
            especialidade-pai, e o banco devolve os médicos de
            TODAS as subáreas mais os gerais. */}
        <Opcao icone="🤔" titulo="Não sei dizer"
               detalhe="Ver todos os profissionais"
               marca={{ 'data-sub': 'qualquer' }}
               aoTocar={() => p.aoSubespecialidade(null)} />
        {p.subareas.map(x => (
          <Opcao key={x.id} icone={x.icone ?? '🩺'} titulo={x.nome}
                 marca={{ 'data-sub': x.id }}
                 aoTocar={() => p.aoSubespecialidade(x)} />
        ))}
      </div>
    );
  }

  /* ---------------- LGPD ---------------- */
  if (e === 'lgpd') {
    if (!p.hospital.marcar_consulta) {
      return (
        <div className="chat-aviso atencao" data-aviso="sem-modulo">
          <strong>Agendamento online indisponível</strong>
          {p.hospital.telefone
            ? `Ligue para ${p.hospital.telefone} e marcamos com você.`
            : 'Por favor, entre em contato com o hospital.'}
        </div>
      );
    }
    return (
      <>
        <div className="chat-lgpd" data-bloco="lgpd">
          <label data-campo="aceita-agendamento">
            <input type="checkbox" checked={p.aceitaAgendamento}
                   onChange={ev => p.aoAceitarAgendamento(ev.target.checked)} />
            <span>
              Autorizo o uso dos meus dados para <strong>marcar e
              gerenciar meu atendimento</strong> no {p.hospital.nome}.
            </span>
          </label>

          {/* ⭐⭐ SEPARADO, e não "aceito tudo". O paciente pode
              querer marcar e não querer receber mensagem — e
              juntar as duas numa caixinha só é o que torna um
              consentimento inútil como prova. */}
          <label data-campo="aceita-whatsapp">
            <input type="checkbox" checked={p.aceitaWhatsapp}
                   onChange={ev => p.aoAceitarWhatsapp(ev.target.checked)} />
            <span>
              Quero receber <strong>confirmação e lembrete</strong> da minha
              consulta por WhatsApp. <small>(opcional)</small>
            </span>
          </label>

          {!!p.hospital.politica_url && (
            <p style={{ margin: '8px 0 0', fontSize: '.78rem' }}>
              <a href={p.hospital.politica_url} target="_blank"
                 rel="noopener noreferrer" data-link="politica">
                Ler a política de privacidade
              </a>
            </p>
          )}
        </div>

        <div className="chat-opcoes">
          <button className="chat-opcao forte"
                  data-acao="aceitar-lgpd"
                  disabled={!p.aceitaAgendamento}
                  onClick={p.aoSeguirDoLgpd}>
            <i className="fas fa-arrow-right" /> Continuar
          </button>
        </div>
        {!p.aceitaAgendamento && (
          <div className="chat-aviso info" data-aviso="precisa-aceitar">
            A primeira autorização é obrigatória — sem ela não temos como
            guardar seu agendamento.
          </div>
        )}
      </>
    );
  }

  /* ---------------- é você? ---------------- */
  if (e === 'quem-e-voce') {
    return (
      <>
        {/* ⚠️ 17/10 · AQUI TINHA UM AVISO COM O TELEFONE, E ELE SAIU.
            O Tom: *"tá repetitivo o número do telefone; assim que
            coloca o CPF aparece o número de telefone, e quando
            fala sou eu [aparece de novo]."*

            Ele estava certo: o mesmo `(••) •••••-4321` aparecia
            duas vezes seguidas, a dois toques de distância —
            aqui como aviso e logo depois como pergunta.

            ⭐ Duas telas dizendo a mesma coisa não é reforço, é
               ruído: a segunda ensina que a primeira não
               precisava ser lida. O número fica só onde ele é
               uma PERGUNTA ("ainda é este?"), que é onde o
               paciente pode fazer algo a respeito. */}
        <div className="chat-opcoes">
          <Opcao icone="✅" titulo="Sim, sou eu"
                 detalhe="Seguir com este cadastro"
                 marca={{ 'data-acao': 'sou-eu' }}
                 aoTocar={() => p.aoSouEu(true)} />
          <Opcao icone="👤" titulo="Não sou eu"
                 detalhe="Digitar o CPF de novo"
                 marca={{ 'data-acao': 'nao-sou-eu' }}
                 aoTocar={() => p.aoSouEu(false)} />
        </div>
      </>
    );
  }

  /* ---------------- especialidade ---------------- */
  if (e === 'especialidade' && p.especialidades.length) {
    return (
      <div className="chat-opcoes" data-bloco="especialidades">
        {p.especialidades.map(x => (
          <Opcao key={x.id}
                 /* ⭐ O emoji vem do BANCO — `chat_especialidades`
                    devolve `icone`, que é a coluna que o hospital
                    escolhe, ou o chute pelo nome quando ele não
                    escolheu. O `?? '🩺'` é só a rede: um painel
                    velho que ainda não mande a coluna não deixa
                    buraco branco na tela do paciente. */
                 icone={x.icone ?? '🩺'}
                 titulo={x.nome}
                 marca={{ 'data-especialidade': x.id }}
                 aoTocar={() => p.aoEspecialidade(x)} />
        ))}
      </div>
    );
  }

  /* ---------------- convênio ---------------- */
  if (e === 'convenio') {
    /* ⭐⭐⭐ 20/10: NO EXAME, "PARTICULAR" É O DO CADASTRO.
       No St James o Particular é um CONVÊNIO cadastrado. No
       exame, o botão Particular usa ESSE registro: senão quem
       toca em "Particular" passaria sem convênio por cima da
       restrição que a Gestão de Exames marcou — e a recepção,
       no painel, escolhendo o mesmo Particular, seria barrada.
       Duas respostas para a mesma pergunta.
       ⚠️ Só no exame, por enquanto: na consulta, trocar o
          particular "vazio" pelo cadastrado mudaria quais médicos
          aparecem, e isso é decisão do Tom. */
    const particularDoCadastro = p.modoExame
      ? p.convenios.find(c => c.nome.trim().toLowerCase() === 'particular') ?? null
      : null;
    const convsSemParticular = particularDoCadastro
      ? p.convenios.filter(c => c.id !== particularDoCadastro.id)
      : p.convenios;
    return (
      <div className="chat-opcoes" data-bloco="convenios">
        {/* ⭐⭐ PARTICULAR EM PRIMEIRO, como no chat de hoje.
            Não é ordem alfabética: é que "não tenho convênio" é
            a resposta mais comum, e deixá-la no fim da lista
            faz o paciente rolar a lista inteira para dizer
            "nenhum". */}
        <Opcao icone="💳" titulo="Particular" detalhe="Sem convênio"
               marca={{ 'data-convenio': 'particular' }}
               aoTocar={() => p.aoConvenio(particularDoCadastro)} />
        {convsSemParticular.map(c => (
          <Opcao key={c.id} icone="🏦" titulo={c.nome}
                 marca={{ 'data-convenio': c.id }}
                 aoTocar={() => p.aoConvenio(c)} />
        ))}
      </div>
    );
  }

  /* ---------------- médico ---------------- */
  if (e === 'medico' && p.medicos.length) {
    return (
      <div className="chat-opcoes" data-bloco="medicos">
        {p.medicos.map(m => (
          <Opcao key={m.id} icone="👨‍⚕️" titulo={m.nome}
                 detalhe={`${m.servico} · ${m.duracao_min} min`}
                 marca={{ 'data-medico': m.id }}
                 aoTocar={() => p.aoMedico(m)} />
        ))}
      </div>
    );
  }

  /* ---------------- o dia ---------------- */
  if (e === 'dia' && p.mes) {
    const ano = p.mes.slice(0, 4);
    const mesNum = Number(p.mes.slice(5, 7)) - 1;
    // ⭐ A seta de voltar trava no mês do piso. Deixar andar para
    //   trás mostraria um mês inteiro cinza, e o paciente
    //   concluiria que não há vaga nenhuma.
    const podeVoltar = p.mes > p.minimo.slice(0, 8) + '01';
    return (
      <>
        {!!p.motivoMinimo && (
          <div className="chat-aviso info" data-aviso="piso">
            <strong>Sobre a data</strong>
            {p.motivoMinimo}
          </div>
        )}
        <div className="chat-cal" data-bloco="calendario">
          <div className="chat-cal-topo">
            <button onClick={() => p.aoAndarMes(-1)} disabled={!podeVoltar}
                    data-acao="mes-anterior" aria-label="Mês anterior">
              <i className="fas fa-chevron-left" />
            </button>
            <span>{p.meses[mesNum]} de {ano}</span>
            <button onClick={() => p.aoAndarMes(1)}
                    data-acao="mes-seguinte" aria-label="Próximo mês">
              <i className="fas fa-chevron-right" />
            </button>
          </div>
          <div className="chat-cal-grade">
            {p.diasCurtos.map((d, i) => (
              <div key={i} className="chat-cal-cab">{d}</div>
            ))}
            {p.casinhas.map((c, i) => {
              if (c === null) {
                return <div key={`v${i}`} className="chat-cal-dia vazio" />;
              }
              const quantas = p.vagasNoMes.get(c) ?? 0;
              const cedo = c < p.minimo;
              const tem = quantas > 0 && !cedo;
              return (
                <button key={c}
                        className={'chat-cal-dia ' + (tem ? 'tem' : 'sem')
                                   + (p.dia === c ? ' escolhido' : '')}
                        data-dia={c} data-vagas={quantas}
                        disabled={!tem}
                        /* O pontinho verde é desenho; quem usa
                           leitor de tela precisa do número. */
                        aria-label={tem
                          ? `Dia ${Number(c.slice(8))}, ${quantas} horário(s)`
                          : `Dia ${Number(c.slice(8))}, sem vaga`}
                        onClick={() => tem && p.aoDia(c)}>
                  {Number(c.slice(8))}
                </button>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  /* ---------------- a hora ---------------- */
  if (e === 'hora') {
    if (!p.horasDoDia.length) {
      return (
        <div className="chat-aviso atencao" data-aviso="sem-hora">
          <strong>Esse dia acabou de encher.</strong>
          Escolha outro dia no calendário acima.
        </div>
      );
    }
    return (
      <div className="chat-horas" data-bloco="horas">
        {p.horasDoDia.map(m => (
          <button key={m}
                  className={'chat-hora' + (p.hora === m ? ' escolhida' : '')}
                  data-hora={comoHora(m)}
                  onClick={() => p.aoHora(m)}>
            {comoHora(m)}
          </button>
        ))}
      </div>
    );
  }

  /* ---------------- confirmar ---------------- */
  if (e === 'confirmar' || e === 'marcando') {
    const quando = p.dia && p.hora >= 0
      ? `${porExtensoNoFuso(instanteNoFuso(p.dia, p.hora, p.fuso), p.fuso)} `
        + `às ${comoHora(p.hora)}`
      : '';
    return (
      <>
        <div className="chat-resumo" data-bloco="resumo">
          <div className="chat-resumo-titulo">Seu atendimento</div>
          <div className="chat-resumo-linha">
            <span>Paciente</span><strong data-campo="paciente-do-resumo">{p.nomeDoResumo || p.nome}</strong>
          </div>
          {/* ════════════════════════════════════════════════
              ⭐⭐⭐ O RESUMO DO EXAME NÃO É O DA CONSULTA
                                          (20/10/2026)

              O Tom, vendo o resumo de um ultrassom:
              *"o resumo dos exames precisa ser exame."*

              Estava mostrando **Especialidade** e **Profissional**
              em branco — os dois campos que exame não tem. Duas
              linhas vazias num resumo de confirmação é o lugar
              mais caro possível para parecer quebrado: é
              exatamente onde a pessoa decide se confia.

              ⭐ Exame tem EXAME e tem ONDE/COM QUEM. E quando o
                 pedido tem vários subtipos, eles aparecem TODOS
                 — é o que o paciente vai conferir.
              ════════════════════════════════════════════════ */}
          {p.modoExame ? (
            <>
              <div className="chat-resumo-linha">
                <span>{p.itensDoPedido.length > 1 ? 'Exames' : 'Exame'}</span>
                <strong>{p.exame?.nome}</strong>
              </div>
              {/* ⚠️ Só quando há SUBTIPOS. No exame sem subtipo o
                  "item do pedido" é o próprio exame, e a linha sem
                  título repetia "Holter" embaixo de "Holter"
                  (o Tom, 20/10). */}
              {!!p.exame?.tem_subtipos && p.itensDoPedido.length > 0 && (
                <div className="chat-resumo-linha chat-resumo-itens">
                  <span />
                  <strong>
                    {p.itensDoPedido.map(i => (
                      <em key={i.id} data-item-do-pedido={i.id}>{i.nome}</em>
                    ))}
                  </strong>
                </div>
              )}
              {/* ⭐⭐ 20/10, o Tom: "Onde deveria ser o SETOR".
                  O paciente procura o setor na recepção, e não o
                  aparelho — "Holter" como lugar não diz aonde ir.
                  Sem setor cadastrado, vale o aparelho, como antes. */}
              {(!!p.exame?.setor || !!p.executor?.eh_aparelho) && (
                <div className="chat-resumo-linha" data-linha="onde">
                  <span>Onde</span>
                  <strong>{p.exame?.setor || p.executor?.nome}</strong>
                </div>
              )}
              {/* Profissional só quando é GENTE. "Profissional:
                  Ultrassom 2" faz o paciente achar que o sistema
                  se confundiu. */}
              {!!p.executor && !p.executor.eh_aparelho && (
                <div className="chat-resumo-linha" data-linha="profissional">
                  <span>Profissional</span>
                  <strong>{p.executor.nome}</strong>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="chat-resumo-linha">
                <span>Especialidade</span>
                {/* ⭐ "Ortopedia · Coluna", e não só "Coluna". A
                    recepção lê o mesmo resumo, e "Coluna" sozinho
                    num card de agenda não diz de que área é. */}
                <strong>
                  {p.especialidadePai && p.especialidadePai.id !== p.especialidade?.id
                    ? `${p.especialidadePai.nome} · ${p.especialidade?.nome}`
                    : p.especialidade?.nome}
                </strong>
              </div>
              <div className="chat-resumo-linha">
                <span>Profissional</span><strong>{p.medico?.nome}</strong>
              </div>
            </>
          )}
          <div className="chat-resumo-linha">
            <span>Quando</span><strong>{quando}</strong>
          </div>
          {/* ⭐ 21/10: clínica sem convênio não mostra a linha. */}
          {p.atendeConvenios && (
            <div className="chat-resumo-linha" data-linha="convenio">
              <span>Convênio</span>
              <strong>{p.convenio?.nome ?? 'Particular'}</strong>
            </div>
          )}
        </div>

        <div className="chat-opcoes">
          <button className="chat-opcao forte"
                  data-acao="confirmar"
                  disabled={e === 'marcando'}
                  onClick={p.aoConfirmar}>
            {/* ⭐ O botão diz o que vai acontecer. Remarcando, ele
                   não pode dizer "Confirmar agendamento": o que
                   vai acontecer é a consulta MUDAR de dia, e a
                   antiga sair. Botão que mente sobre o próprio
                   efeito é a origem do "mas eu não pedi isso". */}
            {e === 'marcando'
              ? <><i className="fas fa-circle-notch fa-spin" />{' '}
                  {p.remarcando ? 'Remarcando…' : 'Marcando…'}</>
              : <><i className="fas fa-check" />{' '}
                  {p.remarcando ? 'Confirmar nova data' : 'Confirmar agendamento'}</>}
          </button>
        </div>
      </>
    );
  }

  return null;
}
