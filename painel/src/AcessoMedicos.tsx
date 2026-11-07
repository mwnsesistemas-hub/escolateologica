import { useEffect, useMemo, useState } from 'react';
import {
  acessosDosMedicos, loginsParaMedico, ligarMedicoAoLogin, redefinirSenha,
  type AcessoDeMedico, type EstadoDoAcesso, type LoginParaMedico
} from './dados';
import { Aviso, useAviso } from './Aviso';

/**
 * ============================================================
 *  ACESSO DOS MÉDICOS — quem entra pela porta do médico
 *  26/10/2026
 *
 *  O Tom:
 *
 *  > *"No sistema atual, o acesso do medico não fica no painel.
 *  >  ele fica em um link separado, onde loga com CRM e Senha.
 *  >  As senhas são criadas no painel. página acesso dos
 *  >  médicos, mas se colocar dentro do cadastro médico fica
 *  >  legal."*
 *
 *  Ficou nos dois lugares, e eles fazem coisas diferentes:
 *
 *   • Na ficha do médico mora o ATO (ligar ESTE médico a ESTE
 *     login) — é onde a pessoa já está quando pensa nisso.
 *
 *   • Aqui mora a VISÃO: a lista inteira de uma vez.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ A PERGUNTA QUE ESTA TELA EXISTE PARA RESPONDER
 *
 *  Não é "quem tem acesso". É **"quem tem acesso e nunca
 *  usou"**.
 *
 *  Senha criada e nunca usada é a porta que ficou aberta: ou o
 *  médico não sabe que existe (e a tela foi feita à toa), ou ele
 *  não precisa dela (e é uma credencial viva sem dono atento).
 *  Os dois casos pedem um telefonema, e nenhum deles aparece
 *  numa lista que só mostra quem entra.
 *
 *  Essa resposta mora em `auth.users.last_sign_in_at`, que é do
 *  Supabase e o painel não enxerga. Ela vem pronta do
 *  `public.acessos_dos_medicos`.
 *
 *  ------------------------------------------------------------
 *  ⚠️ O `estado` NÃO É CALCULADO AQUI
 *
 *  Tem cinco: `sem_acesso`, `nunca_entrou`, `bloqueado`,
 *  `fora_do_hospital` e `entrando`. A escadinha de `if` que os
 *  decide está no banco, uma vez.
 *
 *  Se ela estivesse aqui, o primeiro relatório que perguntasse
 *  "quantos médicos sem acesso?" escreveria a segunda — e duas
 *  respostas para a mesma pergunta discordam em silêncio, que é
 *  o defeito mais caro deste projeto inteiro.
 * ============================================================
 */

/** A cara de cada estado — rótulo, cor e o que fazer. */
const ESTADOS: Record<EstadoDoAcesso, {
  rotulo: string; cor: string; icone: string; conta: boolean;
}> = {
  entrando:         { rotulo: 'Entrando',        cor: 'verde',    icone: 'fa-circle-check',       conta: false },
  nunca_entrou:     { rotulo: 'Nunca entrou',    cor: 'amarela',  icone: 'fa-hourglass-half',     conta: true  },
  bloqueado:        { rotulo: 'Bloqueado',       cor: 'vermelha', icone: 'fa-ban',                conta: true  },
  fora_do_hospital: { rotulo: 'Ponta solta',     cor: 'vermelha', icone: 'fa-link-slash',         conta: true  },
  sem_acesso:       { rotulo: 'Sem acesso',      cor: 'cinza',    icone: 'fa-minus',              conta: false }
};

function senhaSugerida(): string {
  /* ⚠️ A MESMA geração da tela de Usuários, com o mesmo alfabeto
     sem `i`, `l`, `o`, `0` e `1`. Senha provisória é ditada por
     telefone; caractere ambíguo vira o telefonema seguinte. */
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const n = new Uint32Array(10);
  crypto.getRandomValues(n);
  return Array.from(n, x => letras[x % letras.length]).join('');
}

function quando(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  return d.toLocaleDateString('pt-BR');
}

