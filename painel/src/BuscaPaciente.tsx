import { useEffect, useRef, useState } from 'react';
import { buscarPaciente, type Paciente } from './dados';
import { formatarCPF, formatarTelefone } from '../../nucleo/formato';

/**
 * ============================================================
 *  ACHAR O PACIENTE
 *
 *  Nasceu dentro do assistente de Novo Agendamento. Saiu de lá
 *  em 08/10/2026, quando o encaixe passou a precisar da mesma
 *  busca.
 *
 *  Copiar seria o caminho curto, e seria a quinta vez neste
 *  projeto que duas cópias da mesma coisa nascem para discordar
 *  depois. Aqui a discordância teria um nome conhecido: o
 *  assistente procura sem acento (`unaccent_simples` no banco),
 *  e a cópia do encaixe só aprenderia isso se alguém lembrasse.
 *  Aí "Antonio" acharia no assistente e não acharia no encaixe,
 *  e nasceria o segundo cadastro do mesmo paciente.
 *
 *  ------------------------------------------------------------
 *  O QUE ELE NÃO FAZ
 *
 *  Não cadastra paciente novo. Quem oferece isso é quem usa —
 *  o assistente oferece, o encaixe não. Encaixe é para quem já
 *  é do hospital: o médico pede, a recepção encaixa.
 *
 *  As classes de CSS continuam as mesmas (`ag-search-box`,
 *  `wiz-item`) de propósito. A prova da tela aponta para elas,
 *  e trocar nome de classe numa extração é trocar duas coisas
 *  de uma vez.
 * ============================================================
 */

export function BuscaPaciente({
  clienteId, termo, aoTermo, escolhido, aoEscolher, aoNovo, aoFalhar, foco
}: {
  clienteId: string;
  termo: string;
  aoTermo: (t: string) => void;
  escolhido: Paciente | null;
  aoEscolher: (p: Paciente | null) => void;
  /** Quando existe, aparece o caminho de cadastrar um novo. */
  aoNovo?: () => void;
  aoFalhar: (mensagem: string) => void;
  foco?: boolean;
}) {
  const [achados, setAchados] = useState<Paciente[]>([]);
  const [procurando, setProcurando] = useState(false);

  // A busca espera a pessoa parar de digitar. Sem isso, "Maria"
  // são cinco idas ao banco — e a quarta resposta pode chegar
  // depois da quinta, pintando a tela com o resultado de "Mari".
  const relogio = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(relogio.current);
    if (termo.trim().length < 3) { setAchados([]); setProcurando(false); return; }
    setProcurando(true);
    relogio.current = window.setTimeout(() => {
      buscarPaciente(clienteId, termo)
        .then(l => { setAchados(l); setProcurando(false); })
        .catch(e => { aoFalhar((e as Error).message ?? String(e)); setProcurando(false); });
    }, 350);
    return () => window.clearTimeout(relogio.current);
  }, [termo, clienteId, aoFalhar, setAchados, setProcurando]);

  return (
    <>
      <div className="ag-search-box" style={{ maxWidth: '100%' }}>
        <i className="fas fa-search" />
        <input type="text" autoFocus={foco !== false} value={termo}
               onChange={e => { aoTermo(e.target.value); aoEscolher(null); }}
               placeholder="Nome, CPF ou telefone — pelo menos 3 letras" />
      </div>

      {procurando && <p className="wiz-dica">procurando…</p>}

      {!procurando && termo.trim().length >= 3 && !achados.length && (
        <div className="wiz-vazio">
          <p>Ninguém encontrado com "<strong>{termo}</strong>".</p>
          {aoNovo
            ? (
              <button className="btn-primary" onClick={aoNovo}>
                <i className="fas fa-user-plus" /> Cadastrar paciente novo
              </button>
            )
            : (
              // Sem cadastro aqui, e dizendo onde ele existe. Um
              // caminho sem saída que não diz para onde ir faz a
              // pessoa abandonar a tela e ligar para alguém.
              <p className="wiz-dica">
                O encaixe é para quem já tem cadastro. Para cadastrar,
                use <strong>Novo Agendamento</strong>.
              </p>
            )}
        </div>
      )}

      {achados.map(p => (
        <button key={p.id}
                className={'wiz-item' + (escolhido?.id === p.id ? ' escolhido' : '')}
                onClick={() => aoEscolher(p)}>
          <div className="wiz-item-nome">{p.nome}</div>
          <div className="wiz-item-sub">
            {formatarCPF(p.cpf) || 'sem CPF'}
            {' · '}{formatarTelefone(p.telefone) || 'sem telefone'}
          </div>
          {escolhido?.id === p.id && <i className="fas fa-check wiz-item-check" />}
        </button>
      ))}

      {achados.length > 0 && aoNovo && (
        <button className="btn-secondary" style={{ marginTop: 12 }} onClick={aoNovo}>
          <i className="fas fa-user-plus" /> Nenhum destes — cadastrar novo
        </button>
      )}
    </>
  );
}
