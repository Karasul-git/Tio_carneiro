# Central de Atendimentos — Confecção

Sistema de apoio à confecção. Ele junta os atendimentos de vários WhatsApps, faz a triagem automática, organiza os pedidos e prepara a nota fiscal.

- Escopo e decisões: [`docs/ESCOPO.md`](docs/ESCOPO.md)
- **Onde paramos e próximos passos:** [`docs/PROXIMOS-PASSOS.md`](docs/PROXIMOS-PASSOS.md)
- **Roteiro de testes com WhatsApp e celular de verdade:** [`docs/CHECKLIST-TESTES.md`](docs/CHECKLIST-TESTES.md)

## O que já existe

### Fase 1: WhatsApps + painel centralizado

- **Até 5 números** de WhatsApp conectados por QR Code (WhatsApp Web / Baileys), com reconexão automática.
- **Caixa de entrada única**, com a fila **"Aguardando"**: quem espera resposta há mais tempo aparece primeiro.
- **Respostas pelo celular do atendente** são reconhecidas: o cliente sai da fila sozinho.
- **Chat pelo app**: ler e responder pelo navegador ou pelo celular.
- **App instalável no celular** (PWA), com **notificações push**.
- Perfis de acesso:
  - **Administrador**: tudo, inclusive usuários;
  - **Gestor**: todos os números e conversas;
  - **Atendente**: só os números ligados a ele.

### Fase 2: robô de triagem + base de respostas + resumo

- **Robô de triagem**:
  - cumprimenta pelo nome e mostra um menu configurável (orçamento, dúvidas, acompanhamento, atendente);
  - coleta os detalhes do pedido;
  - avisa quando está fora do horário.
- **Base de respostas** (perguntas frequentes) com **nível de confiança**:
  - confiança alta: o robô responde sozinho;
  - confiança média: passa ao atendente com a resposta sugerida;
  - confiança baixa: passa ao atendente.
  - Tem tela para **testar mensagens** e ver a confiança de cada resposta.
- **Resumo para o atendente**, enviado por **notificação push** quando o robô passa a conversa:
  - assunto, itens, quantidades, tamanhos, cores e prazo;
  - alerta de urgência e de cliente insatisfeito;
  - dúvidas que o robô já respondeu.
  - Funciona por regras (grátis) ou, opcionalmente, com **IA (Claude)**.
- **O robô para quando uma pessoa responde**, seja pelo celular ou pelo painel. Também dá para **Assumir** pelo app.
- **Proteções contra bloqueio**:
  - "digitando…" antes de cada envio;
  - espera o cliente terminar de digitar;
  - limite de mensagens automáticas por atendimento;
  - uma mensagem por vez.
- Nova aba **"Em triagem"**, com as conversas em que o robô está atendendo.

### Fase 3: catálogo, link de pedido e central de pedidos

- **Catálogo de produtos**:
  - preço (ou "sob orçamento"), grade de tamanhos, cores, acréscimo por tamanho (ex.: GG +R$ 5), pedido mínimo e personalização;
  - dados fiscais (NCM, CFOP, origem) já guardados para a nota fiscal;
  - **importação colando linhas de uma planilha**.
- **Link de pedido**:
  - enviado pela conversa (botão 🧾) ou pelo próprio robô (opção de menu "Envia o link de pedido");
  - o cliente abre no celular, sem login: escolhe cor, quantidade por tamanho e personalização, e informa CPF/CNPJ e endereço (o CEP preenche o resto);
  - o cliente pode alterar até a confirmação.
- **Quando o cliente envia**:
  - o cadastro do cliente é criado ou atualizado (pelo CPF/CNPJ);
  - a equipe recebe uma notificação;
  - o cliente recebe a confirmação no WhatsApp.
- **Central de pedidos**:
  - situações: rascunho → enviado → confirmado → em produção → pronto → entregue (ou cancelado);
  - a equipe ajusta itens, preços, desconto, frete, prazo e anotações internas.
- **Clientes**: cadastro com os dados que a nota fiscal precisa (CPF/CNPJ validado, IE, endereço, código IBGE do município).
- Os pedidos são numerados a partir do **#1001**.

### Fase 4: fila e lembretes

- **Lembretes de atendimento esquecido**, por notificação push. Tudo é configurável em **Mais → Fila e lembretes**:
  - primeiro aviso após X minutos, repetição a cada Y minutos e máximo de avisos;
  - aviso também à gestão a partir do 2º lembrete;
  - só dentro do horário de atendimento.
  - Os avisos são agrupados por pessoa ("3 clientes esperando resposta"), para não virar uma enxurrada.
- **Lembretes de pedidos**: pedido enviado e não confirmado após X horas, e prazo chegando ou atrasado (no máximo um aviso por dia).
- **Prioridade configurável**: o padrão continua sendo quem espera há mais tempo. A gestão pode dar peso a:
  - 😠 cliente insatisfeito;
  - ⚡ cliente com pressa;
  - ⭐ cliente recorrente;
  - 💰 cliente que compra muito.
  - Os ícones aparecem na lista de conversas.
- Na conversa: **✓ Não precisa responder** (ex.: o cliente só agradeceu) e **⏰ Adiar lembrete** (30 min, 1 h, 3 h, amanhã).
- O robô passa **direto ao atendente** quando o cliente chega irritado, sem passar pelo menu.

### Fase 5: relatórios e exportação

- **Relatórios para a gestão**, pensados para o celular (barra inferior → Relatórios):
  - período: hoje, 7 dias, 30 dias, este mês, mês passado ou datas livres;
  - filtro por número.
