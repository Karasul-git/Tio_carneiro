# Central de Atendimentos — Confecção

Sistema de apoio à confecção: junta os atendimentos de vários WhatsApps, faz triagem, organiza pedidos e prepara a nota fiscal.
O escopo completo está em [`docs/ESCOPO.md`](docs/ESCOPO.md).

## Fase 1 (atual): WhatsApps + painel centralizado

- Conexão de **até 5 números** de WhatsApp via QR Code (WhatsApp Web / Baileys), com reconexão automática.
- **Caixa de entrada única**, com fila **"Aguardando"**: quem espera resposta há mais tempo aparece primeiro.
- Respostas pelo **celular do atendente** são reconhecidas: o cliente sai da fila automaticamente.
- **Chat pelo app**: ler e responder pelo navegador ou pelo celular.
- **App instalável no celular** (PWA) com **notificações push** de novas mensagens.
- Perfis de acesso:
  - **Administrador**: tudo, inclusive usuários;
  - **Gestor**: todos os números e conversas;
  - **Atendente**: só os números ligados a ele.

Ainda não estão na Fase 1:
- mídias (aparecem como "📷 Imagem", "🎤 Áudio" etc.; o conteúdo fica no celular);
- robô de triagem;
- pedidos;
- nota fiscal.

## Estrutura

```
apps/
  server/   API Node.js + TypeScript (Fastify, Prisma/PostgreSQL, Baileys, Socket.IO, Web Push)
  web/      App React (Vite) — PWA para computador e celular
docs/       Escopo e decisões do projeto
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
npm run db:seed -w apps/server                   # cria o administrador inicial

# 4. Subir (dois terminais)
npm run dev:server     # API em http://localhost:3333
npm run dev:web        # App em http://localhost:5173
```

Entre com `admin@confeccao.local` / `admin123` (troque a senha em **Equipe**).

### Conectar um número

1. Em **Números**, adicione um número e escolha o atendente responsável.
2. Clique em **Conectar**. Vai aparecer um QR Code.
3. No celular do atendente, abra o WhatsApp → **Aparelhos conectados** → **Conectar um aparelho** e leia o QR Code.

O atendente continua usando o WhatsApp normalmente no celular. O sistema funciona como um "aparelho conectado" e não marca o número como online, para que o celular continue recebendo as notificações.

### Notificações no celular

Em **Ajustes** → **Ativar notificações**.
- **Android**: funciona no Chrome.
- **iPhone**: instale o app primeiro (Safari → Compartilhar → **Adicionar à Tela de Início**) e ative as notificações pelo app instalado.

Push e instalação exigem **HTTPS** em produção (`localhost` funciona sem).

## Testes

```bash
npm test             # regras de mensagens, fila de espera e prioridade
npm run typecheck
```

## Produção (resumo)

```bash
npm run build
# no .env do servidor: WEB_DIST_DIR=../web/dist  (a API passa a servir o app)
npm run db:deploy -w apps/server
npm start -w apps/server
```

Coloque atrás de um proxy com HTTPS (Caddy/Nginx), com suporte a WebSocket em `/socket.io`.
A pasta `SESSIONS_DIR` guarda as sessões do WhatsApp: precisa ser persistente, ter backup e ser **mantida em sigilo**, porque dá acesso às contas.

## Avisos

- WhatsApp Web não é a API oficial e há **risco de bloqueio do número**. Evite disparos em massa e mensagens automáticas em excesso.
- O celular precisa se conectar à internet periodicamente, senão a sessão do aparelho conectado expira (cerca de 14 dias).
