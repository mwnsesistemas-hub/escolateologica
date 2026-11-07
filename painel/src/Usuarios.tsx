import { useEffect, useMemo, useState } from 'react';
import {
  usuariosDoCliente, papeisDoCliente, salvarUsuario, salvarPapel,
  acoesDoSistema, setoresDoCliente, salvarSetor, salvarSetoresDoUsuario,
  salvarQuemAtendeOSetor, excluirSetor, criarUsuario,
  quemRespondeWhatsapp, definirRespondeWhatsapp, redefinirSenha,
  type UsuarioDoCliente, type PapelDoCliente, type AcaoDoSistema,
  type SetorDoCliente
} from './dados';
import { TELAS_DO_SISTEMA, familiaDoIcone } from './menu';
import { Aviso, useAviso } from './Aviso';

/**
 * ============================================================
 *  USUÁRIOS E PERMISSÃO POR TELA
 *
 *  10/10/2026, o Tom: *"queria revolucionar as funções usuários,
 *  com permissões ou bloqueios de todas as telas dos módulos."*
 *
 *  ------------------------------------------------------------
 *  ⭐ PAPEL DÁ, PESSOA AJUSTA
 *
 *  O papel diz as telas. A pessoa herda do papel, e pode ganhar
 *  uma tela a mais ou perder uma.
 *
 *  Sem isso, "a Fulana também mexe em convênio" obrigaria a
 *  inventar um papel chamado "Recepção 2" — e no ano que vem o
 *  hospital teria onze papéis, nenhum deles com nome que diga
 *  o que faz.
 *
 *  Com isso, cadastrar a décima recepcionista continua sendo um
 *  clique.
 *
 *  ------------------------------------------------------------
 *  ⚠️ TIRAR GANHA DE DAR
 *
 *  Se a mesma tela estiver no "a mais" e no "tirada", a resposta
 *  é NÃO. Empate numa decisão de acesso cai para o lado de
 *  negar — é o único lado em que errar não vira vazamento.
 *
 *  Quem decide isso é o BANCO (`minhas_telas`), não esta tela.
 *  Esta aqui só mostra o mesmo resultado, para o clique não
 *  mentir sobre o que vai acontecer.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ A LISTA DE TELAS SAI DO MENU
 *
 *  `TELAS_DO_SISTEMA` é derivada do `MENU`. Uma tela nova entra
 *  aqui no mesmo dia em que entra na barra lateral.
 *
 *  Uma segunda lista escrita à mão envelheceria calada: a tela
 *  nova apareceria para todo mundo, sem ninguém ter decidido
 *  isso — e o defeito seria invisível, porque excesso de acesso
 *  não dá erro.
 * ============================================================
 */

/** O estado de uma tela para uma pessoa. */
type Estado = 'do-papel' | 'a-mais' | 'tirada' | 'nao';

function estadoDaTela(
  tela: string, doPapel: string[], mais: string[], menos: string[]
): Estado {
  if (menos.includes(tela)) return 'tirada';
  if (doPapel.includes(tela)) return 'do-papel';
  if (mais.includes(tela)) return 'a-mais';
  return 'nao';
}

const ROTULO_DO_ESTADO: Record<Estado, string> = {
  'do-papel': 'vem do papel',
  'a-mais':   'dada só a esta pessoa',
  'tirada':   'tirada desta pessoa',
  'nao':      'não vê'
};

/** Uma senha provisória legível: sem 0/O nem 1/l, que viram
    "a senha não funciona" ao ser ditada pelo telefone. */
function senhaSugerida(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const n = new Uint32Array(10);
  crypto.getRandomValues(n);
  return Array.from(n, x => letras[x % letras.length]).join('');
}

