import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { minhaSenhaEProvisoria } from './dados';

/**
 * ============================================================
 *  A SESSÃO — UMA PORTA SÓ                        (29/10/2026)
 *
 *  O Tom: *"toda vez que sai da aba do painel e volta fica
 *  carregando e não acontece nada se não apertar F5."*
 *
 *  ⚠️⚠️ O DEFEITO, QUE MORAVA EM DUAS CÓPIAS
 *
 *  O `App.tsx` e o `PortaDoMedico.tsx` tinham, cada um, o mesmo
 *  trecho:
 *
 *    onAuthStateChange((_e, s) => { setSessao(s); setProvisoria(null) })
 *    useEffect(() => perguntar se a senha é provisória, [sessao?.user?.id])
 *
 *  Quando a aba volta a ficar visível, o Supabase CONFERE a sessão
 *  e avisa — `SIGNED_IN` ou `TOKEN_REFRESHED` — mesmo sendo a
 *  MESMA pessoa. O aviso zerava a resposta (`null` = "Carregando…")
 *  e a pergunta só era refeita quando o USUÁRIO mudasse. Mesmo
 *  usuário → pergunta nunca refeita → "Carregando…" para sempre.
 *
 *  O zerar existia por um motivo bom: sair e entrar com OUTRO
 *  login não pode herdar a resposta do anterior. Mas ele disparava
 *  em QUALQUER aviso.
 *
 *  ⭐ Agora a resposta só é zerada quando a PESSOA muda (o `id` do
 *     usuário), e é a mesma condição que faz a pergunta ser
 *     refeita. As duas regras olham para a mesma coisa — e por
 *     isso não podem mais discordar.
 *
 *  ⭐ E elas moram AQUI, uma vez só. O defeito estava copiado nas
 *     duas telas; consertar uma deixaria a outra quebrada.
 *
 *  A prévia agora DISPARA esse aviso (`supabase-falso.ts`), e a
 *  prova de tela volta à aba e exige que a tela não trave.
 * ============================================================
 */
export function useSessao() {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [lendo, setLendo] = useState(true);
  /** null = ainda não perguntei (para ESTA pessoa) */
  const [provisoria, setProvisoria] = useState<boolean | null>(null);
  /** De quem é a resposta que está na tela. */
  const usuarioDaResposta = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (!vivo) return;
      setSessao(data.session);
      setLendo(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e: string, s: Session | null) => {
      setSessao(s);
      setLendo(false);
    });
    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, []);

  const usuario = sessao?.user?.id ?? null;

  // ⭐ A pergunta, e o zerar, só quando a PESSOA muda.
  useEffect(() => {
    if (!usuario) {
      usuarioDaResposta.current = null;
      setProvisoria(null);
      return;
    }
    if (usuarioDaResposta.current === usuario) return;   // a mesma pessoa: nada muda
    usuarioDaResposta.current = usuario;
    setProvisoria(null);
    let valido = true;
    minhaSenhaEProvisoria()
      .then(r => { if (valido) setProvisoria(r); })
      /* ⚠️ Falhou a pergunta? NÃO prende ninguém. A trava de
         verdade é a senha; esta tela é higiene. Uma falha de rede
         trancando a recepção (ou o médico) para fora seria uma
         guarda brigando com o mundo real. */
      .catch(() => { if (valido) setProvisoria(false); });
    return () => {
      valido = false;
      // A pergunta foi interrompida antes da resposta: a próxima
      // rodada precisa perguntar de novo, e não achar que já sabe.
      if (usuarioDaResposta.current === usuario) usuarioDaResposta.current = null;
    };
  }, [usuario]);

  return { sessao, lendo, provisoria, senhaTrocada: () => setProvisoria(false) };
}
