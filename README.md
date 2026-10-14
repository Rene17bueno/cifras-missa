# Músico Católico

Monta o repertório da missa, busca as cifras em vários sites, edita, troca o tom e gera Word, PDF, TXT e Excel em 1 ou 2 colunas.
É só uma página HTML/CSS/JavaScript (GitHub Pages) + Supabase. Não precisa instalar nada.

**Site:** <https://rene17bueno.github.io/musico-catolico/>

## Como usar

1. **Entrar (opcional):** a busca e o catálogo funcionam sem login. A conta só guarda seus repertórios na nuvem; o botão "Criar conta" está desligado (`CRIAR_CONTA = false` em `docs/js/nuvem.js`).
2. **Adicionar músicas:** escolha a parte da missa e cole o link, ou use a aba **Buscar pelo nome**. Em "Vários links", um por linha: `Parte da missa | link`.
3. **Buscar:** a função procura ao mesmo tempo no Músicas para Missa, no Cifras.com.br, no Banana Cifras, no Cifras Católicas, no Allelu, no Decifrando e na web (até 3 resultados por site) (se o artista digitado não bater, tenta só pelo título), e testa as melhores opções até achar uma com acordes. Dá para trocar por outra no editor.
4. **Editar:** título, artista, cifra, tom (±½ tom) e 1 ou 2 colunas por música, com prévia.
5. **Baixar:** PDF, Word, TXT ou Excel.
6. **Modo palco:** botão "Palco" abre as cifras em tela cheia, com rolagem automática e a tela sempre acesa.
7. **Sugestões do domingo:** aba que lê as sugestões do Músicas para Missa por parte da missa e adiciona com um clique.
8. **Catálogo:** aba com as músicas do Músicas para Missa em pastas por parte (Entrada, Cordeiro, Santo...), com filtro e ➕. Na primeira vez, logado, clique em **Atualizar catálogo** (~52 chamadas da cota diária). Só guarda título/link/parte; a cifra completa é buscada ao adicionar. Só esse site pode ser varrido por inteiro; Cifras.com.br, Banana Cifras, Cifras Católicas, Allelu, Decifrando e CifraClub não listam o acervo.
   O botão de busca automática vira **Tentar de novo as sem cifra** quando alguma música falhou.
9. **Artistas e robô:** aba que lista as cifras de um artista (Cifras.com.br, até 30). **Seguir** guarda o artista; o robô verifica os seguidos ao abrir o site e a cada 6 h e mostra as cifras novas para aprovar com +. **Rodar agora** segue o artista digitado e verifica na hora.
10. **Folheto:** campos Paróquia/Celebração aparecem no rodapé do PDF, Word, TXT e prévia.

O CifraClub bloqueia servidores (403); por isso é procurado pelo nome. A versão exata dele continua disponível pelo favorito **Enviar cifra**. Também dá para colar a cifra.

## Nuvem (Supabase)

- **Biblioteca:** toda cifra achada fica guardada; da próxima vez vem do banco, sem ir aos sites.
- **Repertórios na nuvem:** salvos por conta (Row Level Security: cada um só vê os seus) e sincronizados entre aparelhos. Sem login, ficam só no navegador; **Salvar cópia (.json)** faz backup.
- **Função `cifras-busca`** (`supabase/functions/cifras-busca/`): aberta, mas só aceita chamadas vindas do site (Origin), com cota diária compartilhada (`cifras_uso_geral`, 2000/dia). Só aceita links `https` de sites públicos.
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

## Fontes

Busca por nome e leitura de link: Músicas para Missa, Cifras.com.br, Banana Cifras, Cifras Católicas, Allelu, Decifrando. O CifraClub bloqueia servidores (só funciona colando a cifra); SantaCifra e CatoliChord exigem login e não são usadas.
