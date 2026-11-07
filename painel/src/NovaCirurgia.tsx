import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buscarTuss, criarSolicitacaoCirurgia, assinarCirurgia,
  conveniosDoCliente, meuCadastroDeMedico, pacienteParaCirurgia,
  type ProcedimentoTuss, type Convenio, type MeuCadastroDeMedico
} from './dados';
import { Aviso, useAviso } from './Aviso';

/**
 * ============================================================
 *  A GUIA DE SOLICITAÇÃO DE INTERNAÇÃO (TISS)
 *
 *  31/10/2026. O Tom, definindo o escopo do médico:
 *
 *      *"O médico só faz o pedido, todo padrão TISS. Todo resto
 *      é com o restante da equipe."*
 *
 *  ------------------------------------------------------------
 *  ⭐⭐⭐ O QUE ESTA TELA NÃO MANDA
 *
 *  Nome, CRM e especialidade do médico. Eles **não existem** no
 *  payload — saem do login, dentro do banco.
 *
 *  No protótipo o `FormularioMedico.html` mandava
 *  `dados.medicoCRM` junto e o servidor gravava o que viesse.
 *  Quem abrisse o console do navegador assinava uma guia no CRM
 *  de outro médico.
 *
 *  Está escrito no `MedicoService.gs` do próprio Tom, sobre o
 *  sistema antigo: *"NENHUMA funcao daqui aceita medicoId como
 *  parametro. O medico vem do TOKEN, sempre."*
 *
 *  ------------------------------------------------------------
 *  ⚠️ A ASSINATURA VEM DEPOIS DE GRAVAR, E ISSO MUDOU
 *
 *  No protótipo o médico assinava ANTES de enviar: o hash era
 *  calculado sobre o que o navegador tinha na mão.
 *
 *  Aqui a guia é gravada primeiro e o selo é calculado sobre o
 *  que FICOU no banco. ⭐ Assinar o que o navegador mandou deixa
 *  assinar um texto e gravar outro — e é justamente isso que uma
 *  assinatura deveria impedir.
 * ============================================================
 */

interface LinhaProc { codigo: string; descricao: string; quantidade: number; }
interface LinhaOpme { descricao: string; quantidade: number; fabricante: string; valor: string; }

const PROC_VAZIO: LinhaProc = { codigo: '', descricao: '', quantidade: 1 };
const OPME_VAZIO: LinhaOpme = { descricao: '', quantidade: 1, fabricante: '', valor: '' };

