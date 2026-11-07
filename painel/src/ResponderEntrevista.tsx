import { useMemo } from 'react';
import {
  lerPerguntas, faltamRespostas, pedeAtencao, imcDasRespostas,
  lerAltura, lerPeso, ID_PESO, ID_ALTURA, SIM, NAO,
  type RespostasDaEntrevista
} from '../../nucleo/entrevista';

/**
 * ============================================================
 *  RESPONDER A ENTREVISTA
 *
 *  11/10/2026. As 21 perguntas do St James existiam no cadastro
 *  desde a importação, e **nenhuma tela as perguntava a
 *  ninguém**. Este é o formulário que faltava.
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ "1,68" OU "168" — O TOM AVISOU, E ELE TINHA RAZÃO
 *
 *  *"Lembra de deixar o campo digitável do IMC em cm ou m.
 *  Porque o povo confunde e responde 1,68."*
 *
 *  Se a conta confiasse no enunciado:
 *
 *    1,68 lido como centímetros  →  IMC 248.015
 *    168  lido como metros       →  IMC 0,002
 *
 *  O primeiro é absurdo e alguém notaria. **O segundo é o
 *  perigoso**: um número pequeno, plausível de passar batido num
 *  formulário de onze campos.
 *
 *  As duas faixas (0,5–2,5 m e 50–250 cm) **não se encostam**, e
 *  o campo DIZ o que entendeu. Corrigir em silêncio
 *  transformaria o acerto em sorte.
 *
 *  ------------------------------------------------------------
 *  A MARCA DE ATENÇÃO APARECE NA HORA DE RESPONDER
 *
 *  Quem responde vê, no momento do clique, que aquela resposta
 *  vai acender um sinal para o setor. É o que transforma a marca
 *  em conversa ("o senhor tomou anticoagulante quando?") em vez
 *  de uma surpresa para quem lê depois.
 * ============================================================
 */

export function ResponderEntrevista({
  perguntas, respostas, aoMudar, somenteLeitura = false
}: {
  perguntas: unknown[] | null;
  respostas: RespostasDaEntrevista;
  aoMudar: (r: RespostasDaEntrevista) => void;
  somenteLeitura?: boolean;
}) {
  const lidas = useMemo(() => lerPerguntas(perguntas ?? []), [perguntas]);
  const lista = lidas.perguntas;

  const faltam = useMemo(
    () => faltamRespostas(lista, respostas), [lista, respostas]);

  const imc = imcDasRespostas(respostas);
  const altura = lerAltura(respostas[ID_ALTURA]);
  const peso = lerPeso(respostas[ID_PESO]);

  function responder(id: string, valor: string) {
    if (somenteLeitura) return;
    aoMudar({ ...respostas, [id]: valor });
  }

  if (!lista.length) {
    return (
      <div className="dia-nota amarela" data-aviso="entrevista-vazia">
        Este exame pede entrevista, mas não tem pergunta cadastrada.
        Cadastre em <strong>Gestão de Exames</strong>.
      </div>
    );
  }

  return (
    <div className="ent-responder" data-bloco="responder-entrevista">
      {/* ⚠️ A prévia já foi cúmplice quatro vezes; aqui o aviso
          de dado estragado existe porque o importador escreve
          nesta coluna e a planilha é editada à mão. */}
      {!!lidas.achados.length && (
        <div className="dia-nota amarela" data-aviso="entrevista-estragada">
          <strong>Algumas perguntas deste exame estão estragadas.</strong>
          <p>
            {lidas.achados.length} de {lidas.achados.length + lista.length} não
            puderam ser lidas. Responda as que aparecem e avise quem cuida do
            cadastro.
          </p>
        </div>
      )}

      {lista.map((p, i) => {
        const valor = respostas[p.id] ?? '';
        const acende = pedeAtencao(p, respostas);

        if (p.tipo === 'imc') {
          return (
            <div key={p.id} className="ent-linha imc" data-pergunta={p.id}
                 data-tipo="imc">
              <span className="ent-num">{i + 1}</span>
              <div className="ent-campo">
                <label>{p.pergunta}</label>
                <div className="ent-imc-saida" data-saida="imc">
                  {imc === null
                    ? <em>Preencha o peso e a altura acima.</em>
                    : <strong>IMC {String(imc).replace('.', ',')}</strong>}
                </div>
                <small className="form-dica">
                  Calculado do peso e da altura. Ninguém responde este campo.
                </small>
              </div>
            </div>
          );
        }

        return (
          <div key={p.id}
               className={'ent-linha' + (acende ? ' acende' : '')}
               data-pergunta={p.id} data-tipo={p.tipo}
               data-acende={acende ? '1' : '0'}>
            <span className="ent-num">{i + 1}</span>
            <div className="ent-campo">
              <label>{p.pergunta}</label>

              {p.tipo === 'sim_nao' && (
                <div className="ent-simnao">
                  <button type="button" disabled={somenteLeitura}
                          className={valor === SIM ? 'escolhido' : ''}
                          data-resposta="sim"
                          onClick={() => responder(p.id, SIM)}>Sim</button>
                  <button type="button" disabled={somenteLeitura}
                          className={valor === NAO ? 'escolhido' : ''}
                          data-resposta="nao"
                          onClick={() => responder(p.id, NAO)}>Não</button>
                </div>
              )}

              {p.tipo === 'texto' && (
                <textarea rows={2} value={valor} disabled={somenteLeitura}
                          data-campo={`resposta-${p.id}`}
                          onChange={e => responder(p.id, e.target.value)}
                          placeholder="Escreva aqui…" />
              )}

              {p.tipo === 'numero' && (
                <input type="text" value={valor} disabled={somenteLeitura}
                       data-campo={`resposta-${p.id}`}
                       inputMode="decimal"
                       onChange={e => responder(p.id, e.target.value)}
                       placeholder={p.id === ID_ALTURA
                         ? '1,68 ou 168'
                         : p.id === ID_PESO ? '70' : ''} />
              )}

              {/* ⭐⭐⭐ O campo DIZ o que entendeu. Corrigir em
                  silêncio transformaria o acerto em sorte: no dia
                  em que a faixa errasse, ninguém saberia. */}
              {p.id === ID_ALTURA && !!valor && (
                <small className={'form-dica' + (altura.recusa ? ' ruim' : '')}
                       data-leitura="altura">
                  {altura.recusa ?? `entendi ${altura.comoLeu}`}
                </small>
              )}
              {p.id === ID_PESO && !!valor && peso.recusa && (
                <small className="form-dica ruim" data-leitura="peso">
                  {peso.recusa}
                </small>
              )}

              {acende && (
                <small className="ent-atencao" data-marca="atencao">
                  <i className="fas fa-triangle-exclamation" /> Esta resposta
                  vai pedir atenção da equipe do setor.
                </small>
              )}
            </div>
          </div>
        );
      })}

      {!somenteLeitura && !!faltam.length && (
        <div className="dia-nota amarela" data-aviso="faltam-respostas">
          <strong>
            {faltam.length === 1
              ? 'Falta 1 resposta.' : `Faltam ${faltam.length} respostas.`}
          </strong>
          <p>{faltam.map(p => p.pergunta).join(' · ')}</p>
        </div>
      )}
    </div>
  );
}
