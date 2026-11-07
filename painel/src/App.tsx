import { MeuPerfil } from './MeuPerfil';
import { useSessao } from './useSessao';
import { Cirurgias } from './Cirurgias';
import { NovaCirurgia } from './NovaCirurgia';
import { Modulos, modulosLiberados } from './Modulos';
import { Avisos } from './Avisos';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  configDoCliente, minhasTelas, souDaPlataforma, meuAcesso, atendeConveniosDaConfig,
  modulosDoClienteDetalhe, minhaSenhaEProvisoria,
  type MeuAcesso, type ModuloDoCliente
} from './dados';
import { derivarMarca, sigla } from '../../nucleo/formato';
import { MENU, tituloDaPagina, familiaDoIcone, MODULOS_DO_APP, type GrupoDoApp } from './menu';
import { Entrar } from './Entrar';
import { Agendamentos } from './Agendamentos';
import { NovoAgendamento } from './NovoAgendamento';
import { AgendaDoMedico } from './AgendaDoMedico';
import { MeuDia } from './MeuDia';
import { Medicos } from './Medicos';
import { Especialidades } from './Especialidades';
import { Convenios } from './Convenios';
import { Prestadores } from './Prestadores';
import { PainelFaturamento } from './PainelFaturamento';
import { ContasFaturamento } from './ContasFaturamento';
import { TiposCirurgia } from './TiposCirurgia';
import { CustosCirurgia } from './CustosCirurgia';
import { AvisosCirurgia } from './AvisosCirurgia';
import { RelatoriosCirurgia } from './RelatoriosCirurgia';
import { FornecedoresOpme } from './FornecedoresOpme';
import { CalendarioCirurgico } from './CalendarioCirurgico';
import { Precos } from './Precos';
import { Exames } from './Exames';
import { Importar } from './Importar';
import { Usuarios } from './Usuarios';
import { AcessoMedicos } from './AcessoMedicos';
import { TrocarSenhaProvisoria } from './TrocarSenhaProvisoria';
import { Logs } from './Logs';
import { Clientes } from './Clientes';
import { Conversas } from './Conversas';
import { Mensagens } from './Mensagens';
import { Aparelhos } from './Aparelhos';
import { FilaDeSolicitacoes } from './FilaDeSolicitacoes';
import { Dashboard } from './Dashboard';

/**
 * ============================================================
 *  O PAINEL
 *
 *  Menu lateral, barra de cima e a página escolhida — a mesma
 *  estrutura do sistema de hoje.
 *
 *  ------------------------------------------------------------
 *  TRÊS ESTADOS, E SÓ TRÊS
 *
 *    1. ainda não sei se tem sessão  → "Carregando…"
 *    2. não tem sessão               → tela de entrar
 *    3. tem sessão                   → o painel
 *
 *  O primeiro existe porque a Supabase guarda a sessão no
 *  navegador e leva alguns milissegundos para ler. Sem ele, quem
 *  já estava logado vê a tela de login piscar antes do painel —
 *  e vai achar que foi deslogado.
 * ============================================================
 */

