import { AgendadorDosAvisos } from './AgendadorDosAvisos';
import { useEffect, useMemo, useState } from 'react';
import {
  clientesDaPlataforma, modulosParaConfigurar, salvarCliente,
  salvarModulosDoCliente, configDoCliente, atendeConveniosDaConfig,
  definirAtendeConvenios,
  type ClienteDaPlataforma, type ModuloParaConfigurar
} from './dados';
import { MENU } from './menu';
import { derivarMarca, sigla, formatarCNPJ } from '../../nucleo/formato';
import { Aviso, useAviso } from './Aviso';
import { NovoHospital } from './NovoHospital';
import { MonitorDosClientes } from './MonitorDosClientes';
import { Assinaturas } from './Assinaturas';
import { WhatsAppDoCliente } from './WhatsAppDoCliente';

/**
 * ============================================================
 *  MEDCALENDAR · OS CLIENTES
 *
 *  11/10/2026, o Tom: *"queria primeiro algo MedCalendar
 *  institucional. Uma área multicliente, onde eu conseguisse
 *  gerenciar os clientes do MedCalendar. Configurar clientes,
 *  identidade visual..."*
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ ESTA TELA SÓ EXISTE PORQUE OS BOTÕES PASSARAM A TER FIO
 *
 *  Antes de desenhar, fui ver o que os campos faziam:
 *
 *    core.clientes.ativo      → ninguém lia
 *    clientes_modulos.ativo   → a visão do painel ignorava
 *    clientes_modulos.expira  → idem
 *
 *  Um "Suspender cliente" escrito em cima disso diria que
 *  suspendeu, e o hospital continuaria marcando consulta.
 *
 *  **Botão que escreve numa coluna que ninguém lê é pior que
 *  botão nenhum** — ele dá a alguém a certeza de ter feito uma
 *  coisa que não foi feita.
 *
 *  O `026_plataforma.sql` ligou os três fios primeiro. Só por
 *  isso os interruptores daqui dizem a verdade.
 *
 *  ------------------------------------------------------------
 *  A LISTA DE MÓDULOS SAI DO MENU
 *
 *  `MODULOS` é derivada do `MENU`. Um módulo novo aparece aqui
 *  no mesmo dia em que aparece na barra lateral — uma segunda
 *  lista à mão envelheceria calada, e o módulo novo não teria
 *  como ser vendido.
 * ============================================================
 */

/** Os módulos que o sistema conhece, tirados do próprio menu. */
const MODULOS: { modulo: string; telas: number }[] = (() => {
  const conta = new Map<string, number>();
  for (const s of MENU)
    for (const i of s.itens)
      if (i.modulo) conta.set(i.modulo, (conta.get(i.modulo) ?? 0) + 1);
  return [...conta.entries()].map(([modulo, telas]) => ({ modulo, telas }));
})();

const NOME_DO_MODULO: Record<string, string> = {
  agendamento: 'Agendamento',
  exames: 'Exames',
  chat: 'Atendimento e WhatsApp'
};

const COR_PADRAO = '#004994';

function soDigitos(t: string): string { return t.replace(/\D/g, ''); }

/**
 * ⭐⭐ AS TRÊS ABAS SÃO TRÊS PERGUNTAS DIFERENTES
 *
 *  Clientes   → "como este hospital está configurado?"
 *  Monitor    → "qual deles vai cancelar e ainda não falou?"
 *  Assinaturas→ "quem está me devendo?"
 *
 *  Juntar tudo numa lista só pareceria economia de tela e seria
 *  a tela que ninguém abre: três perguntas na mesma coluna
 *  viram vinte colunas, e vinte colunas não se lê.
 */
type Aba = 'clientes' | 'monitor' | 'assinaturas';

