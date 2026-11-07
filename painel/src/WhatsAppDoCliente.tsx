import { useEffect, useState } from 'react';
import {
  modelosDoCliente, salvarModeloWhatsApp, contagemDasMensagens,
  numerosDoCliente, salvarNumeroWhatsapp, mudarEstadoDoNumero, excluirNumeroWhatsapp,
  modelosDoSistema, ensaioDosAvisos, ligarMotorDeAvisos, configDoCliente,
  type ModeloWhatsApp, type NumeroWhatsApp, type ModeloDoSistema, type DecisaoDeAviso
} from './dados';

const ROTULO_ESTADO: Record<NumeroWhatsApp['estado'], string> = {
  NO_AR: 'no ar', RESTRITO: 'restrito', BANIDO: 'banido', DESLIGADO: 'desligado'
};
const VAZIO_NUMERO = { id: null as string | null, nome: '', phoneNumberId: '', wabaId: '',
                       papel: 'PRINCIPAL' as 'PRINCIPAL' | 'RESERVA', prioridade: 1, token: '' };

/**
 * ============================================================
 *  WHATSAPP DE UM HOSPITAL
 *
 *  13/10/2026, o Tom: *"lembrando que os modelos aprovados são
 *  os do número que estamos usando no apps script. Mas os
 *  modelos de outros hospitais precisarão ser aprovados."*
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ ESSA FRASE É A TELA INTEIRA
 *
 *  Modelo de WhatsApp não é do sistema — é do NÚMERO. A Meta
 *  aprova por conta (WABA), uma a uma, com dias de espera.
 *
 *  Se eu tivesse feito o óbvio — uma lista de modelos no código,
 *  igual para todo mundo — o St James funcionaria no primeiro
 *  dia e o segundo hospital quebraria em silêncio: o envio
 *  diria "enviada", a Meta recusaria, e o paciente não receberia
 *  nada. Pior: recusa conta como falha de entrega, e número com
 *  falha demais perde qualidade e para de enviar.
 *
 *  Por isso cada hospital tem a sua lista, e um hospital sem
 *  modelo cadastrado **não envia** — com essa frase na recusa.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐ O TOKEN ENTRA AQUI E NUNCA MAIS SAI
 *
 *  O que volta do banco é `••••4f2a`. O valor inteiro só é lido
 *  pela Edge Function, com a chave de serviço, fora do
 *  navegador. Nem o administrador do hospital alcança a linha
 *  — a política é `sou_plataforma()` dos dois lados, e isso
 *  está provado no `teste_isolamento.sql`.
 *
 *  ------------------------------------------------------------
 *  ⭐ AS VARIÁVEIS SÃO CONTADAS, NÃO CONFERIDAS
 *
 *  O banco compara QUANTAS variáveis o modelo tem com quantas
 *  vieram. Não dá para conferir o conteúdo: a Meta aprovou um
 *  texto que este sistema não lê. Contar já evita o erro mais
 *  comum — um modelo de 5 campos recebendo 4.
 * ============================================================
 */

/* ⚠️ 22/10: a lista dos modelos do sistema SAIU daqui. Ela mora no
   banco (`modelos_do_sistema`, no 048) — a tela tinha uma lista e o
   motor de avisos esperava outra, e um modelo cadastrado aqui não
   servia para o motor. */

