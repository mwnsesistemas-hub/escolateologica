import { useEffect, useState } from 'react';
import { verificarAssinaturaCirurgia } from './dados';

/**
 * ============================================================
 *  CONFERIR UMA ASSINATURA                     31/10/2026
 *
 *  A guia impressa sai com um código e um endereço. Quem recebe
 *  a guia — o convênio, a auditoria, o hospital de destino —
 *  digita o código aqui e vê se ela é verdadeira.
 *
 *  ------------------------------------------------------------
 *  ⚠️⚠️⚠️ PORTA PÚBLICA. O QUE ELA PODE DIZER E O QUE NÃO PODE.
 *
 *  Quem abre esta página NÃO está logado. Ela confirma a
 *  EXISTÊNCIA e a INTEGRIDADE da assinatura, e devolve só o que
 *  já está impresso no papel que a pessoa tem na mão:
 *  quem assinou, o conselho, a data e o hospital.
 *
 *  ⭐ Nada de paciente. Nada de CPF, telefone, carteirinha ou
 *     diagnóstico. Quem confere já tem o papel; quem não tem,
 *     não precisa saber de quem é a cirurgia.
 *
 *  É a mesma regra da porta do fornecedor (064): *"um fornecedor
 *  de prótese não precisa saber de QUEM é a prótese."*
 *
 *  Quem decide isso é o BANCO, em `verificar_assinatura_cirurgia`
 *  — esta tela só mostra o que chega. Se um dia alguém ampliar
 *  o retorno da função, o vazamento não começa aqui.
 * ============================================================
 */

function emDataHora(d?: string | null): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('pt-BR'); } catch { return String(d); }
}

export function VerificarAssinatura({ codigo }: { codigo: string }) {
  const [digitado, setDigitado] = useState(codigo ?? '');
  const [r, setR] = useState<any | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [procurou, setProcurou] = useState(false);

  async function conferir(cod: string) {
    const limpo = (cod ?? '').trim().toUpperCase();
    if (!limpo) return;
    setBuscando(true); setErro(''); setR(null);
    try {
      const x = await verificarAssinaturaCirurgia(limpo);
      setR(x);
    } catch (e: any) {
      setErro(e?.message ?? String(e));
    } finally {
      setBuscando(false); setProcurou(true);
    }
  }

  useEffect(() => {
    if (codigo) conferir(codigo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  const valida = r && (r.valida ?? r.ok ?? false);

  return (
    <div className="ver-fundo">
      <div className="ver-caixa">
        <h1>Conferir assinatura</h1>
        <p className="ver-sub">
          Digite o código impresso no rodapé da guia.
        </p>

        <div className="ver-busca">
          <input type="text" value={digitado} data-campo="codigo"
                 maxLength={40} autoFocus
                 onChange={e => setDigitado(e.target.value.toUpperCase())}
                 onKeyDown={e => { if (e.key === 'Enter') conferir(digitado); }}
                 placeholder="AAAA-BBBB-CCCC-DDDD" />
          <button className="btn-primary" data-acao="conferir"
                  disabled={buscando || !digitado.trim()}
                  onClick={() => conferir(digitado)}>
            {buscando
              ? <><i className="fas fa-circle-notch fa-spin" /> Conferindo…</>
              : <><i className="fas fa-magnifying-glass" /> Conferir</>}
          </button>
        </div>

        {erro && <div className="erro-caixa">{erro}</div>}

        {procurou && !buscando && !erro && !valida && (
          <div className="ver-resposta ruim" data-bloco="nao-confere">
            <i className="fas fa-circle-xmark" />
            <strong>Não encontrei esta assinatura.</strong>
            {/* ⚠️ "Não achei" e "é falsa" não são a mesma frase, e
                dizer a segunda no lugar da primeira acusa alguém
                por um erro de digitação. */}
            <span>
              Confira se o código foi digitado exatamente como está no papel.
              Se estiver certo e ainda assim não aparecer, procure o hospital
              que emitiu a guia.
            </span>
          </div>
        )}

        {valida && (
          <div className="ver-resposta boa" data-bloco="confere">
            <i className="fas fa-circle-check" />
            <strong>Assinatura conferida.</strong>
            <dl>
              <dt>Assinada por</dt><dd>{r.medico_nome ?? '—'}</dd>
              <dt>Conselho</dt><dd>{r.medico_crm ?? '—'}</dd>
              {r.medico_especialidade && (
                <><dt>Especialidade</dt><dd>{r.medico_especialidade}</dd></>
              )}
              <dt>Quando</dt><dd>{emDataHora(r.assinado_em)}</dd>
              <dt>Hospital</dt><dd>{r.hospital ?? '—'}</dd>
            </dl>
            <small>
              Esta página confirma que a assinatura existe e que o conteúdo da
              guia não mudou depois dela. Os dados do paciente não são exibidos
              aqui.
            </small>
          </div>
        )}
      </div>
    </div>
  );
}