export function Clientes() {
  const { recado, avisar, fechar } = useAviso();

  const [aba, setAba] = useState<Aba>('clientes');
  const [criando, setCriando] = useState(false);
  const [lista, setLista] = useState<ClienteDaPlataforma[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [busca, setBusca] = useState('');
  const [indo, setIndo] = useState(false);

  const [aberto, setAberto] = useState<ClienteDaPlataforma | null>(null);
  /** ⭐ 21/10: "Atende convênios" — o que está gravado e o que está na tela. */
  const [convGravado, setConvGravado] = useState(true);
  const [fConvenios, setFConvenios] = useState(true);
  const [fNome, setFNome] = useState('');
  const [fCnpj, setFCnpj] = useState('');
  const [fAtivo, setFAtivo] = useState(true);
  const [fExibicao, setFExibicao] = useState('');
  const [fCor, setFCor] = useState('');
  const [fLogo, setFLogo] = useState('');
  /* ⭐ 19/10: a placa da porta. Sem tela, a vitrine do chat
     nasceria vazia para todo hospital, para sempre. */
  const [fTagline, setFTagline] = useState('');
  const [fTelefone, setFTelefone] = useState('');
  const [fEndereco, setFEndereco] = useState('');
  const [fHorario, setFHorario] = useState('');
  const [mods, setMods] = useState<ModuloParaConfigurar[]>([]);
  const [fMods, setFMods] = useState<string[]>([]);
  const [fValidade, setFValidade] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    let valido = true;
    setCarregando(true);
    clientesDaPlataforma()
      .then(l => { if (valido) { setLista(l); setCarregando(false); } })
      .catch(e => {
        if (valido) { setErro((e as Error).message ?? String(e)); setCarregando(false); }
      });
    return () => { valido = false; };
  }, [recarga]);

  const vistos = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter(c =>
      `${c.nome} ${c.slug} ${c.nome_exibicao ?? ''} ${c.cnpj ?? ''}`
        .toLowerCase().includes(t));
  }, [lista, busca]);

  async function abrir(c: ClienteDaPlataforma) {
    setAberto(c);
    setFNome(c.nome);
    setFCnpj(c.cnpj ?? '');
    setFAtivo(c.ativo);
    setFExibicao(c.nome_exibicao ?? '');
    setFCor(c.cor ?? '');
    setFLogo(c.logo_url ?? '');
    setFTagline(c.tagline ?? '');
    setFTelefone(c.telefone ?? '');
    setFEndereco(c.endereco ?? '');
    setFHorario(c.horario ?? '');
    setConfirmando(false);
    setFValidade('');
    setMods([]); setFMods([]);
    setConvGravado(true); setFConvenios(true);
    try {
      const [m, cfg] = await Promise.all([modulosParaConfigurar(c.id), configDoCliente(c.id)]);
      const atende = atendeConveniosDaConfig(cfg);
      setConvGravado(atende); setFConvenios(atende);
      setMods(m);
      setFMods(m.filter(x => x.situacao !== 'desligado' && x.situacao !== 'vencido')
                .map(x => x.modulo));
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    }
  }

  /** O que este módulo tira da tela do hospital, se cair agora. */
  function futurosDe(modulo: string): number {
    return mods.find(m => m.modulo === modulo)?.futuros ?? 0;
  }
  function situacaoDe(modulo: string): string {
    return mods.find(m => m.modulo === modulo)?.situacao ?? 'desligado';
  }

  /* ⚠️ O QUE ESTE SALVAR VAI CORTAR, EM NÚMERO.
     Marcado hoje, desmarcado no formulário, e com gente marcada
     para a semana que vem. A conta é feita antes do clique, não
     depois. */
  const vaiCortar = useMemo(() => {
    if (!aberto) return [] as { modulo: string; futuros: number }[];
    return mods
      .filter(m => !fMods.includes(m.modulo))
      .filter(m => m.situacao === 'ligado' || m.situacao === 'vencendo')
      .filter(m => m.futuros > 0)
      .map(m => ({ modulo: m.modulo, futuros: m.futuros }));
  }, [aberto, mods, fMods]);

  const corValida = !fCor || /^#[0-9A-Fa-f]{6}$/.test(fCor);
  const logoValido = !fLogo || /^https:\/\//.test(fLogo);
  const marca = useMemo(
    () => derivarMarca(corValida && fCor ? fCor : COR_PADRAO), [fCor, corValida]);

  const suspendendo = !!aberto?.ativo && !fAtivo;
  const precisaConfirmar = suspendendo || vaiCortar.length > 0;

  async function salvar() {
    if (!aberto || indo) return;
    if (!corValida || !logoValido) return;
    if (precisaConfirmar && !confirmando) { setConfirmando(true); return; }
    setIndo(true);
    try {
      const r1 = await salvarCliente({
        clienteId: aberto.id,
        nome: fNome.trim(), cnpj: soDigitos(fCnpj) || '', ativo: fAtivo,
        nomeExibicao: fExibicao, cor: fCor.toUpperCase(), logoUrl: fLogo.trim(),
        tagline: fTagline.trim(), telefone: fTelefone.trim(),
        endereco: fEndereco.trim(), horario: fHorario.trim()
      });
      if (!r1.ok) { avisar(r1.mensagem, false); return; }

      const r2 = await salvarModulosDoCliente({
        clienteId: aberto.id, modulos: fMods,
        expira: fValidade || null,
        semValidade: fValidade ? null : true
      });
      if (!r2.ok) { avisar(r2.mensagem, false); return; }

      // ⭐ Só grava a chave se ela MUDOU: abrir e salvar um cliente
      //    não deixa "desligou convênios" no registro à toa.
      let r3 = '';
      if (fConvenios !== convGravado) {
        const c3 = await definirAtendeConvenios(aberto.id, fConvenios);
        if (!c3.ok) { avisar(c3.mensagem, false); return; }
        r3 = ' ' + c3.mensagem;
      }
      avisar(r1.mensagem + ' ' + r2.mensagem + r3, true);
      // ⭐ O painel relê a configuração na hora: desligar convênio
      //    do hospital aberto não pode esperar um F5 para valer.
      if (r3) window.dispatchEvent(new CustomEvent('medcalendar:config-mudou'));
      setAberto(null); setRecarga(n => n + 1);
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo(false);
    }
  }

  if (erro) return <div className="erro-caixa">{erro}</div>;

  const noAr = lista.filter(c => c.ativo).length;

  return (
    <>
      <div className="cad-topo">
        <div>
          <h2>Clientes do MedCalendar</h2>
          <p>
            {noAr} {noAr === 1 ? 'hospital no ar' : 'hospitais no ar'} de
            {' '}{lista.length}. Cadastro, identidade visual e os módulos que
            cada um contratou.
          </p>
        </div>
        <button className="btn-primary" data-acao="abrir-novo-hospital"
                onClick={() => setCriando(true)}>
          <i className="fas fa-plus" /> Novo hospital
        </button>
      </div>

      <div className="cli-abas" data-bloco="abas-plataforma">
        <button className={aba === 'clientes' ? 'atual' : ''}
                data-aba="clientes" onClick={() => setAba('clientes')}>
          <i className="fas fa-hospital" /> Clientes
        </button>
        <button className={aba === 'monitor' ? 'atual' : ''}
                data-aba="monitor" onClick={() => setAba('monitor')}>
          <i className="fas fa-heart-pulse" /> Monitor
        </button>
        <button className={aba === 'assinaturas' ? 'atual' : ''}
                data-aba="assinaturas" onClick={() => setAba('assinaturas')}>
          <i className="fas fa-receipt" /> Assinaturas
        </button>
      </div>

      {/* ⭐ Esta seção só aparece para quem é operador da
          plataforma, e é a única do sistema que atravessa o
          isolamento. Dizer isso em letras evita alguém abrir a
          tela na frente de um cliente achando que é inofensiva. */}
      <div className="cad-nota plataforma" data-aviso="area-da-plataforma">
        <i className="fas fa-building-shield" />
        <div>
          <strong>Esta área é só sua.</strong>
          <p>
            Nenhum usuário de hospital enxerga esta tela, nem as funções por
            trás dela — nem o administrador do próprio hospital dele. Quem vende
            módulo e muda razão social é o MedCalendar.
          </p>
        </div>
      </div>

      {aba === 'monitor' && (
        <AgendadorDosAvisos aoAvisar={avisar} />
      )}
      {aba === 'monitor' && (
        <MonitorDosClientes aoConfigurar={id => {
          const c = lista.find(x => x.id === id);
          if (c) { setAba('clientes'); abrir(c); }
        }} />
      )}

      {aba === 'assinaturas' && <Assinaturas aoAvisar={avisar} />}

      {aba === 'clientes' && (
      <>
      <div className="cad-busca">
        <i className="fas fa-search" />
        <input type="text" value={busca} data-campo="busca-cliente"
               onChange={e => setBusca(e.target.value)}
               placeholder="Buscar por nome, slug ou CNPJ…" />
      </div>

      {carregando && (
        <div className="loading-placeholder"><div className="spinner" /><p>Carregando…</p></div>
      )}

      {!carregando && !lista.length && (
        <div className="porvir">
          <i className="fas fa-hospital" />
          <h3>Nenhum cliente cadastrado</h3>
          <p>
            Clique em <strong>Novo hospital</strong> ali em cima. Ele nasce com
            os quatro papéis e os motivos de cancelamento prontos.
          </p>
        </div>
      )}

      {!carregando && vistos.map(c => (
        <div key={c.id} className={'cli-linha' + (c.ativo ? '' : ' suspenso')}
             data-cliente={c.id} data-slug={c.slug}>
          <span className="cli-marca"
                data-cor={c.cor ?? ''}
                style={{ background: c.cor || 'var(--gray-200)' }}>
            {c.logo_url
              ? <img src={c.logo_url} alt="" />
              : sigla(c.nome_exibicao || c.nome)}
          </span>

          <span className="cli-nome">
            {c.nome_exibicao || c.nome}
            <small>{c.slug}{c.cnpj ? ` · ${formatarCNPJ(c.cnpj)}` : ''}</small>
          </span>

          <span className="cad-tags">
            {!c.ativo && <em className="cad-tag off" data-tag="suspenso">suspenso</em>}
            {c.demo && <em className="cad-tag sub" data-tag="demo">demonstração</em>}
            <em className="cad-tag" data-tag="modulos">
              {c.modulos} {c.modulos === 1 ? 'módulo' : 'módulos'}
            </em>
            <em className="cad-tag neutro" data-tag="usuarios">
              {c.usuarios} {c.usuarios === 1 ? 'pessoa' : 'pessoas'}
            </em>
            <em className="cad-tag neutro" data-tag="pacientes">
              {c.pacientes.toLocaleString('pt-BR')} pac.
            </em>
          </span>

          <div className="cad-botoes">
            <button className="btn-secondary btn-sm" data-acao="configurar-cliente"
                    onClick={() => abrir(c)}>
              <i className="fas fa-sliders" /> Configurar
            </button>
          </div>
        </div>
      ))}
      </>
      )}

      {criando && (
        <NovoHospital aoAvisar={avisar}
                      aoFechar={criou => {
                        setCriando(false);
                        if (criou) setRecarga(n => n + 1);
                      }} />
      )}

      {/* ──────────────────── o formulário ──────────────────── */}
      {aberto && (
        <div className="modal" data-modal="cliente">
          <div className="modal-overlay" onClick={() => setAberto(null)} />
          <div className="modal-content" style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3>{aberto.nome_exibicao || aberto.nome}</h3>
              <button onClick={() => setAberto(null)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="modal-body">

              {/* ---------------- cadastro ---------------- */}
              <div className="form-group">
                <label>Razão social *</label>
                <input type="text" value={fNome} data-campo="nome-cliente"
                       maxLength={120}
                       onChange={e => setFNome(e.target.value)} />
              </div>

              <div className="cad-dupla">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>CNPJ</label>
                  <input type="text" value={formatarCNPJ(fCnpj)} data-campo="cnpj"
                         onChange={e => setFCnpj(soDigitos(e.target.value).slice(0, 14))}
                         placeholder="00.000.000/0000-00" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Identificador (slug)</label>
                  {/* ⚠️ Só para ler. O `001_core.sql` promete que ele
                      nunca muda, e há coisa amarrada nele que não é
                      URL — o `semear_demo` apaga `where slug='demo'`.
                      A trava de verdade não é este `disabled`: é que
                      `salvar_cliente` não tem por onde receber um slug
                      novo. Campo que não existe não é preenchido por
                      engano. */}
                  <input type="text" value={aberto.slug} disabled
                         data-campo="slug" title="O identificador nunca muda." />
                </div>
              </div>

              {/* ---------------- identidade ---------------- */}
              <h4 className="cli-secao">Identidade visual</h4>

              <div className="form-group">
                <label>Nome na tela</label>
                <input type="text" value={fExibicao} data-campo="nome-exibicao"
                       maxLength={60}
                       onChange={e => setFExibicao(e.target.value)}
                       placeholder={aberto.nome} />
                <small className="form-dica">
                  O que a recepção lê no alto do painel. Vazio usa a razão social.
                </small>
              </div>

              <div className="cad-dupla">
                <div className="form-group" style={{ flex: '0 0 150px' }}>
                  <label>Cor da marca</label>
                  <div className="cli-cor">
                    <input type="color" data-campo="cor-escolha"
                           value={corValida && fCor ? fCor : COR_PADRAO}
                           onChange={e => setFCor(e.target.value.toUpperCase())} />
                    <input type="text" value={fCor} data-campo="cor"
                           maxLength={7} placeholder={COR_PADRAO}
                           onChange={e => setFCor(e.target.value.toUpperCase())} />
                  </div>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Logo (endereço https)</label>
                  <input type="text" value={fLogo} data-campo="logo"
                         onChange={e => setFLogo(e.target.value)}
                         placeholder="https://…/logo.png" />
                </div>
              </div>

              {/* ════════════════════════════════════════════════
                  ⭐⭐⭐ A PLACA DA PORTA   (19/10/2026)

                  O Tom, sobre a vitrine do chat no computador:
                  *"coloque informações institucionais que vão ser
                   puxadas de cada cadastro da empresa: endereço,
                   CNPJ, telefone."*

                  ⚠️ Estes campos já existiam no banco e NÃO
                     tinham tela. Sem tela, a vitrine nasceria
                     vazia para todo hospital, para sempre — e
                     "a tela que não existe não dá erro" é a
                     lição mais cara deste projeto.

                  ⭐ O que ficar em branco simplesmente NÃO
                     aparece na vitrine, em vez de deixar uma
                     linha pela metade.
                  ════════════════════════════════════════════ */}
              <div className="form-sub" data-bloco="placa-da-porta">
                <h4>O que aparece para o paciente</h4>
                <p className="dica">
                  Isto é a vitrine do chat, ao lado da conversa. O que ficar
                  em branco não aparece.
                </p>
              </div>

              <div className="form-group">
                <label>Frase da marca</label>
                <input type="text" value={fTagline} data-campo="tagline"
                       maxLength={80}
                       onChange={e => setFTagline(e.target.value)}
                       placeholder="Cuidando de você e da sua família" />
              </div>

              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Telefone</label>
                  <input type="text" value={fTelefone} data-campo="telefone"
                         maxLength={40}
                         onChange={e => setFTelefone(e.target.value)}
                         placeholder="(11) 2398-1100" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Horário de atendimento</label>
                  <input type="text" value={fHorario} data-campo="horario"
                         maxLength={80}
                         onChange={e => setFHorario(e.target.value)}
                         placeholder="Seg a Sex, 7h às 19h" />
                </div>
              </div>

              <div className="form-group">
                <label>Endereço</label>
                <input type="text" value={fEndereco} data-campo="endereco"
                       maxLength={160}
                       onChange={e => setFEndereco(e.target.value)}
                       placeholder="Av. José Manara, 450 — Jarinu-SP" />
              </div>

              {!corValida && (
                <div className="dia-nota amarela" data-erro="cor">
                  <strong>Isso não é uma cor.</strong>
                  <p>
                    Precisa ser hexadecimal de seis dígitos, como{' '}
                    <code>#004994</code>. Ela vira CSS: um texto solto derruba
                    as cinco variáveis da folha de estilo de uma vez, e o painel
                    do hospital abre sem cor nenhuma.
                  </p>
                </div>
              )}

              {!logoValido && (
                <div className="dia-nota amarela" data-erro="logo">
                  <strong>O endereço precisa começar com https://.</strong>
                  <p>
                    O painel roda em https, e o navegador bloqueia imagem em http
                    <strong> sem avisar</strong> — o logo some e não há erro em
                    lugar nenhum.
                  </p>
                </div>
              )}

              {/* ⭐ A PRÉVIA, COM AS CINCO CORES DERIVADAS.
                  O cliente escolhe UMA cor; as outras quatro saem
                  dela. Ver antes de salvar é o que impede
                  descobrir no painel do hospital que o texto some
                  no fundo. */}
              <div className="cli-previa" data-bloco="previa-marca"
                   style={{ borderColor: marca.primary }}>
                <div className="cli-previa-barra"
                     style={{ background: marca.primary, color: marca.tinta }}
                     data-marca="primary">
                  <span className="cli-marca pequena"
                        style={{ background: marca.primaryDark, color: marca.tinta }}>
                    {sigla(fExibicao || fNome || aberto.nome)}
                  </span>
                  {fExibicao || fNome || aberto.nome}
                </div>
                <div className="cli-previa-corpo"
                     style={{ background: marca.primaryBg }}>
                  <button style={{ background: marca.primary, color: marca.tinta }}
                          data-marca="botao">Confirmar agendamento</button>
                  <span style={{ color: marca.primaryDark }}>texto de apoio</span>
                </div>
              </div>

              {/* ════════════════════════════════════════════
                  ⭐⭐⭐ ATENDE CONVÊNIOS   (21/10/2026)
                  O Tom: clínicas que não têm credenciamento com
                  convênio. Desligado, tudo é particular — no
                  chat, no painel e no banco, que recusa
                  agendamento com convênio. Nada é apagado.
                  ════════════════════════════════════════════ */}
              <h4 className="cli-secao">Convênios</h4>
              <label className="dia-check" data-campo="atende-convenios">
                <input type="checkbox" checked={fConvenios}
                       onChange={e => setFConvenios(e.target.checked)} />
                <span>
                  <strong>Este cliente atende convênios</strong>
                  <small>
                    {fConvenios
                      ? 'O chat pergunta o convênio, e o painel mostra convênios no agendamento, nos médicos, nos exames e no ranking.'
                      : 'Tudo é particular: o chat não pergunta convênio, as telas de convênio somem e o banco recusa agendamento com convênio. Os convênios cadastrados e o histórico NÃO são apagados.'}
                  </small>
                </span>
              </label>
              {fConvenios !== convGravado && (
                <div className="dia-nota amarela" data-aviso="convenios-vai-mudar">
                  <strong>
                    {fConvenios ? 'Ao salvar, os convênios voltam a aparecer.'
                                : 'Ao salvar, este cliente passa a ser só particular.'}
                  </strong>
                </div>
              )}

              {/* ---------------- módulos ---------------- */}
              <h4 className="cli-secao">Módulos contratados</h4>

              {MODULOS.map(m => {
                const sit = situacaoDe(m.modulo);
                const marcado = fMods.includes(m.modulo);
                const fut = futurosDe(m.modulo);
                return (
                  <label key={m.modulo}
                         className={'cli-modulo' + (marcado ? ' ligado' : '')}
                         data-modulo={m.modulo} data-situacao={sit}
                         data-marcado={marcado ? '1' : '0'}>
                    <input type="checkbox" checked={marcado}
                           onChange={e => setFMods(l => e.target.checked
                             ? [...l, m.modulo]
                             : l.filter(x => x !== m.modulo))} />
                    <span className="cli-modulo-nome">
                      {NOME_DO_MODULO[m.modulo] ?? m.modulo}
                      <small>{m.telas} {m.telas === 1 ? 'tela' : 'telas'} no menu</small>
                    </span>
                    <span className="cad-tags">
                      {sit === 'vencendo' && (
                        <em className="cad-tag exame" data-tag="vencendo">vence logo</em>
                      )}
                      {sit === 'vencido' && (
                        <em className="cad-tag off" data-tag="vencido">vencido</em>
                      )}
                      {fut > 0 && (
                        <em className="cad-tag neutro" data-tag="futuros">
                          {fut} marcado(s)
                        </em>
                      )}
                    </span>
                  </label>
                );
              })}

              <div className="form-group" style={{ marginTop: 12 }}>
                <label>Validade dos módulos ligados</label>
                <input type="date" value={fValidade} data-campo="validade"
                       onChange={e => setFValidade(e.target.value)} />
                <small className="form-dica">
                  Vazio = sem validade. Passada a data, as telas do módulo somem
                  do painel do hospital — e ele é avisado 15 dias antes.
                </small>
              </div>

              {/* ---------------- WhatsApp ----------------
                  ⭐ Fica aqui, na área da plataforma, porque o
                  token é segredo DA PLATAFORMA. O hospital
                  configura o TEXTO das mensagens na tela dele;
                  a chave do número, não. */}
              <WhatsAppDoCliente clienteId={aberto.id}
                                 nomeDoCliente={aberto.nome_exibicao || aberto.nome}
                                 ehDemo={aberto.demo}
                                 aoAvisar={avisar} />

              {/* ---------------- o acesso ---------------- */}
              <h4 className="cli-secao">Acesso</h4>

              <label className="cad-escolha" data-campo="ativo-cliente">
                <input type="checkbox" checked={fAtivo}
                       onChange={e => setFAtivo(e.target.checked)} />
                Este cliente pode entrar no sistema
              </label>

              {/* ⚠️⚠️⚠️ O QUE ACONTECE, EM LETRAS, ANTES DO CLIQUE.
                  Desde 11/10 este interruptor corta de verdade — ele
                  passa por baixo de toda política do banco de uma
                  vez. Antes disso não fazia nada, e por isso nunca
                  precisou de aviso. */}
              {suspendendo && (
                <div className="dia-nota vermelha" data-aviso="vai-suspender">
                  <strong>
                    {aberto.usuarios} {aberto.usuarios === 1 ? 'pessoa perde' : 'pessoas perdem'}
                    {' '}o acesso agora.
                  </strong>
                  <p>
                    Agenda, pacientes, cadastros e relatórios ficam invisíveis
                    para o hospital inteiro — nada é apagado, e reativar devolve
                    tudo. Eles verão uma tela dizendo que o acesso está suspenso.
                  </p>
                </div>
              )}

              {!!vaiCortar.length && (
                <div className="dia-nota amarela" data-aviso="modulo-vai-cortar">
                  <strong>Isto some da tela do hospital:</strong>
                  <p>
                    {vaiCortar.map(v =>
                      `${v.futuros} ${NOME_DO_MODULO[v.modulo] ?? v.modulo} já marcado(s)`
                    ).join(' · ')}.
                  </p>
                  <p>
                    Os atendimentos continuam no banco e voltam a aparecer se o
                    módulo voltar — mas até lá ninguém da recepção consegue vê-los
                    nem avisar o paciente.
                  </p>
                </div>
              )}

              {confirmando && (
                <div className="dia-nota vermelha" data-aviso="confirmar">
                  <strong>Clique em Salvar de novo para confirmar.</strong>
                </div>
              )}

              <div className="form-actions">
                {/* ⭐ NOME, não classe. Em 13/10 a seção do WhatsApp
                    trouxe seis botões secundários para dentro deste
                    modal, e a prova parou com "strict mode violation:
                    resolved to 7 elements" — numa linha que fala de
                    locator, não de regra. */}
                <button className="btn-secondary" disabled={indo}
                        data-acao="fechar-cliente"
                        onClick={() => setAberto(null)}>Voltar</button>
                <button className={precisaConfirmar ? 'btn-danger' : 'btn-primary'}
                        data-acao="salvar-cliente"
                        disabled={indo || !corValida || !logoValido
                                  || fNome.trim().length < 3}
                        onClick={salvar}>
                  {indo
                    ? <><i className="fas fa-circle-notch fa-spin" /> Salvando…</>
                    : confirmando
                      ? <><i className="fas fa-triangle-exclamation" /> Confirmar</>
                      : <><i className="fas fa-check" /> Salvar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Aviso recado={recado} aoFechar={fechar} />
    </>
  );
}
