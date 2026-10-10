/*
 * Conta e nuvem (Supabase) do Cifras da Missa.
 * - Login por e-mail e senha (sem biblioteca: só fetch). A senha nunca é guardada; só o token da sessão.
 * - Biblioteca: cifras já achadas ficam guardadas e são usadas antes de buscar nos sites.
 * - Repertórios: salvos na nuvem e sincronizados entre aparelhos.
 * Só e-mails da tabela cifras_permitidos conseguem usar (regras de acesso no banco: RLS).
 */
const Nuvem = (function () {
  "use strict";

  const URL_BASE = "https://tuciclxzfcbsaauphryk.supabase.co";
  const CHAVE_PUBLICA = "sb_publishable_7cckd9kEEIauypKnEoJ9Iw_yoSakOeQ"; // chave pública: o acesso é protegido por RLS
  const CHAVE_SESSAO = "cifras.sessao";
  const FUNCAO_BUSCA = URL_BASE + "/functions/v1/cifras-busca";

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  let sessao = null;        // {access_token, refresh_token, expires_at, email, uid}
  let autorizado = null;    // null = ainda não sei
  let ganchos = { aoReceber() {}, aoMudar() {} };
  let mensagem = "";        // aviso na seção Conta
  let outros = [];          // repertórios de outros usuários autorizados
  const envios = new Map(); // nome do repertório -> temporizador do envio

  try { sessao = JSON.parse(localStorage.getItem(CHAVE_SESSAO)); } catch { sessao = null; }

  const ativo = () => !!sessao && autorizado === true;
  const logado = () => !!sessao;

  // ---------------------------------------------------------------- Conta
  function traduzir(j) {
    const codigo = j.error_code || j.code || "";
    const texto = j.msg || j.message || j.error_description || "";
    if (codigo === "invalid_credentials") return "E-mail ou senha incorretos.";
    if (codigo === "email_not_confirmed") return "Confirme seu e-mail: abra o link que enviamos para você.";
    if (codigo === "user_already_exists") return "Já existe uma conta com esse e-mail. Use Entrar.";
    if (codigo === "weak_password") return "Senha fraca. Use 8 ou mais caracteres, misturando letras e números.";
    if (codigo === "over_email_send_rate_limit" || /rate limit/i.test(texto)) return "Muitos e-mails enviados. Tente de novo em alguns minutos.";
    return texto || "Não foi possível falar com o servidor da conta.";
  }

  async function auth(caminho, corpo) {
    let r;
    try {
      r = await fetch(`${URL_BASE}/auth/v1/${caminho}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: CHAVE_PUBLICA },
        body: JSON.stringify(corpo),
      });
    } catch { throw new Error("Sem conexão com o servidor da conta."); }
    let j = {};
    try { j = await r.json(); } catch { /* sem corpo */ }
    if (!r.ok) throw new Error(traduzir(j));
    return j;
  }

  function definirSessao(j) {
    sessao = {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
      email: (j.user && j.user.email) || (sessao && sessao.email) || "",
      uid: (j.user && j.user.id) || (sessao && sessao.uid) || "",
    };
    try { localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao)); } catch { /* sem armazenamento */ }
  }

  function limparSessao() {
    sessao = null; autorizado = null; outros = [];
    try { localStorage.removeItem(CHAVE_SESSAO); } catch { /* sem armazenamento */ }
  }

  /** Token válido (renova se estiver perto de vencer); null se não está logado */
  async function token() {
    if (!sessao) return null;
    if (sessao.expires_at - Date.now() / 1000 < 60) {
      try { definirSessao(await auth("token?grant_type=refresh_token", { refresh_token: sessao.refresh_token })); }
      catch (erro) {
        if (/conexão/.test(erro.message)) return sessao.access_token;
        limparSessao(); desenhar(); return null;
      }
    }
    return sessao.access_token;
  }

  async function entrar(email, senha) {
    definirSessao(await auth("token?grant_type=password", { email, password: senha }));
    await depoisDeEntrar();
  }

  async function criarConta(email, senha) {
    const j = await auth("signup", { email, password: senha });
    if (j.access_token) { definirSessao(j); await depoisDeEntrar(); return "Conta criada."; }
    return "Conta criada. Abra o e-mail que enviamos e clique no link de confirmação; depois volte aqui e clique em Entrar.";
  }

  async function sair() {
    const t = sessao && sessao.access_token;
    if (t) fetch(`${URL_BASE}/auth/v1/logout`, { method: "POST", headers: { apikey: CHAVE_PUBLICA, Authorization: "Bearer " + t } }).catch(() => {});
    limparSessao(); mensagem = ""; desenhar(); ganchos.aoMudar();
  }

  async function depoisDeEntrar() {
    autorizado = null;
    try {
      autorizado = (await rest("rpc/cifras_autorizado", { metodo: "POST", corpo: {} })) === true;
    } catch { autorizado = null; }
    if (autorizado === false) mensagem = "Este e-mail ainda não está autorizado. Peça ao dono do site para liberar.";
    else mensagem = "";
    desenhar();
    if (autorizado) { await sincronizar(); await carregarOutros(); desenhar(); }
    ganchos.aoMudar();
  }

  // ---------------------------------------------------------------- Chamadas ao banco (PostgREST)
  async function rest(caminho, { metodo = "GET", corpo, prefer } = {}) {
    const t = await token();
    if (!t) throw new Error("Entre na sua conta.");
    const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
      method: metodo,
      headers: {
        apikey: CHAVE_PUBLICA,
        Authorization: "Bearer " + t,
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    if (!r.ok) throw new Error("erro " + r.status);
    if (r.status === 204) return null;
    try { return await r.json(); } catch { return null; }
  }

  const palavras = (texto) => String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  // ---------------------------------------------------------------- Biblioteca
  /** Procura a cifra já guardada: primeiro pelo link exato, depois pelo nome. null se não achar */
  async function daBiblioteca({ url, titulo, artista }) {
    if (!ativo()) return null;
    try {
      const campos = "select=url,titulo,artista,cifra,busca&limit=20";
      if (url) {
        const exata = await rest(`cifras_biblioteca?${campos}&url=eq.${encodeURIComponent(url)}`);
        if (exata && exata.length) return { ...exata[0], exata: true };
      }
      const p = palavras(titulo);
      if (!p.length) return null;
      const linhas = (await rest(`cifras_biblioteca?${campos}&and=(${p.map((w) => `busca.ilike.*${w}*`).join(",")})`)) || [];
      const a = palavras(artista);
      const doArtista = (l) => (a.length && a.every((w) => l.busca.split(" ").includes(w)) ? 0 : 1);
      linhas.sort((x, y) => doArtista(x) - doArtista(y) || x.busca.length - y.busca.length);
      return linhas[0] ? { ...linhas[0], exata: false } : null;
    } catch { return null; }
  }

  /** Guarda a cifra achada (versão original, sem edições) para as próximas buscas */
  async function guardar(resultado) {
    if (!ativo() || !resultado) return;
    const original = resultado.Original || resultado;
    const url = resultado.Fonte || resultado.URL;
    const cifra = original.Cifra || "";
    if (!url || cifra.length < 20 || !/^https?:\/\//.test(url)) return;
    const titulo = original.Música || resultado.Música || "";
    const artista = original.Artista || resultado.Artista || "";
    if (!titulo.trim()) return;
    try {
      await rest("cifras_biblioteca?on_conflict=user_id,url", {
        metodo: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        corpo: { url, titulo, artista, cifra, fonte: url, busca: palavras(`${titulo} ${artista}`).join(" ") },
      });
    } catch { /* guardar é um extra; não atrapalha a busca */ }
  }

  // ---------------------------------------------------------------- Repertórios na nuvem
  function estado(texto) { const el = $("#status-nuvem"); if (el) el.textContent = texto; }

  function agendarEnvio(rep) {
    if (!ativo()) return;
    const copia = JSON.parse(JSON.stringify(rep));
    clearTimeout(envios.get(copia.nome));
    envios.set(copia.nome, setTimeout(async () => {
      envios.delete(copia.nome);
      try {
        await rest("cifras_repertorios?on_conflict=user_id,nome", {
          metodo: "POST",
          prefer: "resolution=merge-duplicates,return=minimal",
          corpo: { nome: copia.nome, dados: copia, atualizado_em: new Date().toISOString() },
        });
        estado(`☁️ Salvo na nuvem às ${new Date().toLocaleTimeString("pt-BR")}`);
      } catch { estado("⚠️ Não consegui salvar na nuvem (o repertório continua salvo neste navegador)."); }
    }, 2500));
  }

  async function apagar(nome) {
    if (!ativo()) return;
    try { await rest(`cifras_repertorios?nome=eq.${encodeURIComponent(nome)}`, { metodo: "DELETE" }); } catch { /* o banco só apaga os seus */ }
  }

  /** Traz os seus repertórios da nuvem; o app decide quais são mais novos que os do navegador */
  async function sincronizar() {
    try {
      const meus = (await rest(`cifras_repertorios?select=dados&user_id=eq.${sessao.uid}&order=atualizado_em.desc&limit=100`)) || [];
      ganchos.aoReceber(meus.map((l) => l.dados).filter((d) => d && d.nome && Array.isArray(d.musicas)));
      estado("☁️ Repertórios sincronizados com a nuvem.");
    } catch { estado("⚠️ Não consegui sincronizar com a nuvem agora."); }
  }

  async function carregarOutros() {
    try {
      outros = (await rest(`cifras_repertorios?select=id,nome,dono,atualizado_em&user_id=neq.${sessao.uid}&order=atualizado_em.desc&limit=50`)) || [];
    } catch { outros = []; }
  }

  async function abrirDeOutro(id) {
    const linhas = await rest(`cifras_repertorios?select=dados&id=eq.${encodeURIComponent(id)}`);
    return linhas && linhas[0] ? linhas[0].dados : null;
  }

  // ---------------------------------------------------------------- Seção "Conta" na página
  function desenhar() {
    const el = $("#conta");
    if (!el) return;
    const aviso = mensagem ? `<p class="aviso-alerta">${esc(mensagem)}</p>` : "";
    if (!sessao) {
      el.innerHTML = `<h2>☁️ Conta</h2>
        <p class="dica">Entre para <b>buscar cifras nos sites</b> e guardar seus repertórios na nuvem (sincroniza entre aparelhos).
          Só e-mails autorizados pelo dono do site conseguem usar.</p>
        <form id="form-conta" class="linha">
          <label class="campo cresce">E-mail <input id="conta-email" type="email" autocomplete="email" required></label>
          <label class="campo cresce">Senha (8 ou mais) <input id="conta-senha" type="password" autocomplete="current-password" minlength="8" required></label>
          <button type="submit" class="primario" data-modo="entrar">Entrar</button>
          <button type="submit" data-modo="criar">Criar conta</button>
        </form>${aviso}`;
      return;
    }
    const lista = outros.length
      ? `<div class="linha"><label class="campo cresce">Repertórios de outros usuários autorizados
          <select id="conta-outros">${outros.map((o) => `<option value="${esc(o.id)}">${esc(o.nome)} — ${esc(o.dono)}</option>`).join("")}</select></label>
          <button id="conta-abrir-outro">📂 Abrir uma cópia</button></div>` : "";
    el.innerHTML = `<h2>☁️ Conta</h2>
      <div class="linha"><span>Conectado como <b>${esc(sessao.email)}</b></span><button id="conta-sair">Sair</button></div>
      <span id="status-nuvem" class="dica"></span>${aviso}${autorizado ? lista : ""}`;
  }

  function ligarEventos() {
    const el = $("#conta");
    el.addEventListener("submit", async (e) => {
      e.preventDefault();
      const modo = (e.submitter && e.submitter.dataset.modo) || "entrar";
      const email = $("#conta-email").value.trim().toLowerCase();
      const senha = $("#conta-senha").value;
      if (senha.length < 8) { mensagem = "A senha precisa ter 8 ou mais caracteres."; desenhar(); return; }
      mensagem = "⏳ Aguarde…"; desenhar();
      try {
        mensagem = modo === "criar" ? await criarConta(email, senha) : (await entrar(email, senha), "");
      } catch (erro) { mensagem = erro.message; }
      desenhar();
    });
    el.addEventListener("click", async (e) => {
      if (e.target.closest("#conta-sair")) sair();
      else if (e.target.closest("#conta-abrir-outro")) {
        const id = $("#conta-outros").value;
        try {
          const dados = await abrirDeOutro(id);
          if (dados) ganchos.aoAbrirCopia(dados);
        } catch { estado("⚠️ Não consegui abrir esse repertório."); }
      }
    });
  }

  function iniciar(g) {
    ganchos = { ...ganchos, ...g };
    ligarEventos();
    desenhar();
    if (sessao) depoisDeEntrar();
  }

  return { iniciar, ativo, logado, token, daBiblioteca, guardar, agendarEnvio, apagar, FUNCAO_BUSCA };
})();
