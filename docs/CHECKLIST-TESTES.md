# Roteiro de testes no mundo real

Este roteiro é para quando houver um computador disponível. Tudo que dava para testar sem WhatsApp de verdade já foi testado automaticamente: regras, robô, resumo, banco e build, a cada envio de código pelo GitHub Actions.

O que falta é o que só um **celular de verdade** consegue validar. Marque cada item conforme testar.

---

## 0. Preparar (≈ 15 min)

- [ ] Instalar **Node.js 22+** e **Docker Desktop** (ou PostgreSQL 16)
- [ ] `git clone` do repositório e `git checkout claude/confeccao-support-system-ezp08l`
- [ ] Seguir **"Como rodar"** no `README.md` (banco, `npm install`, migrações, seed, `dev:server` e `dev:web`)
- [ ] Abrir `http://localhost:5173` e entrar com o administrador
- [ ] (Opcional) Testar o robô sem WhatsApp, com um cliente simulado:
  ```bash
  npm run simular -w apps/server -- --novo "Oi" "1" "50 camisetas pretas M e G até dia 20/12"
  ```

> Para usar o **celular** no teste, o computador e o celular precisam estar na mesma rede Wi-Fi. Abra `http://IP-DO-PC:5173` no celular. Notificações push e instalação do app só funcionam com HTTPS, então esses itens ficam para o passo 5.

---

## 1. Conexão do WhatsApp (Fase 1)

Use um número de teste, **não** o número principal da confecção.

- [ ] **Números** → adicionar "Teste" → **Conectar** → o QR Code aparece
- [ ] No celular: WhatsApp → **Aparelhos conectados** → **Conectar um aparelho** → ler o QR
- [ ] O status muda para **Conectado** e mostra o número
- [ ] Com outro celular, mande "oi" para o número de teste → a conversa aparece no painel **em poucos segundos**
- [ ] Responda **pelo celular do atendente** → a conversa sai de "Aguardando" e a mensagem aparece como "pelo celular"
- [ ] Responda **pelo painel** → a mensagem chega no celular do cliente e aparece como "pelo painel"
- [ ] O celular do atendente **continua recebendo notificações** do WhatsApp normalmente
- [ ] Pare o servidor (Ctrl+C) e suba de novo → reconecta **sem** pedir QR
- [ ] Desconecte o aparelho pelo celular → o painel mostra **Sessão encerrada**
- [ ] Mande foto/áudio → aparece como "📷 Imagem" / "🎤 Áudio" (o conteúdo fica no celular, por enquanto)

## 2. Robô de triagem (Fase 2)

Antes: em **Robô → Base de respostas**, complete os trechos `[AJUSTAR: …]` das respostas de exemplo e ative-as. Depois, em **Robô → Configurações**, ligue o robô e confira o horário de atendimento.

- [ ] Cliente manda "oi" → recebe boas-vindas + menu (**uma** mensagem, com "digitando…" antes)
- [ ] Responde "1" → o robô pede os detalhes → o cliente manda os detalhes → o robô avisa que passou à equipe
- [ ] A conversa aparece em **Aguardando**, com o resumo (itens, tamanhos, cores, prazo)
- [ ] Cliente manda "aceita pix?" logo de cara → o robô responde direto com a resposta da base
- [ ] Pergunta fora da base → passa ao atendente com o motivo "dúvida sem resposta na base"
- [ ] Cliente escreve "quero falar com atendente" → passa na hora
- [ ] **O atendente responde pelo celular no meio da triagem → o robô para de falar** nessa conversa
- [ ] Botão **Assumir** no painel → o robô para
- [ ] Fora do horário → o robô avisa e não promete resposta imediata
- [ ] No dia seguinte (ou depois do tempo de "novo atendimento"), o mesmo cliente volta → o robô cumprimenta de novo
- [ ] Robô desligado no número (tela Números) → nenhuma mensagem automática
- [ ] **Robô → Testar uma mensagem** → frases reais de clientes; ajuste as variantes de cada resposta até o resultado ficar bom

