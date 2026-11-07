import { createClient } from '@supabase/supabase-js';

/**
 * ============================================================
 *  A LIGAÇÃO COM O BANCO
 *
 *  ------------------------------------------------------------
 *  "MAS A CHAVE NÃO FICA EXPOSTA NO NAVEGADOR?"
 *
 *  Fica. E é assim mesmo.
 *
 *  A chave `anon` é pública por desenho — ela vai para o
 *  navegador de todo mundo, e o Supabase publica isso na
 *  documentação. Ela não dá acesso a nada: diz apenas "este
 *  pedido vem do projeto tal".
 *
 *  Quem decide o que a pessoa enxerga é o token que o login
 *  produz, junto com as políticas do banco — as mesmas que você
 *  viu recusar doze casos no teste de isolamento. Sem login, o
 *  banco responde a verdade: você não é ninguém, então não vê
 *  nada.
 *
 *  A chave que NÃO pode sair daqui é a `service_role`, que passa
 *  por cima de tudo. Ela nunca entra neste projeto do lado do
 *  navegador. Se um dia você me vir escrevendo `service_role`
 *  em qualquer arquivo dentro de `painel/`, me pare.
 * ============================================================
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** O painel sabe dizer que não foi configurado, em vez de dar tela branca. */
export const configurado = Boolean(url && chave);

export const supabase = createClient(
  url ?? 'https://configure.o.env',
  chave ?? 'sem-chave'
);