export function WhatsAppDoCliente({
  clienteId, nomeDoCliente, ehDemo, aoAvisar
}: {
  clienteId: string;
  nomeDoCliente: string;
  ehDemo: boolean;
  aoAvisar: (mensagem: string, bom: boolean) => void;
}) {
  /* ⭐⭐⭐ 22/10: os NÚMEROS do hospital (principal e reservas), no
     lugar dos três segredos soltos de WhatsApp — o formato antigo
     que o `043` substituiu. Dois jeitos de cadastrar o mesmo número
     seriam duas respostas para "por onde este hospital fala?". */
  const [numeros, setNumeros] = useState<NumeroWhatsApp[]>([]);
  const [fNum, setFNum] = useState({ ...VAZIO_NUMERO });
  const [editandoNum, setEditandoNum] = useState(false);
  /** ⭐ 23/10: excluir em DUAS etapas — o primeiro clique só pergunta. */
  const [excluindo, setExcluindo] = useState('');
  const [modelos, setModelos] = useState<ModeloWhatsApp[]>([]);
  const [sistema, setSistema] = useState<ModeloDoSistema[]>([]);
  /* ⭐⭐⭐ O motor de avisos: nasce DESLIGADO. O ensaio mostra o
     que ele faria agora, sem enviar nada. */
  const [ensaio, setEnsaio] = useState<DecisaoDeAviso[]>([]);
  const [motorLigado, setMotorLigado] = useState(false);
  const [fila, setFila] = useState<Record<string, number>>({});
  const [nomeMeta, setNomeMeta] = useState<Record<string, string>>({});
  const [indo, setIndo] = useState('');
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let valido = true;
    Promise.all([
      numerosDoCliente(clienteId),
      modelosDoCliente(clienteId),
      contagemDasMensagens(clienteId),
      modelosDoSistema(),
      ensaioDosAvisos(clienteId),
      configDoCliente(clienteId)
    ])
      .then(([nums, m, f, sis, ens, cfg]) => {
        if (!valido) return;
        setNumeros(nums);
        setSistema(sis);
        setEnsaio(ens);
        const av = cfg['avisos'] as { ligado?: boolean } | undefined;
        setMotorLigado(av?.ligado === true);
        setModelos(m);
        setFila(f);
        const n: Record<string, string> = {};
        for (const x of m) n[x.chave] = x.nome_meta;
        setNomeMeta(n);
      })
      .catch(e => { if (valido) aoAvisar((e as Error).message ?? String(e), false); });
    return () => { valido = false; };
  }, [clienteId, recarga]);

  async function salvarNumero() {
    if (indo) return;
    setIndo('numero');
    try {
      const r = await salvarNumeroWhatsapp({ clienteId, ...fNum });
      aoAvisar(r.mensagem, r.ok);
      if (r.ok) {
        // ⭐ O campo do token volta VAZIO: o segredo não fica na tela.
        setFNum({ ...VAZIO_NUMERO }); setEditandoNum(false);
        setRecarga(n => n + 1);
      }
    } catch (e) {
      aoAvisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo('');
    }
  }

  async function alternarMotor() {
    if (indo) return;
    setIndo('motor');
    try {
      const r = await ligarMotorDeAvisos(clienteId, !motorLigado);
      aoAvisar(r.mensagem, r.ok);
      if (r.ok) setRecarga(n => n + 1);
    } catch (e) {
      aoAvisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo('');
    }
  }

  async function excluir(n: NumeroWhatsApp) {
    if (excluindo !== n.id) { setExcluindo(n.id); return; }
    setExcluindo('');
    setIndo('excluir-' + n.id);
    try {
      const r = await excluirNumeroWhatsapp(n.id);
      aoAvisar(r.mensagem, r.ok);
      if (r.ok) setRecarga(x => x + 1);
    } catch (e) {
      aoAvisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo('');
    }
  }

  async function mudarEstado(n: NumeroWhatsApp, estado: NumeroWhatsApp['estado']) {
    if (indo) return;
    setIndo('estado-' + n.id);
    try {
      const r = await mudarEstadoDoNumero(n.id, estado,
        estado === 'NO_AR' ? 'religado pela plataforma' : 'desligado pela plataforma');
      aoAvisar(r.mensagem, r.ok);
      if (r.ok) setRecarga(x => x + 1);
    } catch (e) {
      aoAvisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo('');
    }
  }

  async function guardarModelo(chave: string, variaveis: string[]) {
    const nome = (nomeMeta[chave] ?? '').trim();
    if (indo) return;
    setIndo(chave);
    try {
      const r = await salvarModeloWhatsApp({
        clienteId, chave, nomeMeta: nome, variaveis
      });
      aoAvisar(r.mensagem, r.ok);
      if (r.ok) setRecarga(n => n + 1);
    } catch (e) {
      aoAvisar((e as Error).message ?? String(e), false);
    } finally {
      setIndo('');
    }
  }

  const temToken = numeros.some(n => n.estado === 'NO_AR' && !!n.token_fim);
  const aprovados = modelos.filter(m => m.ativo).length;

  return (
    <>
      <h4 className="cli-secao">WhatsApp deste hospital</h4>

      {/* ⭐⭐⭐ O estado, numa frase, antes de qualquer campo. */}
      <div className={'dia-nota ' + (ehDemo ? 'azul' : temToken && aprovados ? 'verde' : 'amarela')}
           data-aviso="estado-whatsapp">
        {ehDemo ? (
          <>
            <strong>Este é o cliente de demonstração.</strong>
            <p>
              A fila dele nasce <strong>SIMULADA</strong>: a mensagem aparece na
              tela com o texto exato, e nenhuma sai de verdade. É uma trava do
              banco, não uma escolha desta tela — mesmo com token cadastrado,
              nada é enviado.
            </p>
          </>
        ) : !temToken ? (
          <>
            <strong>Este hospital ainda não envia nada.</strong>
            <p>
              Falta um número no ar, com token. Enquanto faltar, as mensagens
              ficam PENDENTES na fila — nenhuma se perde, e nenhuma sai.
            </p>
          </>
        ) : !aprovados ? (
          <>
            <strong>O número está configurado, mas não há modelo aprovado.</strong>
            <p>
              A Meta só entrega mensagem feita a partir de um modelo que{' '}
              <strong>este número</strong> tem aprovado. Cadastre abaixo o nome
              exato de cada um, como aparece no painel da Meta.
            </p>
          </>
        ) : (
          <>
            <strong>{nomeDoCliente} envia pelo WhatsApp.</strong>
            <p>
              {aprovados} modelo(s) aprovado(s) neste número.
              {fila.PENDENTE ? ` ${fila.PENDENTE} na fila para sair.` : ''}
              {fila.FALHOU ? ` ${fila.FALHOU} com falha.` : ''}
            </p>
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════
          ⭐⭐⭐ OS NÚMEROS   (22/10/2026)
          Principal e reservas. Avisos de atendimento saem pelo
          primeiro número no ar; campanhas, só pelo principal.
          ════════════════════════════════════════════════════════ */}
      <div data-bloco="numeros-whatsapp">
        {!numeros.length ? (
          <p className="cad-rodape" data-aviso="sem-numeros">Nenhum número cadastrado.</p>
        ) : (
          <div className="cad-lista">
            {numeros.map(n => (
              <div key={n.id} className="cad-linha" data-numero={n.id} data-estado={n.estado}>
                <div>
                  <strong>{n.nome}</strong>{' '}
                  <em className={'cad-tag ' + (n.estado === 'NO_AR' ? 'ok' : 'off')}>
                    {n.papel === 'PRINCIPAL' ? 'principal' : 'reserva ' + n.prioridade} · {ROTULO_ESTADO[n.estado]}
                  </em>
                  <small style={{ display: 'block' }}>
                    id {n.phone_number_id} · conta {n.waba_id} ·{' '}
                    <span data-campo="token-fim">{n.token_fim ? 'token ' + n.token_fim : 'SEM token'}</span>
                    {n.estado_motivo && <> · {n.estado_motivo}</>}
                  </small>
                </div>
                <div className="cad-botoes">
                  <button className="btn-secondary btn-sm" data-acao="editar-numero"
                          onClick={() => { setEditandoNum(true); setFNum({ id: n.id, nome: n.nome,
                            phoneNumberId: n.phone_number_id, wabaId: n.waba_id, papel: n.papel,
                            prioridade: n.prioridade, token: '' }); }}>
                    <i className="fas fa-pen" /> Editar
                  </button>
                  {n.estado !== 'NO_AR' && (
                    <button className="btn-secondary btn-sm" data-acao="religar-numero"
                            disabled={!!indo} onClick={() => void mudarEstado(n, 'NO_AR')}>
                      <i className="fas fa-plug" /> Religar
                    </button>
                  )}
                  {/* ⭐ 23/10: para mudar um número de hospital sem SQL digitado à mão. */}
                  <button className={excluindo === n.id ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                          data-acao="excluir-numero" disabled={!!indo}
                          onBlur={() => setExcluindo('')}
                          onClick={() => void excluir(n)}>
                    <i className="fas fa-trash" /> {excluindo === n.id ? 'Confirmar exclusão' : 'Excluir'}
                  </button>
                  {n.estado !== 'DESLIGADO' && (
                    <button className="btn-secondary btn-sm" data-acao="desligar-numero"
                            disabled={!!indo} onClick={() => void mudarEstado(n, 'DESLIGADO')}>
                      <i className="fas fa-power-off" /> Desligar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!editandoNum ? (
          <button className="btn-secondary" data-acao="novo-numero"
                  onClick={() => { setFNum({ ...VAZIO_NUMERO,
                    papel: numeros.some(n => n.papel === 'PRINCIPAL' && n.estado !== 'DESLIGADO') ? 'RESERVA' : 'PRINCIPAL',
                    prioridade: numeros.length + 1 }); setEditandoNum(true); }}>
            <i className="fas fa-plus" /> Cadastrar número
          </button>
        ) : (
          <div className="cad-bloco" data-bloco="form-numero">
            <div className="form-group">
              <label>Nome no painel</label>
              <input type="text" data-campo="numero-nome" value={fNum.nome} maxLength={80}
                     placeholder="Principal (11) 3336-6600"
                     onChange={e => setFNum(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="cad-dupla">
              <div className="form-group" style={{ flex: 1 }}>
                <label>ID do número (phone_number_id)</label>
                <input type="text" data-campo="numero-phone-id" value={fNum.phoneNumberId}
                       onChange={e => setFNum(f => ({ ...f, phoneNumberId: e.target.value }))} />
                <small className="form-dica">NÃO é o telefone: é o id comprido ao lado dele no painel da Meta.</small>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>ID da conta (WABA)</label>
                <input type="text" data-campo="numero-waba" value={fNum.wabaId}
                       onChange={e => setFNum(f => ({ ...f, wabaId: e.target.value }))} />
              </div>
            </div>
            <div className="cad-dupla">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Papel</label>
                <select data-campo="numero-papel" value={fNum.papel}
                        onChange={e => setFNum(f => ({ ...f, papel: e.target.value as 'PRINCIPAL' | 'RESERVA' }))}>
                  <option value="PRINCIPAL">Principal</option>
                  <option value="RESERVA">Reserva</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Prioridade (1 = primeiro a tentar)</label>
                <input type="number" min={1} data-campo="numero-prioridade" value={fNum.prioridade}
                       onChange={e => setFNum(f => ({ ...f, prioridade: Number(e.target.value) || 1 }))} />
              </div>
            </div>
            <div className="form-group">
              <label>Token permanente da Meta</label>
              <input type="password" autoComplete="new-password" data-campo="numero-token"
                     value={fNum.token}
                     placeholder={fNum.id ? 'deixe vazio para manter o que está guardado' : 'começa com EAA'}
                     onChange={e => setFNum(f => ({ ...f, token: e.target.value }))} />
            </div>
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => { setEditandoNum(false); setFNum({ ...VAZIO_NUMERO }); }}>
                Voltar
              </button>
              <button className="btn-primary" data-acao="salvar-numero" disabled={!!indo}
                      onClick={() => void salvarNumero()}>
                <i className="fas fa-check" /> Salvar número
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════
          ⭐⭐⭐ O MOTOR DE AVISOS   (22/10/2026)
          Confirmação, 24h, o reenvio de 5h e 2h — com os modelos
          aprovados abaixo. NASCE DESLIGADO: liga-se no dia da troca,
          junto com o desligamento dos gatilhos do Apps Script.
          ════════════════════════════════════════════════════════ */}
      <div className="cad-bloco" data-bloco="motor-de-avisos">
        <h4><i className="fas fa-bell" /> Motor de avisos</h4>
        <div className={'dia-nota ' + (motorLigado ? 'verde' : 'amarela')} data-aviso="estado-motor">
          <strong>{motorLigado ? 'LIGADO: os avisos vão para a fila de envio.'
                               : 'Desligado: só o ensaio funciona — nada vai para a fila.'}</strong>
          <p>
            {motorLigado
              ? 'Desligue se precisar parar tudo de uma vez.'
              : 'Ligue só no dia da troca, junto com o desligamento dos gatilhos do Apps Script: dois sistemas mandando o mesmo lembrete é o pior começo.'}
          </p>
          <button className={motorLigado ? 'btn-secondary' : 'btn-primary'} data-acao="alternar-motor"
                  disabled={!!indo} onClick={() => void alternarMotor()}>
            <i className="fas fa-power-off" /> {motorLigado ? 'Desligar o motor' : 'Ligar o motor'}
          </button>
        </div>

        <strong className="cad-subtitulo">Ensaio — o que o motor faria agora</strong>
        {!ensaio.length ? (
          <p className="cad-rodape" data-aviso="ensaio-vazio">
            Nenhuma consulta na hora de aviso agora (próximas 26h e marcações recentes).
          </p>
        ) : (
          <div className="mod-ensaio" data-lista="ensaio">
            {ensaio.map(d => (
              <div key={d.agendamento_id + d.tipo} className={'mod-ensaio-linha' + (d.enviar ? ' sai' : '')}
                   data-ensaio={d.tipo} data-enviar={d.enviar ? 'sim' : 'nao'}>
                <span><strong>{d.paciente}</strong> · {d.tipo} · em {d.horas_para}h</span>
                <small>{d.enviar ? 'sairia agora' : d.motivo}</small>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ⭐⭐ Dizer que o valor não volta, para ninguém procurar
          onde "ver o token" e concluir que o sistema o perdeu. */}
      <p className="cad-rodape" data-aviso="token-nao-volta">
        O token que você digita <strong>não volta nunca mais</strong> — a tela só
        mostra os quatro últimos caracteres, para conferir que é o certo. Quem
        lê o valor inteiro é o servidor, na hora de enviar.
      </p>

      {/* ---------------- os modelos ---------------- */}
      <h4 className="cli-secao">Modelos aprovados neste número</h4>

      <p className="cad-rodape" data-aviso="modelo-e-do-numero">
        Modelo é do <strong>número</strong>, não do MedCalendar. O que está
        aprovado no número do St James não vale para outro hospital — cada um
        aprova os seus na Meta, e cadastra aqui o nome exato.
      </p>

      {sistema.map(m => {
        const jaTem = modelos.find(x => x.chave === m.chave);
        const confere = !jaTem
          || (jaTem.variaveis?.length ?? 0) === m.variaveis.length;
        return (
          <div key={m.chave} className={'mod-linha' + (jaTem?.ativo ? ' ligado' : '')}
               data-modelo={m.chave} data-aprovado={jaTem?.ativo ? '1' : '0'}>
            <div className="mod-cabeca">
              <strong>{m.rotulo}</strong>
              <span className="cad-tags">
                {jaTem?.ativo
                  ? <em className="cad-tag" data-tag="aprovado">aprovado</em>
                  : <em className="cad-tag off" data-tag="sem-modelo">sem modelo</em>}
                <em className="cad-tag neutro" data-tag="variaveis">
                  {m.variaveis.length} variáveis
                </em>
              </span>
            </div>
            <small className="form-dica">{m.quando}</small>
            <div className="seg-linha">
              <input type="text" data-campo={'modelo-' + m.chave}
                     value={nomeMeta[m.chave] ?? ''}
                     placeholder="nome_exato_na_meta"
                     onChange={e => setNomeMeta(n => ({ ...n, [m.chave]: e.target.value }))} />
              <button className="btn-secondary btn-sm"
                      data-acao={'guardar-modelo-' + m.chave}
                      disabled={indo === m.chave || !(nomeMeta[m.chave] ?? '').trim()}
                      onClick={() => guardarModelo(m.chave, m.variaveis)}>
                {indo === m.chave
                  ? <i className="fas fa-circle-notch fa-spin" />
                  : <><i className="fas fa-check" /> Guardar</>}
              </button>
            </div>
            <small className="form-dica">
              A ordem das variáveis é: {m.variaveis.map(v => `{{${v}}}`).join(' · ')}.
              O corpo aprovado na Meta tem que usá-las nessa ordem.
            </small>
            {!confere && (
              <div className="dia-nota vermelha" data-erro="variaveis">
                <strong>O modelo cadastrado tem outra quantidade de variáveis.</strong>
                <p>
                  A Meta recusaria o envio, e recusa conta como falha de entrega
                  — o que derruba a qualidade do número.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