- **Atendimento**:
  - conversas e mensagens;
  - tempo de resposta (mediana e média) e % respondidas em até 15 min;
  - clientes esperando agora;
  - resolvidas pelo robô × passadas ao atendente;
  - assuntos.
- **Vendas**:
  - faturamento dos pedidos confirmados, ticket médio e peças;
  - links de pedido → pedidos enviados;
  - pedidos em andamento;
  - produtos mais vendidos.
- **Por número/atendente**: conversas, tempo de resposta, pedidos e faturamento.
- Gráficos por dia (conversas e faturamento): tocar na barra mostra o valor, e há opção "ver tabela".
- **⬇ Excel**: planilha com as abas Resumo, Pedidos, Itens (com NCM/CFOP, útil para a nota), Clientes e Atendimentos. No celular, abre o menu de compartilhar (WhatsApp, e-mail, Drive).

O **tempo de resposta** vai da primeira mensagem do cliente até a resposta de uma pessoa (celular ou app); mensagens do robô não contam.

## Próximas fases

Detalhes em [`docs/PROXIMOS-PASSOS.md`](docs/PROXIMOS-PASSOS.md).

| Etapa | Entrega |
|---|---|
| Próxima | Layout, mais filtros, relatórios mais completos e **dashboard dinâmico com widgets** |
| Final | Nota fiscal: exportação e integração com o emissor, depois emissão própria (NF-e/NFC-e) |

## Estrutura

```
apps/
  server/        API Node.js + TypeScript (Fastify, Prisma/PostgreSQL, Baileys, Socket.IO, Web Push)
    src/bot/     robô: motor de decisão, busca na base, resumo, horário, IA opcional
  web/           app React (Vite): PWA para computador e celular
deploy/          produção com Docker + Caddy (HTTPS automático)
docs/            escopo, decisões e roteiro de testes
```

## Como rodar (desenvolvimento)

Pré-requisitos: Node.js 22+ e PostgreSQL 16 (ou Docker).

```bash
# 1. Banco de dados
docker compose up -d            # ou use um PostgreSQL já instalado

# 2. Dependências
npm install

# 3. Configuração do servidor
cp apps/server/.env.example apps/server/.env    # ajuste se necessário
npm run db:deploy -w apps/server                 # cria as tabelas
npm run db:seed -w apps/server                   # administrador + perguntas de exemplo

# 4. Subir (dois terminais)
npm run dev:server     # API em http://localhost:3333
npm run dev:web        # App em http://localhost:5173
```

Entre com `admin@confeccao.local` / `admin123` e troque a senha em **Equipe**.

### Testar o robô sem WhatsApp

```bash
npm run simular -w apps/server -- --novo "Oi" "1" "Quero 50 camisetas pretas M e G até dia 20/12"
```

Esse comando simula um cliente conversando com o robô, mostra as respostas e o resumo, e a conversa aparece no app no número "Simulador".

### Conectar um número

1. Em **Números**, adicione o número e escolha o atendente responsável.
2. Clique em **Conectar**.
3. No celular, abra WhatsApp → **Aparelhos conectados** → **Conectar um aparelho** e leia o QR.

O sistema funciona como um "aparelho conectado" e não marca o número como online, então o celular continua recebendo as notificações.

### Configurar o robô

### Catálogo e link de pedido

1. Em **Produtos**, cadastre os produtos ou cole linhas de uma planilha (nome · categoria · preço · tamanhos · cores · NCM).
2. Em **Ajustes → Empresa e link de pedido**, defina o nome exibido, se os preços aparecem e o **endereço público** usado no link.
3. Na conversa, toque em **🧾** para enviar o link.

Os pedidos chegam em **Pedidos**.

### Configurar o robô

Em **Robô**:
1. Complete os trechos `[AJUSTAR: …]` das perguntas de exemplo e ative-as.
2. Ajuste o menu, as mensagens e o horário de atendimento.
3. Ligue o robô.

O robô vem **desligado** de fábrica.

### Resumo com IA (opcional)

Coloque `ANTHROPIC_API_KEY` no `.env` do servidor. O texto da conversa é enviado à Anthropic para gerar o resumo. Sem a chave, o resumo é feito por regras.

Se o modelo recusar o pedido, a API tenta automaticamente outro modelo (recurso `fallbacks` da Anthropic), e o sistema ainda volta ao resumo por regras em caso de falha.

## Testes e CI

```bash
npm test             # regras de mensagens, fila, prioridade, robô, busca na base e resumo
npm run typecheck
```

O GitHub Actions roda a cada envio:
- tipos, testes, migrações num PostgreSQL de verdade, build e seed;
- build da imagem Docker.

## Produção

```bash
cp deploy/.env.prod.example deploy/.env.prod     # preencha domínio, senhas e segredos
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod exec app node dist/scripts/seed.js
```

Esses comandos sobem:
- o app, que serve a API e o site;
- o PostgreSQL;
- o Caddy, com **HTTPS automático**.

HTTPS é obrigatório para instalar o app no celular e receber notificações.

O volume `appdata` guarda as sessões do WhatsApp. Ele precisa de **backup** e deve ser **mantido em sigilo**, porque dá acesso às contas.

## Avisos

- WhatsApp Web não é a API oficial e há **risco de bloqueio do número**. Comece com um número de teste, evite disparos em massa e mantenha o limite de mensagens do robô baixo.
- O celular precisa se conectar à internet periodicamente, senão a sessão do aparelho conectado expira (cerca de 14 dias).
- O sistema guarda conversas e dados pessoais (LGPD): acesso por perfis, senhas fortes e HTTPS em produção.
