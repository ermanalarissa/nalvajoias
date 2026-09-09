# JoiasPro

PWA para controle de estoque, vendas, clientes, fotos e sincronização de joias.

## Versão
v0.7

## Senha inicial
- Usuário: **Administrador**
- Senha: **1999**

## Principais funções
- Cadastro de joias com foto, referência, categoria, estoque, data de entrada, peso em ouro, preço de compra, preço de venda, status e observações.
- Categorias na tela inicial: correntaria, pulseiras, brincos, argolas, pingentes, anéis, escapulários e alianças.
- Tela inicial sem dashboard e sem exibição de custo de compra.
- Clique na categoria para filtrar; clique novamente para desmarcar.
- Clientes com nome completo, WhatsApp, cidade, UF e endereço de entrega.
- Registro de venda e reserva.
- Envio de joia pelo WhatsApp com texto de especificação e geração de imagem/cartão da peça.
- Painel de resultados com seleção de mês, vendas do mês, valor em estoque, custo, margem, ticket médio, giro, gráficos, top clientes, itens mais vendidos e resumo por categoria.
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
4. Copie a URL `/exec` e cole no app em **Configurações > Avançado > URL do back-end**.

Para a v0.7, depois de atualizar este repositório, copie novamente `backend-google-apps-script.gs` para o projeto do Apps Script e crie uma nova implantação/versão. A sincronização usa `LockService`, merge por registro, horário do servidor Google e deltas de estoque para permitir alterações simultâneas em aparelhos diferentes sem substituir dados recentes.

## Observação sobre WhatsApp
O envio direto de texto usa `wa.me`. Para imagem, o WhatsApp não permite que uma PWA anexe mídia automaticamente em uma conversa específica por número. O app gera o card, copia o texto e abre a conversa do número informado para anexar o card manualmente.

## Versão 0.6
- Capa do aplicativo com as fotos reais da loja, carrossel automático e miniaturas navegáveis.
- Quadro financeiro para calcular custo com gramas, índice, fator do dia e incidência de imposto.
- Custos em aberto podem ser pagos depois; ao marcar o pagamento, o custo fica fixo para o cálculo do lucro.
- Aba financeira administrativa com visão de custos em aberto e custos já fixados.

## Versão 0.5
- Perfis de Administrador e Vendedora, com painel mensal individual e sem exibição de custo para a vendedora.
- Cadastro de várias vendedoras, cada uma com nome, senha e acesso individual ao próprio painel mensal.
- Cada venda registra o vendedor, cliente e baixa de estoque automaticamente.
- Pedido de envio em PDF com formulário bege/branco, logo da loja, CPF, e-mail, endereço completo, peça, subtotal, frete, total, pagamento, status e modalidade PAC/Sedex.
- Envio do pedido por e-mail/compartilhamento e aviso de rastreio por WhatsApp e e-mail quando o código é salvo.
- Acompanhamento com lista de espera, pedidos em fabricação e agenda de anotações compartilhada entre os aparelhos.
- Painel administrativo de vendas com filtro por vendedora e mês.
- Merge por registro no Google Apps Script, com `LockService`, relógio do servidor Google e delta de estoque para vendas simultâneas.
- Clientes VIP marcados e ranking de clientes que mais compram.
