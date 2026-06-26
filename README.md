# JoiasPro

PWA para controle de estoque, vendas, clientes, fotos e sincronização de joias.

## Versão
v1.0.1

## Senha inicial
- Usuário: **Administrador**
- Senha: **1999**

## Principais funções
- Cadastro de joias com foto, referência, categoria, peso em ouro, preço de compra, preço de venda, status, cliente vinculado e observações.
- Categorias na tela inicial: correntaria, pulseiras, brincos, argolas, pingentes, anéis, escapulários e alianças.
- Tela inicial sem dashboard e sem exibição de custo de compra.
- Clique na categoria para filtrar; clique novamente para desmarcar.
- Clientes com nome completo, WhatsApp, cidade, UF e endereço de entrega.
- Registro de venda e reserva.
- Envio de joia pelo WhatsApp com texto de especificação e geração de imagem/cartão da peça.
- Painel de resultados com vendas do mês, valor em estoque, custo, margem potencial, ticket médio, giro, gráficos e resumo por categoria.
- Temas visuais pré-definidos para loja de joias.
- Backup local em JSON, exportação CSV e sincronização por Google Apps Script.
- Fotos comprimidas com fundo branco para evitar PNG transparente com fundo preto.

## Como usar no GitHub Pages
1. Envie todos os arquivos deste pacote para um repositório.
2. Ative o GitHub Pages apontando para a branch principal.
3. Acesse o link publicado no celular ou computador.

## Sincronização
1. Crie um projeto no Google Apps Script.
2. Cole o conteúdo de `backend-google-apps-script.gs`.
3. Publique como Web App.
4. Copie a URL `/exec` e cole no app em **Configurações > URL do back-end**.

## Observação sobre WhatsApp
O envio direto de texto usa `wa.me`. Para enviar imagem + texto, o app usa o compartilhamento nativo do celular quando disponível. Em computador, ele baixa uma imagem pronta da joia e abre a conversa do WhatsApp para anexar manualmente.