export function AcessoMedicos({ clienteId }: { clienteId: string }) {
  const { recado, avisar, fechar } = useAviso();

  const [linhas, setLinhas] = useState<AcessoDeMedico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [soProblema, setSoProblema] = useState(false);

  /* a folha de dar acesso */
  const [dando, setDando] = useState<AcessoDeMedico | null>(null);
  const [logins, setLogins] = useState<LoginParaMedico[]>([]);
  const [escolhido, setEscolhido] = useState('');
  const [salvando, setSalvando] = useState(false);

  /* redefinir senha: dois toques, como em Usuários */
  const [confirmando, setConfirmando] = useState('');
  const [senhaDada, setSenhaDada] = useState<{ quem: string; senha: string } | null>(null);

  async function carregar() {
    setCarregando(true); setErro('');
    try {
      setLinhas(await acessosDosMedicos(clienteId));
    } catch (e) {
      /* ⚠️ A função do banco RECUSA em voz alta quem não tem
         `core.usuarios`. Mostrar a frase dela é melhor que uma
         lista vazia: lista vazia é indistinguível de hospital
         sem médico nenhum. */
      setErro((e as Error).message ?? String(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregar(); }, [clienteId]);

  const vistas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return linhas.filter(l =>
      (!soProblema || ESTADOS[l.estado].conta) &&
      (!b || l.medico.toLowerCase().includes(b)
          || (l.pessoa ?? '').toLowerCase().includes(b)
          || (l.email ?? '').toLowerCase().includes(b)
          || (l.conselho ?? '').includes(b)));
  }, [linhas, busca, soProblema]);

  /* ⭐ Os contadores saem da MESMA lista que desenha — não de
     uma segunda contagem no servidor. Placar que conta sozinho
     discorda da lista no dia em que um filtro mudar. */
  const contas = useMemo(() => ({
    total:    linhas.length,
    entrando: linhas.filter(l => l.estado === 'entrando').length,
    nunca:    linhas.filter(l => l.estado === 'nunca_entrou').length,
    sem:      linhas.filter(l => l.estado === 'sem_acesso').length,
    problema: linhas.filter(l => ESTADOS[l.estado].conta).length
  }), [linhas]);

  async function abrirDar(l: AcessoDeMedico) {
    setDando(l); setEscolhido(l.usuario_id ?? ''); setLogins([]);
    try {
      setLogins(await loginsParaMedico(clienteId, l.recurso_id));
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    }
  }

  async function salvarAcesso() {
    if (!dando) return;
    setSalvando(true);
    try {
      const r = await ligarMedicoAoLogin(
        clienteId, dando.recurso_id, escolhido || null);
      avisar(r.mensagem, r.ok);
      if (r.ok) { setDando(null); await carregar(); }
    } catch (e) {
      avisar((e as Error).message ?? String(e), false);
    } finally {
      setSalvando(false);
    }
  }

  if (erro) {
    return (
      <div className="erro-caixa" data-aviso="sem-permissao">
        {erro}
      </div>
    );
  }

  return (
    <div data-tela="acessomedicos">
      <Aviso recado={recado} aoFechar={fechar} />

      <div className="cad-topo">
        <div>
          <h2>Acesso dos médicos</h2>
          <p>
            Quem entra pelo endereço <strong>/medico</strong> e cai direto na
            própria agenda. A senha é a <strong>mesma</strong> do painel — um
            login por pessoa, um lugar para destravar.
          </p>
        </div>
      </div>

      {/* ---------------- o placar ---------------- */}
      <div className="acm-placar" data-bloco="placar">
        <div className="acm-conta" data-conta="total">
          <strong>{contas.total}</strong><small>profissionais</small>
        </div>
        <div className="acm-conta verde" data-conta="entrando">
          <strong>{contas.entrando}</strong><small>entrando</small>
        </div>
        <div className="acm-conta amarela" data-conta="nunca">
          <strong>{contas.nunca}</strong><small>nunca entraram</small>
        </div>
        <div className="acm-conta cinza" data-conta="sem">
          <strong>{contas.sem}</strong><small>sem acesso</small>
        </div>
      </div>

      {/* ⭐ O aviso que é o motivo da tela existir. Ele fala
          SOZINHO, sem precisar que alguém filtre. */}
      {!carregando && contas.nunca > 0 && (
        <div className="dia-nota amarela" data-aviso="nunca-entraram">
          <strong>
            {contas.nunca === 1
              ? 'Um acesso foi criado e nunca usado.'
              : `${contas.nunca} acessos foram criados e nunca usados.`}
          </strong>
          <p>
            Ou a pessoa não sabe que o acesso existe, ou não precisa dele. Nos
            dois casos é uma senha viva sem dono atento — vale um telefonema.
            Para tirar: <strong>Trocar</strong> e escolher
            <em> — sem acesso —</em>.
          </p>
        </div>
      )}

      <div className="cad-busca">
        <i className="fas fa-search" />
        <input type="text" value={busca} data-campo="busca-acesso"
               onChange={e => setBusca(e.target.value)}
               placeholder="Buscar por nome, CRM ou e-mail…" />
      </div>

      <label className="cad-escolha" data-campo="so-problema">
        <input type="checkbox" checked={soProblema}
               onChange={e => setSoProblema(e.target.checked)} />
        Mostrar só o que pede atenção ({contas.problema})
      </label>

      {carregando && (
        <div className="loading-placeholder"><div className="spinner" /><p>Carregando…</p></div>
      )}

      {!carregando && !vistas.length && (
        <div className="med-vazio" data-aviso="lista-vazia">
          <i className="fas fa-key" />
          <strong>Nada aqui com esse filtro</strong>
          <p>Limpe a busca para ver a lista inteira.</p>
        </div>
      )}

      {/* ---------------- a lista ---------------- */}
      <div className="acm-lista">
        {vistas.map(l => {
          const e = ESTADOS[l.estado];
          return (
            <div key={l.recurso_id} className="acm-linha"
                 data-linha={l.recurso_id} data-estado={l.estado}>

              <div className="acm-quem">
                <strong>
                  {l.medico}
                  {!l.recurso_ativo &&
                    <span className="acm-inativo" data-marca="inativo">inativo</span>}
                </strong>
                <small>
                  {l.conselho ? `CRM ${l.conselho}` : 'sem conselho no cadastro'}
                  {l.tipo === 'equipamento' && ' · aparelho'}
                </small>
              </div>

              <div className="acm-login">
                {l.usuario_id ? (
                  <>
                    <span data-campo="pessoa">{l.pessoa}</span>
                    <small data-campo="email">{l.email}</small>
                  </>
                ) : (
                  <span className="acm-nenhum">— nenhum login ligado</span>
                )}
              </div>

              <div className={`acm-estado ${e.cor}`} data-campo="estado">
                <span><i className={`fas ${e.icone}`} /> {e.rotulo}</span>
                {l.estado === 'entrando' && l.ultimo_acesso && (
                  <small data-campo="ultimo">{quando(l.ultimo_acesso)}</small>
                )}
              </div>

              <div className="acm-acoes">
                <button className="btn-secondary btn-sm"
                        data-acao="dar-acesso" onClick={() => void abrirDar(l)}>
                  <i className="fas fa-link" />{' '}
                  {l.usuario_id ? 'Trocar' : 'Dar acesso'}
                </button>

                {/* ⚠️ "Redefinir senha" só aparece para quem TEM
                    login. Sem login não existe senha para
                    redefinir, e um botão que recusa sempre é um
                    botão quebrado aos olhos de quem aperta. */}
                {l.usuario_id && (
                  senhaDada?.quem === l.recurso_id ? (
                    <span className="acm-senha" data-campo="senha-redefinida">
                      {senhaDada.senha}
                    </span>
                  ) : (
                    <button
                      className={confirmando === l.recurso_id
                        ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                      data-acao="redefinir-senha"
                      onBlur={() => setConfirmando('')}
                      onClick={async () => {
                        if (confirmando !== l.recurso_id) {
                          setConfirmando(l.recurso_id); return;
                        }
                        const nova = senhaSugerida();
                        const r = await redefinirSenha(
                          clienteId, l.usuario_id!, nova);
                        setConfirmando('');
                        if (r.ok) setSenhaDada({ quem: l.recurso_id, senha: nova });
                        else avisar(r.mensagem, false);
                      }}>
                      <i className="fas fa-key" />{' '}
                      {confirmando === l.recurso_id ? 'Confirmar' : 'Senha'}
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ---------------- a folha de dar acesso ---------------- */}
      {dando && (
        /* ⚠️ `modal` / `modal-overlay` / `modal-content` são as
           classes QUE EXISTEM no estilo.css — conferidas, não
           supostas. Classe de CSS que não existe não dá erro:
           a folha abriria sem fundo, encavalada no texto, e a
           prova de tela acharia tudo o que procura. */
        <div className="modal" data-modal="dar-acesso">
          <div className="modal-overlay" onClick={() => setDando(null)} />
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Acesso de {dando.medico}</h3>
              <button onClick={() => setDando(null)} aria-label="Fechar">
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="modal-body" data-bloco="folha-acesso">
              <p className="wiz-dica">
                Quem está nesta lista já tem login neste hospital. Para alguém
                que ainda não tem, crie primeiro em <strong>Usuários</strong>.
              </p>

              <div className="form-group">
                <label htmlFor="acm-login">Entra como</label>
                <select id="acm-login" value={escolhido}
                        data-campo="login-escolhido"
                        onChange={ev => setEscolhido(ev.target.value)}>
                  <option value="">— sem acesso —</option>
                  {logins.map(u => (
                    <option key={u.usuario_id} value={u.usuario_id}>
                      {u.nome} · {u.email}
                    </option>
                  ))}
                </select>
              </div>

              {!logins.length && (
                <div className="dia-nota amarela" data-aviso="sem-logins">
                  Ninguém disponível: todos os logins deste hospital já estão
                  ligados a outro profissional.
                </div>
              )}

              <div className="form-actions">
                <button className="btn-secondary" data-acao="fechar-folha"
                        onClick={() => setDando(null)}>Voltar</button>
                <button className="btn-primary" data-acao="salvar-acesso"
                        disabled={salvando} onClick={() => void salvarAcesso()}>
                  {salvando ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
