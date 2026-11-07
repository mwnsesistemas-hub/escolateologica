import { useMemo, useState } from 'react';
import {
  lerPerguntas, validarEntrevista, porQueNaoDaParaApagar, mover,
  paraGravar, novaPergunta, calcularImc, lerAltura, lerPeso,
  TIPOS, ID_PESO, ID_ALTURA,
  type PerguntaDaEntrevista, type TipoDePergunta
} from '../../nucleo/entrevista';

/**
 * ============================================================
 *  A ENTREVISTA DE ELEGIBILIDADE — o editor
 *
 *  10/10/2026, o Tom: *"lembrando que a entrevista nos exames
 *  não tem tela de edição"*, e logo depois: *"eu escolho o tipo
 *  de pergunta: de sim e não, texto livre, IMC, número"*.
 *
 *  ------------------------------------------------------------
 *  ⚠️ O QUE ESTAVA NO LUGAR DISTO, E POR QUE ERA PIOR QUE NADA
 *
 *  A Gestão de Exames de 09/10 tinha um `textarea`: uma pergunta
 *  por linha, lido com `.join('\n')`.
 *
 *  As perguntas do St James são objetos com tipo. O `.join`
 *  sobre objetos escreve `[object Object]` — e salvar ali
 *  trocaria as **21 perguntas** da endoscopia e da colonoscopia
 *  por três palavras sem sentido.
 *
 *  Toda a regra mora em `nucleo/entrevista.ts`, com 38 testes e
 *  6 mutantes. Aqui só tem tela.
 * ============================================================
 */

