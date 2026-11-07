import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ============================================================
 *  O AVISO QUE APARECE EMBAIXO
 *
 *  ------------------------------------------------------------
 *  POR QUE NÃO É `alert()`
 *
 *  O `alert` trava a página inteira e exige um clique para sair.
 *  Numa recepção que marca presença de trinta pacientes seguidos,
 *  são trinta cliques a mais — e a equipe aprende a clicar em OK
 *  sem ler, que é o pior resultado possível: o aviso existe, e
 *  ninguém vê.
 *
 *  ------------------------------------------------------------
 *  O ERRO FICA MAIS TEMPO NA TELA
 *
 *  "Marcado como compareceu" some em 3,5 segundos — quem fez a
 *  ação já sabe o que ela era. "Não dá para marcar falta em quem
 *  já compareceu" fica 7 segundos, porque é uma frase que a
 *  pessoa precisa LER para entender por que nada mudou.
 *
 *  Um aviso de recusa que some rápido demais é indistinguível de
 *  um botão quebrado.
 * ============================================================
 */

export interface Recado {
  texto: string;
  /** false = o banco recusou, ou deu erro. */
  bom: boolean;
  /** Muda a cada aviso, para o relógio reiniciar mesmo com o mesmo texto. */
  chave: number;
}

export function useAviso() {
  const [recado, setRecado] = useState<Recado | null>(null);
  const relogio = useRef<number | undefined>(undefined);

  const avisar = useCallback((texto: string, bom = true) => {
    setRecado({ texto, bom, chave: Date.now() + Math.random() });
  }, []);

  const fechar = useCallback(() => setRecado(null), []);

  useEffect(() => {
    if (!recado) return;
    window.clearTimeout(relogio.current);
    relogio.current = window.setTimeout(() => setRecado(null), recado.bom ? 3500 : 7000);
    return () => window.clearTimeout(relogio.current);
  }, [recado]);

  return { recado, avisar, fechar };
}

export function Aviso({ recado, aoFechar }: {
  recado: Recado | null;
  aoFechar: () => void;
}) {
  if (!recado) return null;

  return (
    <div
      className="toast show"
      role="status"
      aria-live="polite"
      data-bom={recado.bom ? 'sim' : 'nao'}
      onClick={aoFechar}
      style={{
        cursor: 'pointer',
        // A recusa é cinza-escura com faixa vermelha, não vermelha
        // inteira: vermelho cheio no rodapé parece falha do sistema,
        // e isto aqui normalmente é o sistema funcionando — ele
        // recusou porque a regra manda recusar.
        borderLeft: `4px solid ${recado.bom ? 'var(--success)' : 'var(--danger)'}`,
        maxWidth: 'min(520px, calc(100vw - 32px))'
      }}
    >
      <i className={`fas ${recado.bom ? 'fa-circle-check' : 'fa-circle-exclamation'}`}
         style={{ color: recado.bom ? 'var(--success)' : '#FCA5A5' }} />
      <span style={{ lineHeight: 1.45 }}>{recado.texto}</span>
    </div>
  );
}