export function Usuarios(
  { clienteId, souOperador = false }:
  { clienteId: string; souOperador?: boolean }
) {
  const { recado, avisar, fechar } = useAviso();

  const [aba, setAba] = useState<'pessoas' | 'papeis' | 'setores'>('pessoas');
  const [pessoas, setPessoas] = useState<UsuarioDoCliente[]>([]);
  const [papeis, setPapeis] = useState<PapelDoCliente[]>([]);
  const [acoes, setAcoes] = useState<AcaoDoSistema[]>([]);
  /* ⭐ 20/10: os setores. O Tom: *"isso são setores dentro do
     painel, onde usuários recebem as mensagens do seu setor."* */
  const [setores, setSetores] = useState<SetorDoCliente[]>([]);
  const [setorEditando, setSetorEditando] = useState<SetorDoCliente | null>(null);
  const [setorAberto, setSetorAberto] = useState(false);
  const [sNome, setSNome] = useState('');
  const [sDesc, setSDesc] = useState('');
  const [sIcone, setSIcone] = useState('');
  const [sOrdem, setSOrdem] = useState(50);
  const [sAtivo, setSAtivo] = useState(true);
  const [sWhats, setSWhats] = useState(false);
  /** Quem atende o setor aberto no formulário. */
  const [sQuem, setSQuem] = useState<string[]>([]);
  /* ⚠️ Excluir é a única ação desta tela que não dá para
     desfazer. Ela pede confirmação — e a confirmação é um
     FATO com variável, não um `window.confirm`, que o
     navegador desenha do jeito dele e a prova de tela não
     consegue clicar. */
  const [setorApagando, setSetorApagando] = useState<SetorDoCliente | null>(null);
  /** Os setores marcados no formulário da PESSOA. */
  const [fSetores, setFSetores] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [recarga, setRecarga] = useState(0);

  /* ⭐⭐⭐ 20/10, noite — o Tom: "usuários não tem botão novo
     usuário". A senha provisória vem SUGERIDA, e aparece de novo
     depois de criar: é a única vez que alguém a vê, e quem cria
     é quem entrega para a pessoa. */
  const [novoAberto, setNovoAberto] = useState(false);
  const [nNome, setNNome] = useState('');
  const [nEmail, setNEmail] = useState('');
  const [nPapel, setNPapel] = useState('');
  const [nSenha, setNSenha] = useState('');
  const [criado, setCriado] = useState<{ email: string; senha: string; jaExistia: boolean } | null>(null);
  const [indo, setIndo] = useState(false);

  // ---- o formulário da pessoa ----
  const [editando, setEditando] = useState<UsuarioDoCliente | null>(null);
  /* ⭐⭐⭐ 21/10: quem responde pelo WhatsApp oficial. Privilégio
     INDIVIDUAL — nenhum papel dá. Vem de uma lista à parte, e a
     ficha só grava quando a marca MUDOU. */
  const [respondem, setRespondem] = useState<Set<string>>(new Set());
  const [fResponde, setFResponde] = useState(false);
  /* ⭐ 23/10 — "é um tal de recepcionista esquecer senha". Duas
     etapas; a senha provisória aparece UMA vez, para entregar. */
  const [redefinindo, setRedefinindo] = useState(false);
  const [senhaDada, setSenhaDada] = useState('');
  useEffect(() => {
    let valido = true;
    quemRespondeWhatsapp(clienteId).then(x => { if (valido) setRespondem(x); });
    return () => { valido = false; };
  }, [clienteId, recarga]);
  const [fNome, setFNome] = useState('');
  const [fPapel, setFPapel] = useState('');
  const [fAtivo, setFAtivo] = useState(true);
  const [fMais, setFMais] = useState<string[]>([]);
  const [fMenos, setFMenos] = useState<string[]>([]);

  // ---- o formulário do papel ----
  const [papelEditando, setPapelEditando] = useState<PapelDoCliente | null>(null);
  const [pNome, setPNome] = useState('');
  const [pTelas, setPTelas] = useState<string[]>([]);
  const [pPerms, setPPerms] = useState<string[]>([]);

  useEffect(() => {
    let valido = true;
    setCarregando(true);
    Promise.all([usuariosDoCliente(clienteId), papeisDoCliente(clienteId),
                 acoesDoSistema(), setoresDoCliente(clienteId)])
      .then(([u, p, a, st]) => {
        if (!valido) return;
        setPessoas(u); setPapeis(p); setAcoes(a); setSetores(st);
        setCarregando(false);
      })
      .catch(e => {
        if (valido) { setErro((e as Error).message ?? String(e)); setCarregando(false); }
      });
    return () => { valido = false; };
  }, [clienteId, recarga]);

  /** As telas do papel que está escolhido no formulário. */
  const telasDoPapelEscolhido = useMemo(
    () => papeis.find(p => p.papel === fPapel)?.telas ?? [],
    [papeis, fPapel]);

  /* ════════════════════════════════════════════════════════
     ⭐ 20/10: OS SETORES DA PESSOA ABERTA

     A verdade de "quem está em qual setor" mora numa só
     resposta do banco — `setores_do_cliente().quem`. O
     formulário lê dela ao abrir e compara com ela ao salvar.

     Guardar isso numa segunda lista dentro da pessoa seria o
     defeito de sempre: duas respostas para a mesma pergunta,
     discordando em silêncio no dia em que uma fosse recarregada
     e a outra não.
     ════════════════════════════════════════════════════════ */
  const setoresGravados = useMemo(
    () => !editando ? [] : setores
      .filter(st => st.quem?.includes(editando.usuario_id))
      .map(st => st.id),
    [setores, editando]);

  const mudouOsSetores = useMemo(
    () => [...setoresGravados].sort().join(',') !== [...fSetores].sort().join(','),
    [setoresGravados, fSetores]);

  /** O que o formulário mostra: os ativos, mais os desativados
      em que esta pessoa ainda está marcada — senão a marca
      ficaria invisível e sumiria no próximo "Salvar". */
  const setoresDoFormulario = useMemo(
    () => setores.filter(st => st.ativo || fSetores.includes(st.id)),
    [setores, fSetores]);

  /** Nenhum papel tem tela: a permissão ainda não vale para ninguém. */
  const nenhumPapelTemTela = useMemo(
    () => !!papeis.length && papeis.every(p => !p.telas?.length),
    [papeis]);

  const porSecao = useMemo(() => {
    const m = new Map<string, typeof TELAS_DO_SISTEMA>();
    for (const t of TELAS_DO_SISTEMA) m.set(t.secao, [...(m.get(t.secao) ?? []), t]);
    return [...m.entries()];
  }, []);

  function abrirPessoa(u: UsuarioDoCliente) {
    setEditando(u);
    setFNome(u.nome ?? '');
    setFPapel(u.papel);
    setFAtivo(u.ativo);
    setFMais(u.telas_mais ?? []);
    setFMenos(u.telas_menos ?? []);
    setFResponde(respondem.has(u.usuario_id));
    setRedefinindo(false); setSenhaDada('');
    /* ⭐ 20/10: as marcas vêm da LISTA DE SETORES, não de um
       campo da pessoa. É a mesma lista que a aba Setores já
       carregou, e por isso o formulário abre sem nenhuma ida a
       mais ao banco — e sem uma segunda verdade sobre quem está
       em qual setor. */
    setFSetores(setores.filter(st => st.quem.includes(u.usuario_id))
                       .map(st => st.id));
  }

  /**
   * ⭐ UM CLIQUE SÓ, E ELE SEMPRE FAZ O ÓBVIO: liga o que está
   *    desligado e desliga o que está ligado.
   *
   *    As duas listas (`a mais` / `tirada`) são o COMO, e são
   *    detalhe do banco. Pedir que alguém escolha em qual das
   *    duas mexer seria exigir que ele soubesse de onde vem o
   *    acesso antes de poder mudá-lo.
   */
  function alternarTela(tela: string) {
    const est = estadoDaTela(tela, telasDoPapelEscolhido, fMais, fMenos);
    const ligada = est === 'do-papel' || est === 'a-mais';
    const vemDoPapel = telasDoPapelEscolhido.includes(tela);

    if (ligada) {
      // desligar: tira do "a mais" e, se ainda vier do papel, põe no "tirada"
      setFMais(l => l.filter(t => t !== tela));
      if (vemDoPapel) setFMenos(l => l.includes(tela) ? l : [...l, tela]);
    } else {
      // ligar: tira do "tirada"; se não vier do papel, põe no "a mais"
      setFMenos(l => l.filter(t => t !== tela));
      if (!vemDoPapel) setFMais(l => l.includes(tela) ? l : [...l, tela]);
    }
  }

  function alternarSetor(id: string) {
    setFSetores(l => l.includes(id) ? l.filter(x => x !== id) : [...l, id]);
  }

  /** O que trava o "Criar acesso", com a frase de cada trava. */
  function erroDoNovo(): string {
    if (nNome.trim().length < 3) return 'O nome precisa de pelo menos 3 letras.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nEmail.trim())) return 'Confira o e-mail.';
    if (!nPapel) return 'Escolha um papel.';
    if (nSenha.length < 8) return 'A senha provisória precisa de pelo menos 8 caracteres.';
    return '';
  }

  async function criarONovo() {
    setIndo(true);
    try {
      const r = await criarUsuario({
        clienteId, nome: nNome.trim(), email: nEmail.trim().toLowerCase(),
        papel: nPapel, senha: nSenha
      });
      if (!r.ok) { avisar(r.mensagem, false); setIndo(false); return; }
      setCriado({ email: nEmail.trim().toLowerCase(), senha: nSenha, jaExistia: !!r.ja_existia });
      setRecarga(n => n + 1);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    }
    setIndo(false);
  }

  async function salvarPessoa() {
    if (!editando || indo) return;
    setIndo(true);
    try {
      const r = await salvarUsuario({
        clienteId, usuarioId: editando.usuario_id,
        papel: fPapel, ativo: fAtivo,
        telasMais: fMais, telasMenos: fMenos,
        nome: fNome.trim() || null
      });

      if (!r.ok) { avisar(r.mensagem, false); return; }

      /* ⭐ 20/10: os setores são de outra função, e de outra
         tabela. Só chama quando mudou — senão todo "Salvar
         permissões" escreveria no vínculo sem ninguém ter
         mexido em setor nenhum.

         ⚠️ E se ESTA falhar, a frase que aparece é a DELA. As
            telas já foram salvas; dizer "Salvo" por cima de uma
            recusa seria a tela mentindo sobre o que aconteceu. */
      if (mudouOsSetores) {
        const s = await salvarSetoresDoUsuario(
          clienteId, editando.usuario_id, fSetores);
        if (!s.ok) { avisar(s.mensagem, false); setRecarga(n => n + 1); return; }
      }

      // ⭐ 21/10: o privilégio individual, só se mudou.
      if (fResponde !== respondem.has(editando.usuario_id)) {
        const w = await definirRespondeWhatsapp(clienteId, editando.usuario_id, fResponde);
        if (!w.ok) { avisar(w.mensagem, false); setRecarga(n => n + 1); return; }
      }

      avisar(r.mensagem, true);
      setEditando(null); setRecarga(n => n + 1);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(false);
    }
  }

  function abrirPapel(p: PapelDoCliente) {
    setPapelEditando(p);
    setPNome(p.nome);
    setPTelas(p.telas ?? []);
    setPPerms(p.permissoes ?? []);
  }

  /** ⭐ 20/10: gravar um setor. */
  async function salvarOSetor() {
    if (indo) return;
    setIndo(true);
    try {
      const r = await salvarSetor({
        clienteId, id: setorEditando?.id ?? null,
        nome: sNome.trim(), descricao: sDesc.trim(), icone: sIcone.trim(),
        ordem: sOrdem, ativo: sAtivo, noWhatsapp: sWhats
      });
      if (!r.ok) { avisar(r.mensagem, false); return; }

      /* ⭐ O setor e quem o atende são gravados no mesmo
         "Salvar". Criar um setor e ter que ir a outra aba
         dizer quem responde é como se cria setor vazio — e
         setor vazio é recado que ninguém lê. */
      if (r.id) {
        const q = await salvarQuemAtendeOSetor(clienteId, r.id, sQuem);
        if (!q.ok) { avisar(q.mensagem, false); setRecarga(n => n + 1); return; }
      }

      avisar(r.mensagem, true);
      setSetorAberto(false); setSetorEditando(null); setSNome('');
      setRecarga(n => n + 1);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(false);
    }
  }

  /** ⭐⭐⭐ 20/10: excluir de verdade. */
  async function excluirOSetor() {
    if (!setorApagando || indo) return;
    setIndo(true);
    try {
      const r = await excluirSetor(clienteId, setorApagando.id);
      avisar(r.mensagem, r.ok);
      if (r.ok) {
        setSetorApagando(null); setSetorAberto(false); setSetorEditando(null);
        setRecarga(n => n + 1);
      }
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(false);
    }
  }

  async function salvarOPapel() {
    if (!papelEditando || indo) return;
    setIndo(true);
    try {
      const r = await salvarPapel({
        clienteId, papel: papelEditando.papel,
        nome: pNome.trim() || null, telas: pTelas, permissoes: pPerms
      });
      avisar(r.mensagem, r.ok);
      if (r.ok) { setPapelEditando(null); setRecarga(n => n + 1); }
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(false);
    }
  }

  if (erro) return <div className="erro-caixa">{erro}</div>;

  const ativas = pessoas.filter(p => p.ativo).length;

  return (
    <>
      <div className="cad-topo">
        <div>
          <h2>Usuários e permissões</h2>
          <p>
            Quem entra no painel, e quais telas cada um enxerga.
            {' '}{ativas} {ativas === 1 ? 'pessoa ativa' : 'pessoas ativas'} de
            {' '}{pessoas.length}.
          </p>
        </div>
        <div className="ag-tipo-switch" data-bloco="abas">
          <button className={aba === 'pessoas' ? 'ativo' : ''} data-aba="pessoas"
                  onClick={() => setAba('pessoas')}>
            <i className="fas fa-users" /> Pessoas
          </button>
          <button className={aba === 'papeis' ? 'ativo' : ''} data-aba="papeis"
                  onClick={() => setAba('papeis')}>
            <i className="fas fa-id-badge" /> Papéis
          </button>
          <button className={aba === 'setores' ? 'ativo' : ''} data-aba="setores"
                  onClick={() => setAba('setores')}>
            <i className="fas fa-inbox" /> Setores
          </button>
        </div>
      </div>

      {/* ⚠️ Papel sem tela nenhuma não tranca ninguém: o menu
          mostra tudo. É de propósito — tela escondida não dá
          erro, e trancar alguém em silêncio é o pior defeito
          deste projeto. Mas tem que estar DITO, senão quem
          marcar três telas não vê diferença e conclui que a
          permissão não funciona. */}
      {!carregando && nenhumPapelTemTela && (
        <div className="dia-nota amarela" data-aviso="permissao-desligada">
          <strong>Ninguém está sendo limitado ainda.</strong>
          <p>
            Nenhum papel tem tela marcada, e enquanto estiver assim o menu mostra
            tudo para todo mundo. Marque as telas de um papel abaixo e ele passa
            a valer na hora.
          </p>
        </div>
      )}

      {/* ⭐ Quem é operador da plataforma vê tudo por outro
          caminho. Sem este aviso, o Tom marcaria três telas para
          si mesmo, não veria nada mudar, e concluiria que a tela
          está quebrada. */}
      {souOperador && (
        <div className="cad-nota" data-aviso="sou-operador">
          <i className="fas fa-user-shield" />
          <div>
            <strong>Você enxerga tudo porque é operador da plataforma.</strong>
            <p>
              O que você marcar aqui vale para as <strong>outras</strong>{' '}
              pessoas. O seu próprio menu não muda — é assim que dá para
              consertar quando alguém se tranca para fora.
            </p>
          </div>
        </div>
      )}

      <div className="cad-nota">
        <i className="fas fa-key" />
        <div>
          <strong>O papel dá as telas. A pessoa ajusta.</strong>
          <p>
            Mexa no <strong>papel</strong> quando a mudança vale para todo mundo
            que faz aquele trabalho — e nas telas <strong>da pessoa</strong>{' '}
            quando é exceção de uma pessoa só.
          </p>
          <p>
            Tirar ganha de dar: se uma tela estiver nas duas listas, a resposta é
            não.
          </p>
        </div>
      </div>

      {carregando && (
        <div className="loading-placeholder"><div className="spinner" /><p>Carregando…</p></div>
      )}

      {aba === 'pessoas' && !carregando && (
        <div className="cad-topo-acoes">
          <button className="btn-primary" data-acao="novo-usuario"
                  onClick={() => {
                    setNNome(''); setNEmail(''); setNSenha(senhaSugerida());
                    setNPapel(papeis.find(p => p.papel === 'recepcao')?.papel ?? papeis[0]?.papel ?? '');
                    setCriado(null); setNovoAberto(true);
                  }}>
            <i className="fas fa-user-plus" /> Novo usuário
          </button>
        </div>
      )}

      {/* ──────────────── PESSOAS ──────────────── */}
      {!carregando && aba === 'pessoas' && !pessoas.length && (
        <div className="porvir">
          <i className="fas fa-users" />
          <h3>Nenhuma pessoa com acesso a este hospital</h3>
          <p>
            Clique em <strong>Novo usuário</strong> para dar acesso à primeira pessoa
            deste hospital.
          </p>
        </div>
      )}

      {!carregando && aba === 'pessoas' && pessoas.map(u => (
        <div key={u.usuario_id}
             className={'cad-linha' + (u.ativo ? '' : ' inativo')}
             data-usuario={u.usuario_id}>
          <span className="cad-nome">
            {u.nome || u.email}
            {u.nome && <small style={{ display: 'block', opacity: .7 }}>{u.email}</small>}
          </span>
          <span className="cad-tags">
            {!u.ativo && <em className="cad-tag off">sem acesso</em>}
            <em className="cad-tag" data-tag="papel">{u.papel_nome ?? u.papel}</em>
            <em className="cad-tag sub" data-tag="telas">
              {u.quantas_telas} {u.quantas_telas === 1 ? 'tela' : 'telas'}
            </em>
            {!!u.telas_mais?.length && (
              <em className="cad-tag" data-tag="mais">+{u.telas_mais.length}</em>
            )}
            {!!u.telas_menos?.length && (
              <em className="cad-tag off" data-tag="menos">−{u.telas_menos.length}</em>
            )}
            {/* ⭐ 20/10: dá para ver quem atende setor sem abrir
                a ficha de cada um. */}
            {(() => {
              const n = setores.filter(st => st.quem?.includes(u.usuario_id)).length;
              return n === 0 ? null : (
                <em className="cad-tag sub" data-tag="setores-da-pessoa">
                  {n} {n === 1 ? 'setor' : 'setores'}
                </em>
              );
            })()}
          </span>
          <div className="cad-botoes">
            <button className="btn-secondary btn-sm" data-acao="editar-usuario"
                    onClick={() => abrirPessoa(u)}>
              <i className="fas fa-pen" /> Permissões
            </button>
          </div>
        </div>
      ))}

      {/* ──────────────── PAPÉIS ──────────────── */}
      {/* ════════════════════════════════════════════════════
          ⭐⭐⭐ OS SETORES   (20/10/2026)

          O Tom, mostrando a tela do sistema antigo:
          *"isso são setores dentro do painel, onde usuários
           recebem as mensagens do seu setor."*

          Até ontem essa lista eram cinco palavras escritas num
          arquivo de código. Agora é cadastro — e isso muda três
          coisas: cada hospital tem os seus, o recado cai na
          fila de quem responde aquilo, e o Tom muda sem mim.

          ⚠️ Setor NÃO se apaga. Protocolo antigo aponta para
             ele, e apagar deixaria recado órfão. Desativar
             basta — é a regra da casa desde o primeiro dia.
          ════════════════════════════════════════════════════ */}
      {!carregando && aba === 'setores' && (
        <>
          <div className="dia-nota" data-nota="setores">
            <strong>O setor decide quem lê o recado.</strong>
            <p>
              O paciente escolhe um setor no chat. O recado entra na fila
              daquele setor, e quem o recebe são as pessoas marcadas nele —
              na aba <strong>Pessoas</strong>, no formulário de cada uma.
            </p>
            <p>
              Um setor pode <strong>responder pelo WhatsApp</strong>: aí o
              chat não abre recado nenhum, só manda a pessoa chamar por lá.
            </p>
          </div>

          <div className="cad-topo-acao">
            <button className="btn-primary" data-acao="novo-setor"
                    onClick={() => {
                      setSetorEditando(null); setSetorAberto(true);
                      setSNome(''); setSDesc(''); setSIcone('💬');
                      setSOrdem(50); setSAtivo(true); setSWhats(false);
                      setSQuem([]);
                    }}>
              <i className="fas fa-plus" /> Novo setor
            </button>
          </div>

          {setores.map(st => (
            <div key={st.id} className="cad-linha" data-setor={st.id}>
              <span className="cad-icone" aria-hidden="true">{st.icone ?? '💬'}</span>
              <span className="cad-nome">
                {st.nome}
                {!!st.descricao && <small>{st.descricao}</small>}
              </span>
              <span className="cad-tags">
                {st.no_whatsapp && (
                  <em className="cad-tag sub" data-tag="whatsapp">
                    responde no WhatsApp
                  </em>
                )}
                <em className="cad-tag" data-tag="pessoas-do-setor">
                  {st.pessoas} {st.pessoas === 1 ? 'pessoa' : 'pessoas'}
                </em>
                {st.abertos > 0 && (
                  <em className="cad-tag forte" data-tag="abertos">
                    {st.abertos} em aberto
                  </em>
                )}
                {!st.ativo && (
                  <em className="cad-tag apagada" data-tag="desativado">desativado</em>
                )}
              </span>
              {/* ⚠️ Dentro de `.cad-botoes`, como nas outras listas:
                  é essa classe que empurra o botão para a direita.
                  Solto, ele ficava colado nas etiquetas. */}
              <div className="cad-botoes">
                <button className="btn-secondary btn-sm" data-acao="editar-setor"
                        onClick={() => {
                          setSetorEditando(st); setSetorAberto(true);
                          setSNome(st.nome); setSDesc(st.descricao ?? '');
                          setSIcone(st.icone ?? '💬'); setSOrdem(st.ordem);
                          setSAtivo(st.ativo); setSWhats(st.no_whatsapp);
                          setSQuem(st.quem ?? []);
                        }}>
                  <i className="fas fa-pen" /> Editar
                </button>
              </div>
            </div>
          ))}

          {/* ⭐ Setor sem ninguém marcado é recado que ninguém lê.
              A tela avisa, porque isso não dá erro em lugar nenhum. */}
          {setores.some(st => st.ativo && !st.no_whatsapp && st.pessoas === 0) && (
            <div className="dia-nota amarela" data-aviso="setor-sem-ninguem">
              <strong>Há setor ativo sem ninguém marcado.</strong>
              <p>
                O recado entra na fila e ninguém é avisado dele. Marque ao
                menos uma pessoa na aba <strong>Pessoas</strong>, ou desative
                o setor.
              </p>
            </div>
          )}
        </>
      )}

      {!carregando && aba === 'papeis' && papeis.map(p => (
        <div key={p.papel} className="cad-linha" data-papel={p.papel}>
          <span className="cad-nome">{p.nome}</span>
          <span className="cad-tags">
            <em className="cad-tag sub" data-tag="telas-do-papel">
              {p.telas?.length ?? 0} {p.telas?.length === 1 ? 'tela' : 'telas'}
            </em>
            <em className="cad-tag" data-tag="pessoas">
              {p.quantas_pessoas} {p.quantas_pessoas === 1 ? 'pessoa' : 'pessoas'}
            </em>
            {!p.telas?.length && (
              <em className="cad-tag off" data-aviso="papel-sem-tela">
                não vê nada
              </em>
            )}
          </span>
          <div className="cad-botoes">
            <button className="btn-secondary btn-sm" data-acao="editar-papel"
                    onClick={() => abrirPapel(p)}>
              <i className="fas fa-pen" /> Telas
            </button>
          </div>
        </div>
      ))}

      {/* ──────────────── o modal da pessoa ──────────────── */}
      {editando && (
        <div className="modal" data-modal="usuario">
          <div className="modal-overlay" onClick={() => setEditando(null)} />
          <div className="modal-content" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <h3>{editando.nome || editando.email}</h3>
              <button onClick={() => setEditando(null)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="modal-body">
              <div className="cad-dupla">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Nome</label>
                  <input type="text" value={fNome} data-campo="nome-usuario"
                         onChange={e => setFNome(e.target.value)}
                         placeholder={editando.email} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Papel</label>
                  <select value={fPapel} data-campo="papel"
                          onChange={e => setFPapel(e.target.value)}>
                    {papeis.map(p => (
                      <option key={p.papel} value={p.papel}>{p.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="cad-escolha" data-campo="ativo">
                <input type="checkbox" checked={fAtivo}
                       onChange={e => setFAtivo(e.target.checked)} />
                Pode entrar no painel
              </label>

              <div className="cad-bloco" data-bloco="redefinir-senha">
                {senhaDada ? (
                  <div className="dia-nota verde">
                    <strong>Senha provisória: <span data-campo="senha-redefinida">{senhaDada}</span></strong>
                    <p>Entregue à pessoa. Ela entra com esta senha e pode trocar em Meu perfil.</p>
                  </div>
                ) : (
                  <button className={redefinindo ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                          data-acao="redefinir-senha" disabled={!!indo}
                          onBlur={() => setRedefinindo(false)}
                          onClick={async () => {
                            if (!editando) return;
                            if (!redefinindo) { setRedefinindo(true); return; }
                            const nova = senhaSugerida();
                            const r = await redefinirSenha(clienteId, editando.usuario_id, nova);
                            setRedefinindo(false);
                            if (r.ok) setSenhaDada(nova); else avisar(r.mensagem, false);
                          }}>
                    <i className="fas fa-key" /> {redefinindo ? 'Confirmar: gerar senha provisória' : 'Redefinir senha'}
                  </button>
                )}
              </div>

              {/* ⭐⭐⭐ 21/10 — o Tom: "só pessoas com privilégios
                  individuais podem responder pela API oficial". */}
              <label className="cad-escolha" data-campo="responde-whatsapp">
                <input type="checkbox" checked={fResponde}
                       onChange={e => setFResponde(e.target.checked)} />
                <span>
                  Responde pacientes pelo <strong>WhatsApp oficial</strong>
                  <small className="wiz-dica" style={{ display: 'block' }}>
                    Privilégio individual: nenhum papel dá isto, nem a Diretoria.
                    É falar em nome do hospital, num canal cobrado e que a Meta
                    pune por denúncia.
                  </small>
                </span>
              </label>

              {/* ⚠️ O aviso aparece ANTES de salvar. Descobrir no
                  botão que a pessoa não vê tela nenhuma seria
                  descobrir tarde. */}
              {fAtivo && !telasDoPapelEscolhido.filter(t => !fMenos.includes(t)).length
                      && !fMais.filter(t => !fMenos.includes(t)).length && (
                <div className="dia-nota amarela" data-aviso="sem-nenhuma-tela">
                  <strong>Assim ela entra e não vê tela nenhuma.</strong>
                  <p>
                    O painel abre vazio, sem mensagem de erro — marque pelo menos
                    uma tela abaixo, ou escolha outro papel.
                  </p>
                </div>
              )}

              {/* ════════════════════════════════════════════
                  ⭐⭐⭐ OS SETORES DA PESSOA   (20/10/2026)

                  O Tom: *"isso são setores dentro do painel,
                  onde usuários recebem as mensagens do seu
                  setor."*

                  Fica junto das telas de propósito: as duas
                  respondem "o que chega até esta pessoa". Numa
                  tela separada, cadastrar alguém novo seriam
                  dois lugares — e o segundo seria esquecido.
                  ════════════════════════════════════════════ */}
              {!!setoresDoFormulario.length && (
                <>
                  <h4 style={{ margin: '18px 0 4px' }}>Setores que ela atende</h4>
                  <p className="cad-ajuda" data-ajuda="setores-da-pessoa">
                    O recado que o paciente deixa no chat entra na fila do setor
                    que ele escolheu. Quem está marcado aqui é quem recebe.
                  </p>

                  <div className="perm-secao" data-secao="setores-da-pessoa">
                    {setoresDoFormulario.map(st => {
                      const marcado = fSetores.includes(st.id);
                      return (
                        <button key={st.id}
                                className={'perm-tela ' + (marcado ? 'a-mais' : 'nao')}
                                data-setor-pessoa={st.id}
                                data-marcado={marcado ? 'sim' : 'nao'}
                                onClick={() => alternarSetor(st.id)}>
                          <i className={marcado ? 'fas fa-check-square' : 'far fa-square'} />
                          <span className="perm-icone" aria-hidden="true">
                            {st.icone ?? '💬'}
                          </span>
                          <span>{st.nome}</span>
                          {!st.ativo && (
                            <em className="perm-porvir" data-marca="desativado">
                              desativado
                            </em>
                          )}
                          {st.no_whatsapp && (
                            <em data-marca="whatsapp">responde no WhatsApp</em>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* ⚠️ Marcar alguém que não pode entrar no painel
                      não dá erro em lugar nenhum — e o recado fica
                      esperando uma pessoa que nunca abre a tela. */}
                  {!fAtivo && !!fSetores.length && (
                    <div className="dia-nota amarela" data-aviso="setor-sem-acesso">
                      <strong>Ela está em um setor, mas não pode entrar.</strong>
                      <p>
                        O recado vai cair na fila deste setor e esperar por
                        alguém que não abre o painel. Marque{' '}
                        <strong>Pode entrar no painel</strong>, ou desmarque os
                        setores.
                      </p>
                    </div>
                  )}
                </>
              )}

              <h4 style={{ margin: '18px 0 8px' }}>Telas</h4>

              {porSecao.map(([secao, telas]) => (
                <div key={secao} className="perm-secao" data-secao={secao}>
                  <span className="perm-secao-titulo">{secao}</span>
                  {telas.map(t => {
                    const est = estadoDaTela(t.pagina, telasDoPapelEscolhido, fMais, fMenos);
                    const ligada = est === 'do-papel' || est === 'a-mais';
                    return (
                      <button key={t.pagina}
                              className={'perm-tela ' + est}
                              data-tela={t.pagina} data-estado={est}
                              onClick={() => alternarTela(t.pagina)}>
                        <i className={ligada ? 'fas fa-check-square' : 'far fa-square'} />
                        <i className={`${familiaDoIcone(t.icone)} ${t.icone} perm-icone`} />
                        <span>{t.rotulo}</span>
                        <em data-marca={est}>{ROTULO_DO_ESTADO[est]}</em>
                        {!t.pronto && <em className="perm-porvir">por construir</em>}
                      </button>
                    );
                  })}
                </div>
              ))}

              <div className="form-actions">
                <button className="btn-secondary" disabled={indo}
                        onClick={() => setEditando(null)}>Voltar</button>
                <button className="btn-primary" data-acao="salvar-usuario"
                        disabled={indo} onClick={salvarPessoa}>
                  {indo
                    ? <><i className="fas fa-circle-notch fa-spin" /> Salvando…</>
                    : <><i className="fas fa-check" /> Salvar permissões</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── o modal do papel ──────────────── */}
      {/* ⚠️ A primeira versão desta condição tentava adivinhar
          "estou criando um setor" olhando o estado dos campos —
          `sIcone !== '' && sNome === '' && sOrdem === 50`. Era
          ilegível e estava errada: o botão "Novo setor" não
          abria nada.
          
          ⭐ Abrir ou não abrir um formulário é um FATO, e fato
             tem variável. Adivinhar a partir de três campos é
             como escrever a regra sobre o mensageiro. */}
      {setorAberto && (
        <div className="modal" data-modal="setor">
          <div className="modal-overlay" onClick={() => setSetorAberto(false)} />
          <div className="modal-content" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>{setorEditando ? setorEditando.nome : 'Novo setor'}</h3>
              <button onClick={() => setSetorAberto(false)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-row">
                <div className="form-group" style={{ flex: '0 0 92px' }}>
                  <label>Ícone</label>
                  <input type="text" value={sIcone} data-campo="icone-setor"
                         maxLength={4}
                         onChange={e => setSIcone(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Nome do setor</label>
                  <input type="text" value={sNome} data-campo="nome-setor"
                         maxLength={60}
                         onChange={e => setSNome(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label>Descrição (a frase embaixo do nome, no chat)</label>
                <input type="text" value={sDesc} data-campo="descricao-setor"
                       maxLength={120}
                       placeholder="Laudos e entrega de resultados"
                       onChange={e => setSDesc(e.target.value)} />
              </div>

              <div className="form-group" style={{ maxWidth: 140 }}>
                <label>Ordem no chat</label>
                <input type="number" value={sOrdem} data-campo="ordem-setor"
                       onChange={e => setSOrdem(Number(e.target.value) || 50)} />
              </div>

              {/* ⚠️ As duas caixinhas estavam numa `form-row` com um
                  `<label>&nbsp;</label>` só para empurrar a segunda
                  para baixo. Espaço em branco não é alinhamento:
                  uma embaixo da outra diz a mesma coisa e não
                  depende de nada. */}
              <div className="cad-escolhas" style={{ marginTop: 14 }}>
                <label className="cad-escolha">
                  <input type="checkbox" checked={sAtivo}
                         data-campo="ativo-setor"
                         onChange={e => setSAtivo(e.target.checked)} />
                  Aparece no chat
                </label>
                <label className="cad-escolha">
                  <input type="checkbox" checked={sWhats}
                         data-campo="whatsapp-setor"
                         onChange={e => setSWhats(e.target.checked)} />
                  Responde pelo WhatsApp
                </label>
              </div>
              <p className="dica">
                Marcado, o chat <strong>não abre recado</strong> neste setor:
                ele manda a pessoa chamar no WhatsApp do hospital. Use para o
                setor que já é atendido por lá.
              </p>

              {/* ════════════════════════════════════════════
                  ⭐⭐⭐ QUEM ATENDE — A MESMA VERDADE, OUTRA PORTA

                  O Tom: *"incluir a cada usuário
                  individualmente."* Isso se pergunta de dois
                  jeitos, e os dois são naturais: abrindo a
                  pessoa ("o que ela atende?") e abrindo o setor
                  ("quem atende isto?").

                  ⚠️ As duas portas escrevem a MESMA coluna.
                     Uma lista guardada do lado do setor seria
                     a segunda resposta para a mesma pergunta.
                  ════════════════════════════════════════════ */}
              {!sWhats && (
                <>
                  <h4 style={{ margin: '20px 0 4px' }}>Quem atende este setor</h4>
                  <p className="cad-ajuda">
                    São estas as pessoas que recebem o recado deixado aqui.
                  </p>
                  <div className="perm-secao" data-secao="quem-atende">
                    {pessoas.map(u => {
                      const marcado = sQuem.includes(u.usuario_id);
                      return (
                        <button key={u.usuario_id}
                                className={'perm-tela ' + (marcado ? 'a-mais' : 'nao')}
                                data-quem-atende={u.usuario_id}
                                data-marcado={marcado ? 'sim' : 'nao'}
                                onClick={() => setSQuem(l =>
                                  l.includes(u.usuario_id)
                                    ? l.filter(x => x !== u.usuario_id)
                                    : [...l, u.usuario_id])}>
                          <i className={marcado ? 'fas fa-check-square' : 'far fa-square'} />
                          <span>{u.nome || u.email}</span>
                          {!u.ativo && (
                            <em className="perm-porvir" data-marca="sem-acesso">
                              sem acesso ao painel
                            </em>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {sQuem.length === 0 && sAtivo && (
                    <div className="dia-nota amarela" data-aviso="setor-vazio-no-form">
                      <strong>Ninguém atende este setor.</strong>
                      <p>
                        O recado vai entrar na fila e ficar lá, sem ninguém ser
                        avisado. Marque ao menos uma pessoa.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="form-actions">
              {/* ⭐ Excluir fica à ESQUERDA, longe do Salvar. Ação
                  que não desfaz não divide vizinhança com a que
                  se usa toda hora. */}
              {!!setorEditando && (
                <button className="btn-danger" data-acao="excluir-setor"
                        style={{ marginRight: 'auto' }}
                        disabled={indo}
                        onClick={() => setSetorApagando(setorEditando)}>
                  <i className="fas fa-trash" /> Excluir
                </button>
              )}
              <button className="btn-secondary"
                      onClick={() => setSetorAberto(false)}>Cancelar</button>
              <button className="btn-primary" data-acao="salvar-setor"
                      disabled={sNome.trim().length < 3 || indo}
                      onClick={salvarOSetor}>
                {indo ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {papelEditando && (
        <div className="modal" data-modal="papel">
          <div className="modal-overlay" onClick={() => setPapelEditando(null)} />
          <div className="modal-content" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <h3>{papelEditando.nome}</h3>
              <button onClick={() => setPapelEditando(null)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Nome do papel</label>
                <input type="text" value={pNome} data-campo="nome-papel"
                       onChange={e => setPNome(e.target.value)} />
              </div>

              {/* ⚠️ Mexer no papel mexe em todo mundo que o tem.
                  O número está à vista antes do clique, não
                  depois. */}
              {papelEditando.quantas_pessoas > 0 && (
                <div className="cad-nota" style={{ marginTop: 12 }}
                     data-aviso="quantas-pessoas">
                  <i className="fas fa-users" />
                  <div>
                    <strong>
                      {papelEditando.quantas_pessoas}{' '}
                      {papelEditando.quantas_pessoas === 1 ? 'pessoa usa' : 'pessoas usam'}
                      {' '}este papel.
                    </strong>
                    <p>O que você marcar aqui vale para {
                      papelEditando.quantas_pessoas === 1 ? 'ela' : 'todas elas'
                    } — menos onde houver exceção por pessoa.</p>
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════════════════
                  ⭐⭐⭐ O QUE ESTE PAPEL PODE FAZER

                  13/10/2026, o Tom: *"todos que têm acesso a
                  determinada página podem fazer tudo. Abrir
                  encaixe deveria ser para pessoas específicas e
                  não para quem tem acesso ao calendário."*

                  TELA e AÇÃO são coisas diferentes, e é por isso
                  que são duas listas: ver a Agenda do Médico é
                  uma coisa, furar a grade dela é outra.

                  ⚠️ O catálogo vem do BANCO. Ação nova aparece
                     aqui no dia em que passa a existir — lista à
                     mão deixaria a permissão nova sem caixinha,
                     ninguém a concederia, e a função que depende
                     dela recusaria todo mundo sem acusar nada.
                  ════════════════════════════════════════════════ */}
              <h4 style={{ margin: '18px 0 8px' }}>O que este papel pode fazer</h4>

              {[...new Set(acoes.map(a => a.grupo))].map(grupo => (
                <div key={grupo} className="perm-secao" data-grupo={grupo}>
                  <span className="perm-secao-titulo">{grupo}</span>
                  {acoes.filter(a => a.grupo === grupo).map(a => {
                    const marcada = pPerms.includes(a.permissao);
                    return (
                      <button key={a.permissao}
                              className={'perm-acao' + (marcada ? ' ligada' : '')}
                              data-acao-perm={a.permissao}
                              data-marcada={marcada ? '1' : '0'}
                              onClick={() => setPPerms(l => marcada
                                ? l.filter(x => x !== a.permissao)
                                : [...l, a.permissao])}>
                        <i className={marcada ? 'fas fa-check-square' : 'far fa-square'} />
                        <span>
                          <strong>{a.rotulo}</strong>
                          <small>{a.ajuda}</small>
                          {/* ⭐ O que acontece com quem NÃO tem.
                              É a informação que falta em toda
                              tela de permissão: desmarcar sem
                              saber a consequência é como
                              desligar um disjuntor sem etiqueta. */}
                          {!marcada && (
                            <em className="perm-sem" data-sem={a.permissao}>
                              sem ela: {a.sem_ela}
                            </em>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* ⚠️ A tela de Logs sem a permissão de ler a
                  auditoria abre VAZIA, sem erro. Foi o defeito de
                  10/10, e o banco já corrige sozinho no salvar —
                  aqui a tela só conta o que vai acontecer. */}
              {pTelas.includes('logs') && !pPerms.includes('core.auditoria') && (
                <div className="dia-nota azul" data-aviso="logs-sem-auditoria">
                  <strong>A tela de Logs precisa de "Ler o registro de atividades".</strong>
                  <p>
                    Sem ela a tela abre em branco, sem erro nenhum. Eu marco
                    junto ao salvar.
                  </p>
                </div>
              )}

              <h4 style={{ margin: '18px 0 8px' }}>Telas deste papel</h4>

              {porSecao.map(([secao, telas]) => (
                <div key={secao} className="perm-secao" data-secao={secao}>
                  <span className="perm-secao-titulo">{secao}</span>
                  {telas.map(t => {
                    const ligada = pTelas.includes(t.pagina);
                    return (
                      <button key={t.pagina}
                              className={'perm-tela ' + (ligada ? 'do-papel' : 'nao')}
                              data-tela-papel={t.pagina} data-marcada={ligada ? '1' : '0'}
                              onClick={() => setPTelas(l =>
                                ligada ? l.filter(x => x !== t.pagina) : [...l, t.pagina])}>
                        <i className={ligada ? 'fas fa-check-square' : 'far fa-square'} />
                        <i className={`${familiaDoIcone(t.icone)} ${t.icone} perm-icone`} />
                        <span>{t.rotulo}</span>
                        {!t.pronto && <em className="perm-porvir">por construir</em>}
                      </button>
                    );
                  })}
                </div>
              ))}

              <div className="form-actions">
                <button className="btn-secondary" disabled={indo}
                        onClick={() => setPapelEditando(null)}>Voltar</button>
                <button className="btn-primary" data-acao="salvar-papel"
                        disabled={indo} onClick={salvarOPapel}>
                  {indo
                    ? <><i className="fas fa-circle-notch fa-spin" /> Salvando…</>
                    : <><i className="fas fa-check" /> Salvar papel</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          ⭐⭐⭐ A CONFIRMAÇÃO DE EXCLUIR

          ⚠️ Ela vem DEPOIS do formulário do setor no arquivo, e
          isso não é arrumação: dois modais abertos ao mesmo
          tempo empilham na ordem em que aparecem aqui. Escrita
          antes, ela ficava ATRÁS do formulário — visível,
          clicável no olho, e o clique caía no formulário de
          cima.

          Ela DIZ o que vai acontecer com os recados daquele
          setor, com número. "Tem certeza?" não é pergunta: é
          um botão a mais no caminho de quem já decidiu, e não
          informa nada a quem não decidiu.
          ════════════════════════════════════════════════════ */}
      {setorApagando && (
        <div className="modal" data-modal="excluir-setor">
          <div className="modal-overlay" onClick={() => setSetorApagando(null)} />
          <div className="modal-content" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>Excluir "{setorApagando.nome}"?</h3>
              <button onClick={() => setSetorApagando(null)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="modal-body">
              <div className="dia-nota amarela" data-aviso="o-que-some">
                <strong>O setor some da lista e do chat.</strong>
                <p>
                  {setorApagando.abertos > 0
                    ? <>
                        Os <strong>{setorApagando.abertos} recado(s)</strong> em
                        aberto dele <strong>continuam na fila</strong>, e passam
                        a aparecer como "sem setor" para todo mundo. Nenhuma
                        mensagem de paciente é apagada.
                      </>
                    : <>Ele não tem nenhum recado em aberto.</>}
                </p>
                <p>
                  Se a ideia é só tirá-lo do chat por um tempo,{' '}
                  <strong>desative</strong> em vez de excluir: assim ele volta
                  com um clique.
                </p>
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-secondary" disabled={indo}
                      onClick={() => setSetorApagando(null)}>Voltar</button>
              <button className="btn-danger" data-acao="confirmar-excluir-setor"
                      disabled={indo} onClick={excluirOSetor}>
                {indo ? 'Excluindo…' : 'Excluir mesmo assim'}
              </button>
            </div>
          </div>
        </div>
      )}

      {novoAberto && (
        <div className="modal" data-modal="novo-usuario">
          <div className="modal-overlay" onClick={() => !indo && setNovoAberto(false)} />
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3><i className="fas fa-user-plus" /> Novo usuário</h3>
              <button onClick={() => setNovoAberto(false)} aria-label="Fechar" disabled={indo}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="modal-body">
              {criado ? (
                <div data-bloco="usuario-criado">
                  <div className="dia-nota verde">
                    <strong>Pronto. Entregue estes dados à pessoa:</strong>
                    <p>E-mail: <strong data-campo="email-criado">{criado.email}</strong></p>
                    {criado.jaExistia ? (
                      <p data-aviso="ja-tinha-login">
                        Ela <strong>já tinha login</strong> em outro hospital do
                        MedCalendar: entra com a senha que já usa. A senha
                        provisória abaixo <strong>não</strong> foi aplicada.
                      </p>
                    ) : (
                      <p>Senha provisória: <strong data-campo="senha-criada">{criado.senha}</strong></p>
                    )}
                  </div>
                  <div className="form-actions">
                    <button className="btn-primary" data-acao="fechar-novo-usuario"
                            onClick={() => setNovoAberto(false)}>
                      <i className="fas fa-check" /> Entendi
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label>Nome *</label>
                    <input type="text" maxLength={80} value={nNome} data-campo="novo-nome"
                           onChange={e => setNNome(e.target.value)} placeholder="Juliana Prado" />
                  </div>
                  <div className="form-group">
                    <label>E-mail *</label>
                    <input type="email" maxLength={120} value={nEmail} data-campo="novo-email"
                           onChange={e => setNEmail(e.target.value)} placeholder="juliana@hospital.com.br" />
                  </div>
                  <div className="form-group">
                    <label>Papel *</label>
                    <select value={nPapel} data-campo="novo-papel"
                            onChange={e => setNPapel(e.target.value)}>
                      {papeis.map(p => <option key={p.papel} value={p.papel}>{p.nome}</option>)}
                    </select>
                    <small className="wiz-dica">
                      O papel dá as telas. Depois dá para ajustar só desta pessoa, em Permissões.
                    </small>
                  </div>
                  <div className="form-group">
                    <label>Senha provisória *</label>
                    <div className="cad-dupla">
                      <input type="text" value={nSenha} data-campo="novo-senha"
                             onChange={e => setNSenha(e.target.value)} style={{ flex: 1 }} />
                      <button type="button" className="btn-secondary btn-sm"
                              data-acao="outra-senha" onClick={() => setNSenha(senhaSugerida())}>
                        <i className="fas fa-rotate" /> Outra
                      </button>
                    </div>
                    <small className="wiz-dica">
                      Você entrega esta senha à pessoa. Pelo menos 8 caracteres.
                    </small>
                  </div>
                  {!!erroDoNovo() && (
                    <div className="dia-nota amarela" data-erro="novo-usuario">{erroDoNovo()}</div>
                  )}
                  <div className="form-actions">
                    <button className="btn-secondary" onClick={() => setNovoAberto(false)}
                            disabled={indo}>Voltar</button>
                    <button className="btn-primary" data-acao="criar-usuario"
                            disabled={indo || !!erroDoNovo()} onClick={() => void criarONovo()}>
                      {indo
                        ? <><i className="fas fa-circle-notch fa-spin" /> Criando…</>
                        : <><i className="fas fa-check" /> Criar acesso</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <Aviso recado={recado} aoFechar={fechar} />
    </>
  );
}