export function Entrevista({ nome, perguntasBrutas, aoFechar, aoSalvar }: {
  nome: string;
  perguntasBrutas: unknown;
  aoFechar: () => void;
  aoSalvar: (perguntas: unknown[]) => Promise<void> | void;
}) {
  const leitura = useMemo(() => lerPerguntas(perguntasBrutas), [perguntasBrutas]);
  const [lista, setLista] = useState<PerguntaDaEntrevista[]>(leitura.perguntas);
  const [recusa, setRecusa] = useState('');
  const [indo, setIndo] = useState(false);

  // ⭐ A prévia do IMC usa os MESMOS números que a recepção vai
  //    digitar — é a única forma de ver se a conta está certa
  //    antes de alguém usar com paciente na frente.
  const [pesoTeste, setPesoTeste] = useState('70');
  const [alturaTeste, setAlturaTeste] = useState('1,68');

  const erros = useMemo(() => validarEntrevista(lista), [lista]);
  const erroDe = (id: string) => erros.find(e => e.id === id)?.frase;
  const errosGerais = erros.filter(e => e.id === null);

  const temImc = lista.some(p => p.tipo === 'imc');
  const alturaLida = lerAltura(alturaTeste);
  const pesoLido = lerPeso(pesoTeste);
  const imcPrevia = calcularImc(pesoTeste, alturaTeste);

  const mexer = (id: string, mud: Partial<PerguntaDaEntrevista>) =>
    setLista(l => l.map(p => (p.id === id ? { ...p, ...mud } : p)));

  function apagar(id: string) {
    const porque = porQueNaoDaParaApagar(lista, id);
    if (porque) { setRecusa(porque); return; }
    setRecusa('');
    setLista(l => l.filter(p => p.id !== id));
  }

  function acrescentar(tipo: TipoDePergunta) {
    const nova = novaPergunta(tipo);
    // ⭐ O IMC precisa de peso e altura com identificador certo.
    //    Criar os três juntos é o que impede alguém de pôr o IMC
    //    sozinho e só descobrir no Salvar que falta coisa.
    if (tipo === 'imc' && !temImc) {
      const faltam: PerguntaDaEntrevista[] = [];
      if (!lista.some(p => p.id === ID_PESO)) {
        faltam.push({ id: ID_PESO, pergunta: 'Qual seu peso em kg?', tipo: 'numero' });
      }
      if (!lista.some(p => p.id === ID_ALTURA)) {
        faltam.push({ id: ID_ALTURA, pergunta: 'Qual sua altura?', tipo: 'numero' });
      }
      setLista(l => [...faltam, ...l, { ...nova, id: 'imc_calc',
        pergunta: 'IMC calculado automaticamente' }]);
      return;
    }
    setLista(l => [...l, nova]);
  }

  async function salvar() {
    if (erros.length) return;
    setIndo(true);
    try { await aoSalvar(paraGravar(lista)); }
    finally { setIndo(false); }
  }

  return (
    <div className="modal" data-modal="entrevista">
      <div className="modal-overlay" onClick={aoFechar} />
      <div className="modal-content" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <h3>Entrevista: {nome}</h3>
          <button onClick={aoFechar} aria-label="Fechar">
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="modal-body">
          <p className="wiz-dica" style={{ marginTop: 0 }}>
            As perguntas que a equipe lê <strong>antes</strong> de dar horário.
            Na endoscopia e na colonoscopia elas são triagem de risco
            anestésico — é por elas que se decide se dá para sedar.
          </p>

          {/* ⚠️ O QUE A LEITURA NÃO ENTENDEU.
              ──────────────────────────────
              Se alguém salvou na tela quebrada de 09/10, as
              perguntas viraram "[object Object]". A tela não
              tenta adivinhar o que se perdeu — ninguém consegue.
              Ela DIZ, para a pessoa saber que precisa redigitar. */}
          {!!leitura.achados.length && (
            <div className="dia-nota amarela" data-aviso="entrevista-achados">
              <strong>
                {leitura.achados.length === 1
                  ? '1 linha não pôde ser lida'
                  : `${leitura.achados.length} linhas não puderam ser lidas`}
              </strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {leitura.achados.map((a, i) => (
                  <li key={i}>linha {a.onde + 1}: {a.oQue}</li>
                ))}
              </ul>
            </div>
          )}

          {!!recusa && (
            <div className="dia-nota amarela" data-recusa="apagar">{recusa}</div>
          )}

          {errosGerais.map((e, i) => (
            <div key={i} className="dia-nota amarela" data-erro="entrevista">
              {e.frase}
            </div>
          ))}

          {/* ---------------- a lista ---------------- */}
          <div className="ent-lista" data-lista="perguntas">
            {lista.map((p, i) => {
              const erro = erroDe(p.id);
              const ehImc = p.tipo === 'imc';
              return (
                <div key={p.id}
                     className={'ent-linha' + (erro ? ' com-erro' : '')}
                     data-pergunta={p.id}>
                  <span className="ent-numero">{i + 1}</span>

                  <div className="ent-corpo">
                    <input type="text" value={p.pergunta} maxLength={200}
                           data-campo="texto"
                           placeholder="Escreva a pergunta…"
                           onChange={e => mexer(p.id, { pergunta: e.target.value })} />

                    <div className="ent-opcoes">
                      <select value={p.tipo} data-campo="tipo"
                              onChange={e => mexer(p.id, {
                                tipo: e.target.value as TipoDePergunta,
                                // Trocar de tipo apaga a marca que não vale
                                // mais: "Não" não existe em texto.
                                invertida: e.target.value === 'sim_nao'
                                  ? p.invertida : false
                              })}>
                        {TIPOS.map(t => (
                          <option key={t.valor} value={t.valor}>{t.rotulo}</option>
                        ))}
                      </select>

                      <span className="ent-ajuda">
                        {TIPOS.find(t => t.valor === p.tipo)?.ajuda}
                      </span>

                      {/* ⭐ A MARCA DE ATENÇÃO — e o que ela NÃO faz.
                          No sistema de hoje ela se chama "bloqueante"
                          e está false nas 21 perguntas: existe e nunca
                          foi usada.

                          O Tom, em 10/10: *"acho melhor o setor receber
                          a solicitação e providenciar a agenda"*. Ou
                          seja, ninguém marca sozinho — uma trava
                          automática seria uma segunda decisão sobre
                          algo que já tem dono.

                          Então ela DESTACA, e não barra. E o nome diz
                          isso: campo que promete bloquear e não
                          bloqueia é o defeito que este projeto caça. */}
                      {p.tipo === 'sim_nao' && (
                        <>
                          <label className="ent-check">
                            <input type="checkbox" checked={!!p.atencao}
                                   data-campo="atencao"
                                   onChange={e => mexer(p.id, { atencao: e.target.checked })} />
                            Pede atenção da equipe
                          </label>
                          {p.atencao && (
                            <label className="ent-check">
                              <input type="checkbox" checked={!!p.invertida}
                                     data-campo="invertida"
                                     onChange={e => mexer(p.id, { invertida: e.target.checked })} />
                              quando responder <strong>Não</strong>
                            </label>
                          )}
                        </>
                      )}
                    </div>

                    {/* ⭐⭐ O IMC DIZ DE ONDE TIRA AS MEDIDAS.
                        Sem esta linha, a dependência fica invisível e
                        alguém apaga o peso achando que é só mais uma
                        pergunta. */}
                    {ehImc && (
                      <p className="ent-dependencia" data-marca="imc-usa">
                        <i className="fas fa-link" /> Calculado de{' '}
                        <strong>{lista.find(x => x.id === ID_PESO)?.pergunta ?? 'peso'}</strong>
                        {' '}e{' '}
                        <strong>{lista.find(x => x.id === ID_ALTURA)?.pergunta ?? 'altura'}</strong>.
                        Ninguém responde este campo.
                      </p>
                    )}

                    {!!erro && (
                      <p className="ent-erro" data-erro="pergunta">{erro}</p>
                    )}
                  </div>

                  <div className="ent-botoes">
                    <button type="button" data-acao="subir" title="Subir"
                            disabled={i === 0}
                            onClick={() => setLista(l => mover(l, p.id, -1))}>
                      <i className="fas fa-chevron-up" />
                    </button>
                    <button type="button" data-acao="descer" title="Descer"
                            disabled={i === lista.length - 1}
                            onClick={() => setLista(l => mover(l, p.id, 1))}>
                      <i className="fas fa-chevron-down" />
                    </button>
                    <button type="button" data-acao="apagar" title="Apagar"
                            className="ent-apagar"
                            onClick={() => apagar(p.id)}>
                      <i className="fas fa-trash" />
                    </button>
                  </div>
                </div>
              );
            })}

            {!lista.length && (
              <p className="wiz-dica" data-vazio="perguntas">
                Nenhuma pergunta ainda. Escolha um tipo abaixo.
              </p>
            )}
          </div>

          {/* ---------------- acrescentar ---------------- */}
          <div className="ent-novas">
            {TIPOS.map(t => (
              <button key={t.valor} type="button" className="btn-secondary btn-sm"
                      data-acao={'nova-' + t.valor}
                      disabled={t.valor === 'imc' && temImc}
                      title={t.valor === 'imc' && temImc
                        ? 'Já existe um IMC automático nesta entrevista.' : t.ajuda}
                      onClick={() => acrescentar(t.valor)}>
                <i className="fas fa-plus" /> {t.rotulo}
              </button>
            ))}
          </div>

          {/* ════════════════════════════════════════════════════
              ⭐⭐⭐ A PRÉVIA DO IMC — "1,68" OU "168"?

              O Tom, em 10/10: *"lembra de deixar o campo
              digitável do IMC em cm ou m. Porque o povo confunde
              e responde 1,68."*

              Está certo, e é certeza e não hipótese: a pergunta
              pede centímetros e o hábito manda metros.

              O campo aceita os dois — e DIZ o que entendeu. Uma
              correção silenciosa transformaria o acerto em
              sorte: no dia em que a faixa errasse, ninguém
              saberia.
              ════════════════════════════════════════════════════ */}
          {temImc && (
            <div className="ent-imc" data-bloco="imc-previa">
              <strong>Confira a conta do IMC</strong>
              <p>
                Escreva um peso e uma altura como a recepção escreveria. O
                campo entende <strong>1,68</strong> e <strong>168</strong>, e
                mostra o que entendeu.
              </p>
              <div className="ent-imc-campos">
                <label>
                  Peso
                  <input type="text" value={pesoTeste} data-campo="peso-teste"
                         onChange={e => setPesoTeste(e.target.value)} />
                </label>
                <label>
                  Altura
                  <input type="text" value={alturaTeste} data-campo="altura-teste"
                         onChange={e => setAlturaTeste(e.target.value)} />
                </label>
                <span className="ent-imc-saida" data-saida="imc">
                  {pesoLido.recusa ?? alturaLida.recusa ?? (
                    imcPrevia === null
                      ? 'preencha os dois'
                      : <>entendi <strong>{alturaLida.comoLeu}</strong> — IMC{' '}
                         <strong>{String(imcPrevia).replace('.', ',')}</strong></>
                  )}
                </span>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button className="btn-secondary" onClick={aoFechar} disabled={indo}>
              Voltar
            </button>
            <button className="btn-primary" data-acao="salvar-entrevista"
                    disabled={indo || erros.length > 0} onClick={salvar}>
              {indo
                ? <><i className="fas fa-circle-notch fa-spin" /> Salvando…</>
                : <><i className="fas fa-check" /> Salvar entrevista</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
