# JoiasPro

App PWA para controle de joias, clientes, estoque, preços, fotos, vendas, backup e sincronização.

## Arquivos principais

- `index.html`: tela principal do aplicativo.
- `style.css`: visual responsivo em celular e desktop.
- `app.js`: lógica do app, banco local, fotos, vendas, clientes, auditoria e sincronização.
- `manifest.json`: configuração PWA para instalar no celular.
- `sw.js`: cache offline e atualização.
- `backend-google-apps-script.gs`: back-end para sincronização usando Google Apps Script.
- `icons/`: ícones do PWA.

## Login inicial

Usuário: `Administrador`

Senha: `1999`

A senha pode ser alterada no menu Perfil. Também é possível criar novos usuários em Configurações.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie todos estes arquivos para a raiz do repositório.
3. Vá em `Settings > Pages`.
4. Em `Build and deployment`, selecione `Deploy from a branch`.
5. Escolha a branch `main` e a pasta `/root`.
6. Abra o link do GitHub Pages gerado.

## Configurar sincronização

1. Acesse https://script.google.com.
2. Crie um novo projeto.
3. Cole o conteúdo de `backend-google-apps-script.gs` no arquivo `Code.gs`.
4. Clique em `Implantar > Nova implantação`.
5. Escolha o tipo `Aplicativo da Web`.
6. Em `Executar como`, selecione você mesmo.
7. Em `Quem tem acesso`, selecione qualquer pessoa com o link.
8. Copie a URL terminada em `/exec`.
9. Abra o JoiasPro e cole a URL no campo de back-end.

## Backup

O backup JSON inclui as joias, clientes, vendas, usuários, auditoria e fotos comprimidas em base64.

As fotos são comprimidas automaticamente antes de salvar para reduzir o tamanho do backup.

## Observação importante

Este é um app PWA sem servidor próprio. A proteção por senha impede acesso casual à interface, mas arquivos estáticos publicados no GitHub Pages ficam públicos. Para uso com dados sensíveis, hospede em ambiente privado ou adicione autenticação no servidor.