export function NovaCirurgia({ clienteId }: { clienteId: string }) {
  const { recado, avisar, fechar } = useAviso();

  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [eu, setEu] = useState<MeuCadastroDeMedico | null>(null);
  /* ⚠️ `null` = ainda não procurei. É diferente de "procurei e
     não achou", e confundir os dois faria a tela dizer "paciente
     novo" antes de o médico ter digitado o CPF. */
  const [achado, setAchado] = useState<null | { achou: boolean; motivo: string;
    temTelefone: boolean }>(null);
  const [buscandoCpf, setBuscandoCpf] = useState(false);
  const [enviando, setEnviando]   = useState(false);
  const [feita, setFeita] = useState<{ id: string; numero: string } | null>(null);
  const [selo, setSelo] = useState<{ codigo: string; hash: string; quando: string } | null>(null);
  const [aceito, setAceito] = useState(false);
  const [assinando, setAssinando] = useState(false);

  // ---------- paciente ----------
  const [pNome, setPNome] = useState('');
  const [pCpf, setPCpf]   = useState('');
  const [pNasc, setPNasc] = useState('');
  const [pSexo, setPSexo] = useState('');
  const [pTel, setPTel]   = useState('');
  const [pMail, setPMail] = useState('');
  const [carteirinha, setCarteirinha] = useState('');
  const [plano, setPlano] = useState('');
  const [validade, setValidade] = useState('');
  const [cns, setCns] = useState('');
  const [convenioId, setConvenioId] = useState('');
  const [ans, setAns] = useState('');

  // ---------- internação ----------
  const [carater, setCarater] = useState('eletiva');
  const [tipoInt, setTipoInt] = useState('cirurgica');
  const [regime, setRegime]   = useState('hospitalar');
  const [diarias, setDiarias] = useState('');
  const [acomodacao, setAcomodacao] = useState('');
  const [dataPrev, setDataPrev] = useState('');
  const [indicacao, setIndicacao] = useState('');

  // ---------- diagnóstico ----------
  const [tipoDoenca, setTipoDoenca] = useState('');
  const [tempoDoenca, setTempoDoenca] = useState('');
  const [acidente, setAcidente] = useState('nenhum');
  const [cid1, setCid1] = useState('');
  const [cid2, setCid2] = useState('');
  const [cid3, setCid3] = useState('');
  const [hipotese, setHipotese] = useState('');

  const [procs, setProcs] = useState<LinhaProc[]>([{ ...PROC_VAZIO }]);
  const [opme, setOpme]   = useState<LinhaOpme[]>([{ ...OPME_VAZIO }]);
  const [obs, setObs]     = useState('');

  useEffect(() => {
    conveniosDoCliente(clienteId)
      .then(setConvenios)
      .catch(() => { /* convênio é opcional; a tela segue sem a lista */ });
    meuCadastroDeMedico(clienteId)
      .then(setEu)
      .catch(() => { /* a tela funciona sem a tarja; o banco decide igual */ });
  }, [clienteId]);

  /* ⭐⭐⭐ O PACIENTE PELO CPF COMPLETO.
   *
   *  ⚠️ Dispara só com 11 dígitos — e isso não é economia de
   *     chamada: busca por pedaço de CPF transformaria a função
   *     no cadastro do hospital servido a conta-gotas para quem
   *     a política proíbe de lê-lo. O banco também recusa; aqui
   *     a tela só evita a ida à toa.
   */
  const procurarPaciente = useCallback(async (cpf: string) => {
    const so = cpf.replace(/\D/g, '');
    if (so.length !== 11) { setAchado(null); return; }
    setBuscandoCpf(true);
    try {
      const r = await pacienteParaCirurgia(clienteId, so);
      setAchado({ achou: r.achou, motivo: r.motivo, temTelefone: r.tem_telefone });
      if (!r.achou) return;
      /* Preenche o que voltou, SEM apagar o que o médico já
         digitou: ele pode ter corrigido um nome de propósito. */
      if (r.nome) setPNome(v => v.trim() ? v : r.nome!);
      if (r.nascimento) setPNasc(v => v || r.nascimento!);
      if (r.sexo) setPSexo(v => v || r.sexo!);
      if (r.carteirinha) setCarteirinha(v => v || r.carteirinha!);
      if (r.plano) setPlano(v => v || r.plano!);
      if (r.convenio_id) {
        setConvenioId(v => v || r.convenio_id!);
        const c = convenios.find(x => x.id === r.convenio_id);
        if (c?.registro_ans) setAns(v => v || c.registro_ans!);
      }
    } catch {
      /* Sem barulho: o médico preenche à mão, como antes. */
    } finally { setBuscandoCpf(false); }
  }, [clienteId, convenios]);

  function limpar() {
    setPNome(''); setPCpf(''); setPNasc(''); setPSexo(''); setPTel(''); setPMail('');
    setCarteirinha(''); setPlano(''); setValidade(''); setCns('');
    setConvenioId(''); setAns('');
    setCarater('eletiva'); setTipoInt('cirurgica'); setRegime('hospitalar');
    setDiarias(''); setAcomodacao(''); setDataPrev(''); setIndicacao('');
    setTipoDoenca(''); setTempoDoenca(''); setAcidente('nenhum');
    setCid1(''); setCid2(''); setCid3(''); setHipotese('');
    setProcs([{ ...PROC_VAZIO }]); setOpme([{ ...OPME_VAZIO }]); setObs('');
    setFeita(null); setSelo(null); setAceito(false);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const bons = procs.filter(p => p.codigo.trim() && p.descricao.trim());
    if (bons.length === 0) {
      avisar('Adicione ao menos um procedimento TUSS.', false);
      return;
    }
    setEnviando(true);
    try {
      const r = await criarSolicitacaoCirurgia(clienteId, {
        paciente_nome: pNome, paciente_cpf: pCpf, paciente_telefone: pTel,
        paciente_email: pMail, paciente_nascimento: pNasc || null,
        paciente_sexo: pSexo || null,
        carteirinha, plano, validade_carteira: validade || null, cns,
        convenio_id: convenioId || null,
        convenio_nome: convenios.find(c => c.id === convenioId)?.nome ?? null,
        registro_ans: ans,
        carater, tipo_internacao: tipoInt, regime,
        diarias: diarias || null, acomodacao,
        data_prevista: dataPrev || null, indicacao_clinica: indicacao,
        tipo_doenca: tipoDoenca || null, tempo_doenca: tempoDoenca,
        acidente, cid_principal: cid1, cid_2: cid2, cid_3: cid3,
        hipotese, observacoes: obs,
        procedimentos: bons,
        opme: opme.filter(o => o.descricao.trim()).map(o => ({
          descricao: o.descricao, quantidade: o.quantidade,
          fabricante: o.fabricante,
          valor_referencia: o.valor ? Number(o.valor) : null
        }))
      });
      if (!r.ok || !r.id) { avisar(r.motivo, false); return; }
      setFeita({ id: r.id, numero: r.numero! });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      avisar(err?.message ?? 'Não consegui enviar a solicitação.', false);
    } finally { setEnviando(false); }
  }

  async function assinar() {
    if (!feita) return;
    setAssinando(true);
    try {
      const r = await assinarCirurgia(feita.id);
      if (!r.ok) { avisar(r.motivo, false); return; }
      setSelo({ codigo: r.codigo!, hash: r.hash!, quando: r.assinado_em! });
      avisar('Guia assinada eletronicamente.', true);
    } catch (e: any) {
      avisar(e?.message ?? 'Não consegui assinar.', false);
    } finally { setAssinando(false); }
  }

  // ════════ a tela de depois ════════
  if (feita) {
    return (
      <div className="cir-tela">
        <div className="cir-pronto">
          <div className="cir-pronto-icone"><i className="fas fa-check" /></div>
          <h2>Solicitação {feita.numero} registrada</h2>
          <p>A equipe administrativa já vê esta guia no quadro de cirurgias.</p>

          {!selo ? (
            <div className="cir-assinar">
              <h4><i className="fas fa-pen-nib" /> Assinatura eletrônica</h4>
              <p className="cir-termo">
                Ao assinar, declaro que as informações prestadas são verdadeiras e
                que sou o responsável pela solicitação desta cirurgia, ciente das
                responsabilidades técnicas, éticas e legais pertinentes ao Conselho
                Regional de Medicina e ao Código de Ética Médica.
              </p>
              {/* ⚠️ O selo é calculado sobre o que FICOU no banco, não
                  sobre o que esta tela tem na mão. Ver o cabeçalho. */}
              <label className="cir-aceite">
                <input type="checkbox" checked={aceito}
                       onChange={e => setAceito(e.target.checked)} />
                <span>Li e concordo com o termo de responsabilidade.</span>
              </label>
              <button className="cir-botao-assinar" disabled={!aceito || assinando}
                      onClick={() => void assinar()}>
                <i className={assinando ? 'fas fa-spinner fa-spin' : 'fas fa-certificate'} />
                {assinando ? ' Assinando…' : ' Assinar eletronicamente'}
              </button>
              <p className="cir-nota">
                A guia já está registrada. Sem a assinatura ela segue no quadro
                marcada como <b>não assinada</b>.
              </p>
            </div>
          ) : (
            <div className="cir-selo-caixa grande">
              <div className="cir-selo-topo">
                <i className="fas fa-certificate" />
                <div>
                  <strong>Documento assinado eletronicamente</strong>
                  <small>{new Date(selo.quando).toLocaleString('pt-BR')}</small>
                </div>
              </div>
              <div className="cir-selo-codigo">{selo.codigo}</div>
              <code className="cir-hash">{selo.hash}</code>
              <p className="cir-nota">
                Guarde o código acima: ele confere a autenticidade desta guia.
              </p>
            </div>
          )}

          <button className="cir-botao-fantasma" onClick={limpar}>
            <i className="fas fa-plus" /> Nova solicitação
          </button>
        </div>
        <Aviso recado={recado} aoFechar={fechar} />
      </div>
    );
  }

  // ════════ o formulário ════════
  return (
    <div className="cir-tela">
      <form className="cir-form" onSubmit={enviar}>
        <div className="cir-cabeca">
          <div>
            <h2 className="cir-titulo">Nova Solicitação de Cirurgia</h2>
            <p className="cir-sub">Guia TISS de solicitação de internação</p>
          </div>
        </div>

        {/* ⭐⭐⭐ QUEM VAI ASSINAR ESTA GUIA.
          *
          *  Não é campo: é tarja. Não dá para editar — o médico
          *  sai do login, dentro do banco, e era isso que curava
          *  o protótipo (lá o CRM vinha do formulário e dava para
          *  assinar no CRM alheio).
          *
          *  ⚠️ Mas eu tinha tirado o campo E a informação junto.
          *     O médico precisa LER o nome e o CRM antes de
          *     assinar, senão descobre o erro de cadastro quando
          *     o convênio devolve. */}
        {eu?.ok && (
          <div className="cir-sou-eu">
            <i className="fas fa-user-doctor" />
            <div>
              <strong>{eu.nome}</strong>
              <small>
                {[eu.conselho, eu.conselho_uf].filter(Boolean).join(' / ') || 'sem conselho'}
                {eu.especialidade ? ' · ' + eu.especialidade : ''}
                {eu.cbos ? ' · CBO ' + eu.cbos : ''}
              </small>
            </div>
            <span className="cir-sou-eu-nota">solicitante, pelo seu login</span>
          </div>
        )}

        {/* ⭐ O cadastro incompleto, dito ANTES de assinar. */}
        {eu?.ok && eu.faltando?.length > 0 && (
          <div className="cir-falta">
            <i className="fas fa-triangle-exclamation" />
            <span>
              Falta no seu cadastro: <b>{eu.faltando.join(', ')}</b>.
              A guia sai assim mesmo, mas o convênio costuma devolver —
              peça para a gestão completar em <b>Médicos</b>.
            </span>
          </div>
        )}

        {eu && !eu.ok && (
          <div className="cir-falta">
            <i className="fas fa-triangle-exclamation" />
            <span>
              O seu usuário não está ligado a nenhum médico, então o
              pedido vai ser recusado. Peça para a gestão ligar em
              <b> Usuários</b>.
            </span>
          </div>
        )}

        <fieldset className="cir-bloco-form">
          <legend><i className="fas fa-user" /> Beneficiário</legend>
          <div className="cir-grade">
            <Campo larga rotulo="Nome completo" obrigatorio>
              <input type="text" data-campo="paciente-nome" value={pNome} required maxLength={120}
                     onChange={e => setPNome(e.target.value)} />
            </Campo>
            <Campo rotulo="CPF" obrigatorio>
              <input data-campo="paciente-cpf" value={pCpf} required inputMode="numeric"
                     placeholder="000.000.000-00"
                     onChange={e => { setPCpf(e.target.value);
                                      void procurarPaciente(e.target.value); }} />
              {buscandoCpf && (
                <small className="cir-achou"><i className="fas fa-spinner fa-spin" />
                  {' '}procurando no cadastro…</small>
              )}
              {!buscandoCpf && achado && (
                <small className={achado.achou ? 'cir-achou' : 'cir-novo'}>
                  <i className={achado.achou ? 'fas fa-check' : 'fas fa-user-plus'} />
                  {' '}{achado.motivo}
                </small>
              )}
            </Campo>
            <Campo rotulo="Nascimento">
              <input type="date" value={pNasc} onChange={e => setPNasc(e.target.value)} />
            </Campo>
            <Campo rotulo="Sexo">
              <select value={pSexo} onChange={e => setPSexo(e.target.value)}>
                <option value="">—</option>
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
              </select>
            </Campo>
            {/* ⭐ Quando o paciente já tem telefone no cadastro, o
                médico não precisa digitar — e continua sem VER o
                número. A regra de 27/10 fica de pé e o trabalho
                some. */}
            <Campo rotulo="Telefone" obrigatorio={!achado?.temTelefone}>
              <input value={pTel} required={!achado?.temTelefone}
                     placeholder={achado?.temTelefone
                       ? 'já cadastrado — deixe em branco'
                       : '(11) 99999-9999'}
                     onChange={e => setPTel(e.target.value)} />
              {achado?.temTelefone && (
                <small className="cir-achou">
                  <i className="fas fa-check" /> telefone já no cadastro
                </small>
              )}
            </Campo>
            <Campo rotulo="E-mail">
              <input type="email" value={pMail} onChange={e => setPMail(e.target.value)} />
            </Campo>
            <Campo rotulo="Convênio / Operadora">
              {/* ⭐ Escolher o convênio preenche o registro ANS: o
                  número já está no cadastro, e pedir de novo ao
                  médico é pedir que ele acerte de cabeça um dado
                  que o banco tem. */}
              <select value={convenioId} onChange={e => {
                setConvenioId(e.target.value);
                const c = convenios.find(x => x.id === e.target.value);
                if (c?.registro_ans) setAns(c.registro_ans);
              }}>
                <option value="">—</option>
                {convenios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Registro ANS">
              <input type="text" value={ans} onChange={e => setAns(e.target.value)} />
            </Campo>
            <Campo rotulo="Nº da carteirinha">
              <input type="text" data-campo="carteirinha" value={carteirinha} onChange={e => setCarteirinha(e.target.value)} />
            </Campo>
            <Campo rotulo="Plano">
              <input type="text" value={plano} onChange={e => setPlano(e.target.value)} />
            </Campo>
            <Campo rotulo="Validade da carteira">
              <input type="date" value={validade} onChange={e => setValidade(e.target.value)} />
            </Campo>
            <Campo rotulo="Cartão Nacional de Saúde">
              <input type="text" value={cns} onChange={e => setCns(e.target.value)} />
            </Campo>
          </div>
        </fieldset>

        <fieldset className="cir-bloco-form">
          <legend><i className="fas fa-hospital" /> Internação</legend>
          <div className="cir-grade">
            <Campo rotulo="Caráter" obrigatorio>
              <select value={carater} onChange={e => setCarater(e.target.value)}>
                <option value="eletiva">Eletiva</option>
                <option value="urgencia">Urgência / Emergência</option>
              </select>
            </Campo>
            <Campo rotulo="Tipo">
              <select value={tipoInt} onChange={e => setTipoInt(e.target.value)}>
                <option value="cirurgica">Cirúrgica</option>
                <option value="clinica">Clínica</option>
                <option value="obstetrica">Obstétrica</option>
                <option value="pediatrica">Pediátrica</option>
                <option value="psiquiatrica">Psiquiátrica</option>
              </select>
            </Campo>
            <Campo rotulo="Regime">
              <select value={regime} onChange={e => setRegime(e.target.value)}>
                <option value="hospitalar">Hospitalar</option>
                <option value="hospital_dia">Hospital-dia</option>
                <option value="domiciliar">Domiciliar</option>
              </select>
            </Campo>
            <Campo rotulo="Diárias solicitadas">
              <input type="number" min={1} max={365} value={diarias}
                     onChange={e => setDiarias(e.target.value)} />
            </Campo>
            <Campo rotulo="Acomodação">
              <select value={acomodacao} onChange={e => setAcomodacao(e.target.value)}>
                <option value="">—</option>
                <option value="Enfermaria">Enfermaria</option>
                <option value="Apartamento">Apartamento</option>
                <option value="UTI">UTI</option>
              </select>
            </Campo>
            <Campo rotulo="Data prevista">
              <input type="date" value={dataPrev} onChange={e => setDataPrev(e.target.value)} />
            </Campo>
            <Campo larga rotulo="Indicação clínica" obrigatorio>
              <textarea rows={3} value={indicacao} required
                        onChange={e => setIndicacao(e.target.value)} />
            </Campo>
          </div>
        </fieldset>

        <fieldset className="cir-bloco-form">
          <legend><i className="fas fa-notes-medical" /> Hipóteses diagnósticas</legend>
          <div className="cir-grade">
            <Campo rotulo="CID-10 principal" obrigatorio>
              <input value={cid1} required placeholder="K80.0"
                     style={{ textTransform: 'uppercase' }}
                     onChange={e => setCid1(e.target.value)} />
            </Campo>
            <Campo rotulo="CID-10 (2)">
              <input value={cid2} style={{ textTransform: 'uppercase' }}
                     onChange={e => setCid2(e.target.value)} />
            </Campo>
            <Campo rotulo="CID-10 (3)">
              <input value={cid3} style={{ textTransform: 'uppercase' }}
                     onChange={e => setCid3(e.target.value)} />
            </Campo>
            <Campo rotulo="Tipo de doença">
              <select value={tipoDoenca} onChange={e => setTipoDoenca(e.target.value)}>
                <option value="">—</option>
                <option value="aguda">Aguda</option>
                <option value="cronica">Crônica</option>
              </select>
            </Campo>
            <Campo rotulo="Tempo de doença">
              <input value={tempoDoenca} placeholder="Ex.: 2 anos"
                     onChange={e => setTempoDoenca(e.target.value)} />
            </Campo>
            <Campo rotulo="Indicação de acidente">
              <select value={acidente} onChange={e => setAcidente(e.target.value)}>
                <option value="nenhum">Sem indicação</option>
                <option value="transito">Trânsito</option>
                <option value="trabalho">Trabalho</option>
                <option value="outros">Outros</option>
              </select>
            </Campo>
            <Campo larga rotulo="Hipótese diagnóstica">
              <textarea rows={2} value={hipotese}
                        onChange={e => setHipotese(e.target.value)} />
            </Campo>
          </div>
        </fieldset>

        <fieldset className="cir-bloco-form">
          <legend>
            <i className="fas fa-list-check" /> Procedimentos solicitados (TUSS)
            <small>digite o código ou a descrição</small>
          </legend>
          {procs.map((p, i) => (
            <LinhaTuss
              key={i} linha={p} numero={i + 1}
              podeRemover={procs.length > 1}
              aoMudar={n => setProcs(l => l.map((x, j) => j === i ? n : x))}
              aoRemover={() => setProcs(l => l.filter((_, j) => j !== i))}
            />
          ))}
          <button type="button" className="cir-mais-linha"
                  onClick={() => setProcs(l => [...l, { ...PROC_VAZIO }])}>
            <i className="fas fa-plus" /> Adicionar procedimento
          </button>
        </fieldset>

        <fieldset className="cir-bloco-form">
          <legend>
            <i className="fas fa-box-open" /> OPME
            <small>órteses, próteses e materiais especiais</small>
          </legend>
          {opme.map((o, i) => (
            <div className="cir-linha-opme" key={i}>
              <input className="qtd" type="number" min={1} value={o.quantidade}
                     onChange={e => setOpme(l => l.map((x, j) =>
                       j === i ? { ...x, quantidade: Number(e.target.value) || 1 } : x))} />
              <input placeholder="Descrição do material" value={o.descricao}
                     onChange={e => setOpme(l => l.map((x, j) =>
                       j === i ? { ...x, descricao: e.target.value } : x))} />
              <input placeholder="Fabricante" value={o.fabricante}
                     onChange={e => setOpme(l => l.map((x, j) =>
                       j === i ? { ...x, fabricante: e.target.value } : x))} />
              <input className="valor" placeholder="Valor ref." type="number" step="0.01"
                     value={o.valor}
                     onChange={e => setOpme(l => l.map((x, j) =>
                       j === i ? { ...x, valor: e.target.value } : x))} />
              <button type="button" className="cir-tira"
                      onClick={() => setOpme(l => l.length > 1
                        ? l.filter((_, j) => j !== i) : [{ ...OPME_VAZIO }])}
                      aria-label="Remover">✕</button>
            </div>
          ))}
          <button type="button" className="cir-mais-linha"
                  onClick={() => setOpme(l => [...l, { ...OPME_VAZIO }])}>
            <i className="fas fa-plus" /> Adicionar OPME
          </button>
        </fieldset>

        <fieldset className="cir-bloco-form">
          <legend><i className="fas fa-comment" /> Observações</legend>
          <textarea rows={3} value={obs} onChange={e => setObs(e.target.value)}
                    placeholder="Informações adicionais sobre a solicitação…" />
        </fieldset>

        <button type="submit" className="cir-enviar" disabled={enviando}>
          <i className={enviando ? 'fas fa-spinner fa-spin' : 'fas fa-paper-plane'} />
          {enviando ? ' Enviando…' : ' Enviar solicitação'}
        </button>
      </form>

      <Aviso recado={recado} aoFechar={fechar} />
    </div>
  );
}


/**
 * ------------------------------------------------------------
 *  UMA LINHA DE PROCEDIMENTO, COM BUSCA NA TABELA TUSS
 *
 *  ⚠️ A busca espera o médico parar de digitar (350 ms). Sem
 *     isso, "colecistectomia" dispara dezesseis consultas ao
 *     banco — e as respostas chegam fora de ordem, fazendo a
 *     lista piscar resultados de termos antigos.
 * ------------------------------------------------------------
 */
function LinhaTuss({ linha, numero, podeRemover, aoMudar, aoRemover }: {
  linha: LinhaProc; numero: number; podeRemover: boolean;
  aoMudar: (n: LinhaProc) => void; aoRemover: () => void;
}) {
  const [sugestoes, setSugestoes] = useState<ProcedimentoTuss[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const pedido = useRef(0);

  const procurar = useCallback(async (termo: string) => {
    const meu = ++pedido.current;
    if (termo.trim().length < 2) { setSugestoes([]); setAberto(false); return; }
    setBuscando(true);
    try {
      const r = await buscarTuss(termo);
      /* ⭐ Resposta velha não manda na tela: se outro pedido saiu
         depois deste, o resultado dele é o que vale. */
      if (meu !== pedido.current) return;
      setSugestoes(r); setAberto(true);
    } catch { /* o médico pode digitar à mão */ }
    finally { if (meu === pedido.current) setBuscando(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (document.activeElement?.closest('.cir-tuss-linha')) {
        void procurar(linha.descricao || linha.codigo);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [linha.descricao, linha.codigo, procurar]);

  function escolher(p: ProcedimentoTuss) {
    aoMudar({ ...linha, codigo: p.codigo, descricao: p.descricao });
    setAberto(false); setSugestoes([]);
  }

  return (
    <div className="cir-tuss-linha">
      <span className="cir-tuss-n">{numero}</span>
      <input className="cir-tuss-cod" placeholder="Código" value={linha.codigo}
             onChange={e => aoMudar({ ...linha, codigo: e.target.value })}
             onBlur={() => setTimeout(() => setAberto(false), 180)} />
      <div className="cir-tuss-busca">
        <input placeholder="Digite para buscar o procedimento…" value={linha.descricao}
               onChange={e => aoMudar({ ...linha, descricao: e.target.value })}
               onBlur={() => setTimeout(() => setAberto(false), 180)} />
        {buscando && <i className="fas fa-spinner fa-spin cir-tuss-girando" />}
        {aberto && sugestoes.length > 0 && (
          <ul className="cir-tuss-lista">
            {sugestoes.map(s => (
              <li key={s.codigo} onMouseDown={() => escolher(s)}>
                <code>{s.codigo}</code>
                <span>{s.descricao}</span>
                {s.categoria && <em>{s.categoria}</em>}
              </li>
            ))}
          </ul>
        )}
        {aberto && !buscando && sugestoes.length === 0 && linha.descricao.length >= 2 && (
          <ul className="cir-tuss-lista">
            <li className="cir-tuss-nada">
              Nada na tabela TUSS — pode digitar o código e a descrição à mão.
            </li>
          </ul>
        )}
      </div>
      <input className="cir-tuss-qtd" type="number" min={1} max={99}
             value={linha.quantidade}
             onChange={e => aoMudar({ ...linha, quantidade: Number(e.target.value) || 1 })} />
      <button type="button" className="cir-tira" disabled={!podeRemover}
              onClick={aoRemover} aria-label="Remover">✕</button>
    </div>
  );
}

function Campo({ rotulo, children, obrigatorio, larga }: {
  rotulo: string; children: React.ReactNode; obrigatorio?: boolean; larga?: boolean;
}) {
  return (
    <label className={'cir-campo-bloco' + (larga ? ' larga' : '')}>
      <span>{rotulo}{obrigatorio && <b className="cir-req">*</b>}</span>
      {children}
    </label>
  );
}