## 2b. Catálogo e pedidos (Fase 3)

- [ ] Em **Produtos**, cadastre 2 ou 3 produtos reais (ou importe da planilha)
- [ ] Em **Ajustes → Empresa e link de pedido**, confira o nome e o **endereço público** (no teste local, use `http://IP-DO-PC:5173`)
- [ ] Na conversa, toque em **🧾** → o cliente recebe o link no WhatsApp
- [ ] O cliente abre o link **no celular**, escolhe tamanhos/cores, preenche CPF/CNPJ e CEP (o endereço completa sozinho) e envia
- [ ] O cliente recebe "Recebemos seu pedido #…" no WhatsApp
- [ ] O pedido aparece em **Pedidos → Novos**, com o cadastro do cliente criado
- [ ] Ajuste o preço de um item "sob orçamento", coloque o frete e o prazo → **Confirmar pedido**
- [ ] O cliente abre o link de novo → vê o pedido confirmado, sem poder alterar
- [ ] Robô com a opção de menu "Envia o link de pedido" → o cliente escolhe a opção e recebe o link

## 2c. Fila e lembretes (Fase 4)

Notificações ativadas no celular (passo 5) ajudam aqui. Para testar rápido, em **Mais → Fila e lembretes** coloque o primeiro aviso em 2 min e a repetição em 5 min.

- [ ] Cliente manda mensagem e ninguém responde → o aviso "⏰ … espera resposta" chega no tempo configurado
- [ ] Sem resposta → o aviso se repete; a partir do 2º, a gestão também recebe
- [ ] Responder pelo celular → os avisos param
- [ ] **⏰ Adiar lembrete** → nenhum aviso até o fim do adiamento
- [ ] **✓ Não precisa responder** → a conversa sai de "Aguardando"
- [ ] Com o peso de "cliente insatisfeito" ligado, um cliente escreve "que absurdo, ninguém responde!!!" → aparece com 😠 no topo da fila
- [ ] Pedido enviado pelo link e não confirmado → aviso depois do tempo configurado
- [ ] Pedido confirmado com prazo para amanhã → aviso de "vence em 1 dia"
- [ ] Fora do horário de atendimento → nenhum aviso de conversa (com a opção ligada)

## 3. Resumo com IA (opcional)

- [ ] Coloque `ANTHROPIC_API_KEY` no `.env` do servidor e reinicie
- [ ] **Robô → Configurações** mostra "Chave de IA configurada"
- [ ] Faça uma triagem completa → o resumo vem escrito pela IA (se a IA falhar, volta o resumo por regras)

## 4. Perfis de acesso

- [ ] Crie um **Atendente** em **Equipe** e ligue-o a um número
- [ ] Entrando como atendente: vê **só** as conversas daquele número e não vê Números/Robô/Equipe

## 5. Colocar no ar (HTTPS) e testar no celular

Precisa de um servidor (VPS) com Docker e de um domínio apontando para ele.

- [ ] `cp deploy/.env.prod.example deploy/.env.prod` e preencher
- [ ] `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build`
- [ ] `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod exec app node dist/scripts/seed.js`
- [ ] Abrir `https://SEU-DOMINIO` → o cadeado aparece (certificado automático)
- [ ] **Android (Chrome):** menu → **Instalar app** → **Ajustes → Ativar notificações** → a notificação de teste chega
- [ ] **iPhone (Safari):** Compartilhar → **Adicionar à Tela de Início** → abrir pelo ícone → **Ativar notificações**
- [ ] Com o app fechado, um cliente passa pela triagem → **a notificação chega com o resumo**
- [ ] Tocar na notificação → abre direto na conversa

## Se algo der errado

- Logs do servidor: terminal do `dev:server` (ou `docker compose ... logs -f app`)
- Para recomeçar a conexão de um número: **Desconectar aparelho** e ler o QR de novo
- Anote o que aconteceu (print + horário) para corrigirmos
