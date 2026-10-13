# Cifras da Missa

Monta o repertório da missa, busca as cifras em vários sites, edita, troca o tom e gera Word, PDF, TXT e Excel em 1 ou 2 colunas.
É só uma página HTML/CSS/JavaScript (GitHub Pages) + Supabase. Não precisa instalar nada.

**Site:** <https://rene17bueno.github.io/cifras-missa/>

## Como usar

1. **Entrar:** na seção "Conta", crie a conta com um e-mail autorizado e confirme o e-mail. A busca automática só funciona logado.
2. **Adicionar músicas:** escolha a parte da missa e cole o link, ou use a aba **Buscar pelo nome**. Em "Vários links", um por linha: `Parte da missa | link`.
3. **Buscar:** a função procura ao mesmo tempo no Músicas para Missa, no Cifras.com.br e na web, e testa as melhores opções até achar uma com acordes. Dá para trocar por outra no editor.
4. **Editar:** título, artista, cifra, tom (±½ tom) e 1 ou 2 colunas por música, com prévia.
5. **Baixar:** PDF, Word, TXT ou Excel.
6. **Modo palco:** botão "Palco" abre as cifras em tela cheia, com rolagem automática e a tela sempre acesa.

O CifraClub bloqueia servidores (403); por isso é procurado pelo nome. A versão exata dele continua disponível pelo favorito **Enviar cifra**. Também dá para colar a cifra.

## Nuvem (Supabase)

- **Biblioteca:** toda cifra achada fica guardada; da próxima vez vem do banco, sem ir aos sites.
- **Repertórios na nuvem:** salvos por conta (Row Level Security: cada um só vê os seus) e sincronizados entre aparelhos. Sem login, ficam só no navegador; **Salvar cópia (.json)** faz backup.
- **Função `cifras-busca`** (`supabase/functions/cifras-busca/`): exige login, e-mail na tabela `cifras_permitidos`, origem do site e cota diária por usuário (`cifras_uso`). Só aceita links `https` de sites públicos.
- **Para autorizar outro e-mail:** `insert into cifras_permitidos (email) values ('pessoa@exemplo.com');` no SQL do projeto.

## Offline

A página é um PWA (instalável): depois do primeiro acesso, abre sem internet com os repertórios salvos.

## Estrutura

```text
docs/                             a página (index.html, js/, css/, vendor/ com jsPDF, docx e ExcelJS, sw.js, manifest)
supabase/functions/cifras-busca/  função de busca (Deno)
tests/                            testes da função (node --test tests/*.test.mjs)
.github/workflows/testes.yml      roda os testes a cada push
```

## Testes

```bash
node --test tests/*.test.mjs
```