export function App() {
  /* ⭐ 29/10: a sessão e a pergunta da senha provisória moram no
     `useSessao` — UMA porta, usada também pela porta do médico.
     A cópia que estava aqui travava em "Carregando…" quando a aba
     voltava a ficar visível. */
  const { sessao, lendo: lendoSessao, provisoria, senhaTrocada } = useSessao();

  const [clientes, setClientes] = useState<MeuAcesso[]>([]);
  const [plataforma, setPlataforma] = useState(false);
  const [modulosDetalhe, setModulosDetalhe] = useState<ModuloDoCliente[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [modulos, setModulos] = useState<string[]>([]);
  const [telas, setTelas] = useState<string[]>([]);
  // ⚠️ "ainda não li" é diferente de "li e veio vazio". Sem esta
  //    terceira resposta, a troca de página abaixo rodaria com a
  //    lista de módulos vazia e jogaria todo mundo para a
  //    primeira tela que não pede módulo nenhum.
  const [acessoLido, setAcessoLido] = useState(false);
  const [erro, setErro] = useState('');

  /* ⭐⭐⭐ 31/10: O MÓDULO ESCOLHIDO NA TELA INICIAL.
     `null` = ainda não escolheu. ⚠️ Não é `'atendimento'` por
     padrão: "ainda não escolhi" e "escolhi Atendimento" são
     respostas diferentes, e confundi-las faria a tela inicial
     nunca aparecer. É a mesma lição do `acessoLido` acima. */
  const [grupo, setGrupo] = useState<GrupoDoApp | null>(null);

  const [pagina, setPagina] = useState('agendamentos');
  /* ⭐ 02/11: o convênio que a tela de Valores abre. Ele mora
     aqui, e não dentro de Precos, porque quem LEVA para lá é a
     tela de Convênios. */
  const [convenioDosValores, setConvenioDosValores] =
    useState<string | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);


  /* ⭐⭐⭐ 21/10: o cliente atende convênios? Sem a chave = sim. */
  const atendeConvenios = atendeConveniosDaConfig(config);

  /* ⭐⭐ O item do menu está liberado?
     Esta pergunta estava escrita em DOIS lugares deste arquivo,
     igual à mão: no menu e no "pular para a primeira tela livre".
     Acrescentar a regra do convênio numa cópia só faria o menu
     esconder a tela e o pulo continuar mandando para ela. Agora é
     uma função, usada pelos dois.
     ⚠️ "Sem permissão ligada" = ninguém restringiu as telas ainda
        (`telas` vazio): vê tudo, como sempre foi. */
  /** A seção pertence ao módulo escolhido? `sempre` passa sempre. */
  function secaoNoGrupo(s: (typeof MENU)[number]): boolean {
    if (s.sempre) return true;
    if (!grupo) return true;
    return (s.grupo ?? 'atendimento') === grupo;
  }

  function itemLiberado(i: (typeof MENU)[number]['itens'][number]): boolean {
    // A área institucional não passa por módulo nem por permissão
    // de papel: ela é do MedCalendar, e quem responde é o banco.
    if (i.plataforma) return plataforma;
    if (i.modulo && !modulos.includes(i.modulo)) return false;
    // Clínica sem convênio não tem tela de Convênios.
    if (i.pagina === 'convenios' && !atendeConvenios) return false;
    return !telas.length || telas.includes('*') || telas.includes(i.pagina);
  }


  // ---------- a quais clientes eu pertenço ----------
  useEffect(() => {
    if (!sessao) { setClientes([]); setClienteId(''); setPlataforma(false); return; }
    let valido = true;
    // ⭐ `meuAcesso` traz também o hospital SUSPENSO, com a
    //    bandeira. É o que permite dizer "suspenso" em vez de
    //    "você não está ligado a nenhum cliente" — ver dados.ts.
    Promise.all([meuAcesso(), souDaPlataforma()])
      .then(([l, p]) => {
        if (!valido) return;
        setClientes(l);
        setPlataforma(p);
        const noAr = l.filter(c => c.ativo);
        setClienteId(atual =>
          (atual && noAr.some(c => c.cliente_id === atual))
            ? atual
            : (noAr[0]?.cliente_id ?? ''));
      })
      .catch(e => valido && setErro(e.message ?? String(e)));
    return () => { valido = false; };
  }, [sessao]);

  /* ⭐ 21/10: a área de Clientes avisa quando muda uma chave do
     cliente (como "atende convênios") e o painel relê na hora. */
  const [releitura, setReleitura] = useState(0);
  const [perfilAberto, setPerfilAberto] = useState(false);
  const [avisoDoPerfil, setAvisoDoPerfil] = useState<{ m: string; ok: boolean } | null>(null);
  useEffect(() => {
    const ouvir = () => setReleitura(n => n + 1);
    window.addEventListener('medcalendar:config-mudou', ouvir);
    return () => window.removeEventListener('medcalendar:config-mudou', ouvir);
  }, []);

  /* ⭐ 21/10: uma tela pede para ir a outra (o "Agendar" da conversa). */
  useEffect(() => {
    const ir = (e: Event) => {
      const destino = (e as CustomEvent<string>).detail;
      if (typeof destino === 'string' && destino) setPagina(destino);
    };
    window.addEventListener('medcalendar:ir-para', ir);
    return () => window.removeEventListener('medcalendar:ir-para', ir);
  }, []);

  // ---------- a cara e os módulos do cliente ----------
  useEffect(() => {
    if (!clienteId) {
      setConfig({}); setModulos([]); setModulosDetalhe([]);
      setTelas([]); setAcessoLido(false); return;
    }
    let valido = true;
    setAcessoLido(false);
    // As três de uma vez: são independentes, então esperar uma
    // para começar a outra seria somar as esperas sem motivo.
    Promise.all([
      configDoCliente(clienteId), modulosDoClienteDetalhe(clienteId),
      minhasTelas(clienteId)
    ])
      .then(([c, m, t]) => {
        if (!valido) return;
        setConfig(c);
        setModulosDetalhe(m);
        // ⭐ O menu usa o que está NO AR. "Vencendo" ainda está
        //    no ar — avisar é uma coisa, cortar é outra, e
        //    cortar antes da hora seria cobrar sem entregar.
        setModulos(m.filter(x => x.situacao === 'ligado' || x.situacao === 'vencendo')
                    .map(x => x.modulo));
        setTelas(t);
        setAcessoLido(true);
      })
      .catch(() => {
        if (valido) {
          setConfig({}); setModulos([]); setModulosDetalhe([]);
          setTelas([]); setAcessoLido(true);
        }
      });
    return () => { valido = false; };
  }, [clienteId, releitura]);

  // ---------- a página que sumiu embaixo dos pés ----------
  //
  // ⚠️ Ao trocar de cliente, ou ao salvar uma permissão que tira
  //    a tela em que a pessoa está, `pagina` passa a apontar para
  //    um item que não existe mais no menu. Sem isto, o conteúdo
  //    some e sobra uma barra lateral sem nada ao lado — de novo
  //    a tela em branco que não dá erro.
  useEffect(() => {
    if (!clienteId || !acessoLido) return;
    const livres = MENU.filter(secaoNoGrupo).flatMap(s => s.itens).filter(itemLiberado);
    if (!livres.length || livres.some(i => i.pagina === pagina)) return;
    setPagina((livres.find(i => i.pronto) ?? livres[0]).pagina);
  }, [clienteId, acessoLido, modulos, telas, pagina, plataforma, atendeConvenios, grupo]);

  /* ⭐ MÓDULO ÚNICO NÃO PEDE ESCOLHA.
     Quem só tem Atendimento entra direto onde sempre entrou —
     ninguém merece um clique a mais para escolher entre uma
     opção. A tela inicial aparece a partir de dois. */
  useEffect(() => {
    if (!clienteId || !acessoLido || grupo) return;
    const livres = modulosLiberados(modulos, telas, plataforma);
    if (livres.length === 1) setGrupo(livres[0].grupo);
  }, [clienteId, acessoLido, modulos, telas, plataforma, grupo]);

  /* ⚠️ Trocar de hospital zera a escolha: o outro pode nem ter o
     módulo, e ficar num módulo que o hospital não contratou é a
     tela em branco que não dá erro. */
  useEffect(() => { setGrupo(null); }, [clienteId]);

  // ---------- a cor da marca ----------
  //
  // O cliente escolhe UMA cor em `clientes_config`. As outras
  // quatro da folha de estilo saem dela, por `derivarMarca`.
  // Trocar a cara de um hospital é trocar uma linha no banco.
  useEffect(() => {
    const cor = typeof config['marca.cor'] === 'string' ? config['marca.cor'] as string : '';
    const raiz = document.documentElement;
    if (!cor) {
      ['--primary', '--primary-light', '--primary-dark', '--primary-bg', '--primary-ghost']
        .forEach(v => raiz.style.removeProperty(v));
      return;
    }
    const m = derivarMarca(cor);
    raiz.style.setProperty('--primary', m.primary);
    raiz.style.setProperty('--primary-light', m.primaryLight);
    raiz.style.setProperty('--primary-dark', m.primaryDark);
    raiz.style.setProperty('--primary-bg', m.primaryBg);
    raiz.style.setProperty('--primary-ghost', m.primaryGhost);
  }, [config]);

  if (lendoSessao) {
    return (
      <div className="login-screen">
        <div className="login-box"><p>Carregando…</p></div>
      </div>
    );
  }

  if (!sessao) return <Entrar />;

  /* ════════════════════════════════════════════════════════════
   *  ⭐⭐⭐ A SENHA QUE O HOSPITAL DIGITOU NÃO ABRE O PAINEL
   *          DUAS VEZES                            (27/10/2026)
   *
   *  A mesma porta da `/medico`, e pelo mesmo motivo: a senha
   *  ditada por telefone fica escrita num WhatsApp e num papel
   *  na recepção. Um aviso amarelo no topo ninguém troca.
   *
   *  ⚠️ Está AQUI, depois do `!sessao` e antes de tudo o mais —
   *     inclusive antes de carregar clientes, telas e módulos.
   *     Uma trava que só aparece na terceira tela é uma trava
   *     que a segunda tela já contornou.
   * ════════════════════════════════════════════════════════════ */
  if (provisoria === null) {
    return (
      <div className="login-wrap">
        <div className="login-box"><p>Carregando…</p></div>
      </div>
    );
  }
  if (provisoria) {
    return (
      <TrocarSenhaProvisoria
        email={sessao.user?.email ?? ''}
        aoTrocar={senhaTrocada} />
    );
  }

  const cliente = clientes.find(c => c.cliente_id === clienteId);
  const suspensos = clientes.filter(c => !c.ativo);
  const noAr = clientes.filter(c => c.ativo);
  const nomeNaTela =
    (typeof config['marca.nome_exibicao'] === 'string' && config['marca.nome_exibicao'] as string)
    || cliente?.nome || 'MedCalendar';
  const logo = typeof config['marca.logo_url'] === 'string' ? config['marca.logo_url'] as string : '';

  // Um item de módulo não contratado não existe no menu — e não
  // existe porque a LISTA não o traz, não porque um `if` na tela
  // o esconde. Item escondido por `if` volta a aparecer no dia em
  // que alguém mexer no `if`.
  // ════════════════════════════════════════════════════════════
  //  ⭐⭐⭐ A PERMISSÃO NÃO PODE TRANCAR NINGUÉM EM SILÊNCIO
  //
  //  `minhas_telas` vazio pode ser duas coisas muito diferentes:
  //  "este papel não vê nada" ou "ninguém configurou isto ainda".
  //
  //  Se eu tratasse as duas igual, o dia em que alguém criasse
  //  um papel novo — ou em que a chamada falhasse — o painel
  //  abriria VAZIO, sem erro nenhum. É o pior defeito deste
  //  projeto, e já aconteceu: a Gestão de Exames ficou invisível
  //  por três dias porque um módulo estava desligado.
  //
  //  Então: lista vazia NÃO filtra, e DIZ que não está filtrando.
  //  Quem fecha a porta é uma lista preenchida, não uma ausência.
  // ════════════════════════════════════════════════════════════
  const permissaoLigada = telas.length > 0;
  const vejoTudo = telas.includes('*');

  const secoes = MENU
    .filter(secaoNoGrupo)
    .map(s => ({
      ...s,
      itens: s.itens.filter(itemLiberado)
    }))
    .filter(s => s.itens.length);

  const visiveis = secoes.flatMap(s => s.itens);
  const itemAtual = visiveis.find(i => i.pagina === pagina);

  /* ⭐ A TELA INICIAL. Vem antes do painel inteiro, e não dentro
     dele: o menu lateral já é do módulo escolhido, e desenhá-lo
     atrás da escolha mostraria um menu que não vale ainda. */
  if (clienteId && acessoLido && !grupo) {
    return (
      <Modulos
        clienteId={clienteId ?? ''}
        modulosDoCliente={modulos}
        telas={telas}
        plataforma={plataforma}
        nomeDoHospital={nomeNaTela}
        logo={logo}
        corDoHospital={typeof config['marca.cor'] === 'string' ? config['marca.cor'] as string : ''}
        sigla={sigla(nomeNaTela)}
        slug={cliente?.slug ?? ''}
        aoEscolher={(g, pagina) => {
          setGrupo(g);
          const m = MODULOS_DO_APP.find(x => x.grupo === g);
          /* ⭐ 06/11: o "Precisa de você hoje" leva direto à tela do item
             (a Tela inicial só manda a página se o papel tem essa tela). */
          if (m) setPagina(pagina ?? m.inicial);
        }}
      />
    );
  }

  return (
    <div className="admin-panel">

      <aside className={'sidebar' + (menuAberto ? ' open' : '')}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            {logo
              ? <img src={logo} alt="" />
              : <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{sigla(nomeNaTela)}</span>}
          </div>
          <div>
            <h2>{nomeNaTela}</h2>
            <small>MedCalendar</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          {secoes.map(s => (
            <div className="nav-section" key={s.titulo}>
              <span className="nav-section-title">{s.titulo}</span>
              {s.itens.map(i => (
                <a key={i.pagina}
                   className={'nav-item'
                     + (pagina === i.pagina ? ' active' : '')
                     + (i.pronto ? '' : ' porconstruir')}
                   onClick={() => { setPagina(i.pagina); setMenuAberto(false); }}>
                  <i className={`${familiaDoIcone(i.icone)} ${i.icone}`} />
                  <span>{i.rotulo}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {/* ⭐ Só aparece quando há mais de um módulo para trocar. */}
          {modulosLiberados(modulos, telas, plataforma).length > 1 && (
            <a onClick={() => { setGrupo(null); setMenuAberto(false); }}>
              <i className="fas fa-grip" /><span>Trocar de módulo</span>
            </a>
          )}
          <a onClick={() => supabase.auth.signOut()}>
            <i className="fas fa-sign-out-alt" /><span>Sair</span>
          </a>
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setMenuAberto(v => !v)}
                  aria-label="Menu">
            <i className="fas fa-bars" />
          </button>
          <h1>{tituloDaPagina(pagina)}</h1>

          {noAr.length > 1 && (
            <select className="input-select" value={clienteId}
                    onChange={e => setClienteId(e.target.value)}
                    aria-label="Escolher cliente">
              {noAr.map(c => (
                <option key={c.cliente_id} value={c.cliente_id}>
                  {c.nome}{c.demo ? ' (demonstração)' : ''}
                </option>
              ))}
            </select>
          )}

          {/* ⭐ 23/10: o e-mail no canto abre o Meu perfil. */}
          <button className="admin-badge" data-acao="meu-perfil" onClick={() => setPerfilAberto(true)}
                  title="Meu perfil: nome e senha">
            <i className="fas fa-user-shield" />{sessao.user.email}
          </button>
          {perfilAberto && (
            <MeuPerfil email={sessao.user.email ?? ''} nomeAtual={''}
                       aoFechar={() => setPerfilAberto(false)}
                       aoAvisar={(m, ok) => { setAvisoDoPerfil({ m, ok }); }} />
          )}
          {avisoDoPerfil && (
            <div className={'perfil-aviso ' + (avisoDoPerfil.ok ? 'ok' : 'erro')} data-aviso="perfil"
                 onClick={() => setAvisoDoPerfil(null)}>{avisoDoPerfil.m}</div>
          )}
        </header>

        <div className="page-content">
          {erro && <div className="ag-empty"><h3>{erro}</h3></div>}

          {/* ════════════════════════════════════════════════
              ⭐⭐⭐ "SUSPENSO" E "NUNCA TEVE" SÃO COISAS
              DIFERENTES

              Desde 11/10/2026 `clientes.ativo` corta o acesso de
              verdade, e o hospital suspenso some de tudo.

              Se as duas situações dessem a mesma tela, a
              recepção de um hospital suspenso leria "você não
              está ligado a nenhum cliente" com um comando SQL
              embaixo — e ligaria para o Tom dizendo que o
              sistema quebrou. O comando, ali, não resolve nada.
              ════════════════════════════════════════════════ */}
          {!erro && !noAr.length && !!suspensos.length && (
            <div className="porvir suspenso" data-aviso="cliente-suspenso">
              <i className="fas fa-circle-pause" />
              <h3>
                O acesso {suspensos.length === 1
                  ? `de ${suspensos[0].nome}` : 'dos seus hospitais'} está suspenso
              </h3>
              <p>
                Nada foi apagado. A agenda, os pacientes e os cadastros continuam
                inteiros e voltam no instante em que o acesso for reativado.
              </p>
              <p style={{ marginTop: 10 }}>
                Fale com o MedCalendar para reativar.
              </p>
              <span className="porvir-nome">{sessao.user.email}</span>
            </div>
          )}

          {!erro && !clientes.length && (
            <div className="porvir">
              <i className="fas fa-hospital" />
              <h3>Você ainda não está ligado a nenhum cliente</h3>
              <p>
                O banco não está escondendo nada por engano — está respondendo a
                verdade. Rode no SQL Editor do Supabase:
              </p>
              <span className="porvir-nome">
                select core.dar_acesso_total('{sessao.user.email}');
              </span>
            </div>
          )}

          {/* ════════════════════════════════════════════════
              ⚠️ MÓDULO QUE VENCE FAZ TELA SUMIR SEM ERRO

              Consertar a visão que ignorava `expira_em` criou um
              perigo com DATA MARCADA: no dia da validade, os
              itens do menu simplesmente desaparecem.

              É o mesmo defeito que deixou a Gestão de Exames
              invisível por três dias em 10/10 — só que agendado.
              Por isso o painel avisa 15 dias antes, e explica
              depois.
              ════════════════════════════════════════════════ */}
          {clienteId && modulosDetalhe.some(m => m.situacao === 'vencendo') && (
            <div className="dia-nota amarela" data-aviso="modulo-vencendo">
              <strong>
                {modulosDetalhe.filter(m => m.situacao === 'vencendo')
                  .map(m => `${m.modulo} vence em ${m.dias} dia(s)`).join(' · ')}.
              </strong>
              <p>
                Passada a data, as telas deste módulo somem do menu. Fale com o
                MedCalendar para renovar.
              </p>
            </div>
          )}

          {clienteId && modulosDetalhe.some(m => m.situacao === 'vencido') && (
            <div className="dia-nota vermelha" data-aviso="modulo-vencido">
              <strong>
                {modulosDetalhe.filter(m => m.situacao === 'vencido')
                  .map(m => m.modulo).join(', ')}
                {' '}venceu.
              </strong>
              <p>
                As telas deste módulo saíram do menu. Nada foi apagado — o que
                estava marcado continua no banco e volta a aparecer assim que o
                módulo for renovado.
              </p>
            </div>
          )}

          {clienteId && itemAtual?.pronto && pagina === 'dashboard' && (
            <Dashboard clienteId={clienteId} atendeConvenios={atendeConvenios} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'agendamentos' && (
            <Agendamentos clienteId={clienteId} nomeDoHospital={nomeNaTela} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'novoagendamento' && (
            <NovoAgendamento clienteId={clienteId} atendeConvenios={atendeConvenios} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'calendario' && (
            <AgendaDoMedico clienteId={clienteId} />
          )}

          {/* ⭐ 26/10: o consultório do médico. */}
          {clienteId && itemAtual?.pronto && pagina === 'meu-dia' && (
            <MeuDia clienteId={clienteId} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'medicos' && (
            <Medicos clienteId={clienteId} atendeConvenios={atendeConvenios} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'especialidades' && (
            <Especialidades clienteId={clienteId} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'importar' && (
            <Importar clienteId={clienteId} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'tiposcirurgia' && (
            <TiposCirurgia clienteId={clienteId} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'fornecedoresopme' && (
            <FornecedoresOpme clienteId={clienteId} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'calendariocirurgico' && (
            <CalendarioCirurgico clienteId={clienteId}
              corDoHospital={typeof config['marca.cor'] === 'string' ? config['marca.cor'] as string : ''} />
          )}

          {/* ⭐ 05/11: os cadastros da viabilidade (074) — da diretoria. */}
          {clienteId && itemAtual?.pronto && pagina === 'custoscirurgia' && (
            <CustosCirurgia clienteId={clienteId} />
          )}

          {/* ⭐ 05/11: os avisos por setor (075). */}
          {clienteId && itemAtual?.pronto && pagina === 'avisoscirurgia' && (
            <AvisosCirurgia clienteId={clienteId} />
          )}

          {/* ⭐ 05/11: os relatórios de cirurgia (077) — da diretoria. */}
          {clienteId && itemAtual?.pronto && pagina === 'relatorioscirurgia' && (
            <RelatoriosCirurgia clienteId={clienteId} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'contas' && (
            <ContasFaturamento clienteId={clienteId} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'painelfat' && (
            <PainelFaturamento clienteId={clienteId}
              aoIrPara={p => {
                /* ⭐ "Resolver" leva para a tela que resolve. Um
                   painel que só CONTA pendência é relatório;
                   painel é o que leva até o conserto. */
                if (p === 'precos') setConvenioDosValores(null);
                setPagina(p);
              }} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'convenios' && (
            <Convenios clienteId={clienteId}
              aoAbrirValores={id => {
                setConvenioDosValores(id);
                setPagina('precos');
              }} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'prestadores' && (
            <Prestadores clienteId={clienteId} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'precos' && (
            <Precos clienteId={clienteId} convenioInicial={convenioDosValores} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'avisos' && (
            <Avisos clienteId={clienteId} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'exames' && (
            <Exames clienteId={clienteId} atendeConvenios={atendeConvenios} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'aparelhos' && (
            <Aparelhos clienteId={clienteId} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'cirurgias' && (
            <Cirurgias clienteId={clienteId} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'novacirurgia' && (
            <NovaCirurgia clienteId={clienteId} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'filaexames' && (
            <FilaDeSolicitacoes clienteId={clienteId} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'usuarios' && (
            <Usuarios clienteId={clienteId} souOperador={vejoTudo} />
          )}

          {/* ⭐ 26/10: quem entra pela porta do médico. */}
          {clienteId && itemAtual?.pronto && pagina === 'acessomedicos' && (
            <AcessoMedicos clienteId={clienteId} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'logs' && (
            <Logs clienteId={clienteId} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'conversas' && (
            <Conversas clienteId={clienteId} />
          )}

          {clienteId && itemAtual?.pronto && pagina === 'mensagens' && (
            <Mensagens clienteId={clienteId} nomeDoHospital={nomeNaTela} />
          )}

          {itemAtual?.pronto && pagina === 'clientes' && plataforma && (
            <Clientes />
          )}

          {clienteId && itemAtual && !itemAtual.pronto && (
            <div className="porvir">
              <i className={`${familiaDoIcone(itemAtual.icone)} ${itemAtual.icone}`} />
              <h3>{itemAtual.rotulo}</h3>
              <p>
                Esta tela ainda não foi construída nesta versão. Ela está no mapa
                e vem pela ordem — recepção primeiro, depois exames, depois o que
                o sistema faz sozinho.
              </p>
              <p style={{ marginTop: 10 }}>
                O menu mostra tudo que vai existir, de propósito. Esconder o que
                falta faria o sistema parecer pronto.
              </p>
              <span className="porvir-nome">por construir</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
