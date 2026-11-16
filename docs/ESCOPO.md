# Sistema de Apoio à Confecção — Escopo do Projeto

> Versão 0.2 — 16/11/2026

## 1. Objetivo

Juntar em um só lugar os atendimentos de **até 5 WhatsApps** da confecção, com triagem automática, organização de pedidos e preparação (e futuramente emissão) de nota fiscal. Os atendentes continuam no **WhatsApp do celular**. O sistema trabalha nos bastidores e a gestão acompanha tudo por um **app de celular**.

---

## 2. Decisões já tomadas

| Tema | Decisão |
|---|---|
| Conexão WhatsApp | **WhatsApp Web (não oficial)** na v1. A troca futura para a API oficial deve ser possível sem reescrever o sistema. |
| Nº de atendentes | **Até 5 números** conectados |
| Sistema de nota fiscal | **Desconhecido**. Integração genérica + possibilidade de **emissão própria** no futuro |
| Catálogo de produtos | **Não existe**. O sistema precisa ter um **cadastro de produtos** |
| Prioridade | v1: **mensagem mais antiga sem resposta = mais prioritária**. Regras **configuráveis** para depois |
| Lembrete de esquecidos | **Tempo configurável** |
| Avaliação de atendimento | **Fica para depois** |
| Plataforma | **Web + celular** (gestão acessa e extrai dados pelo celular) |
| Resumo para o atendente | **Notificação push no app** (PWA) |

---

## 3. Módulos

### 3.1. Conexões WhatsApp
- Conectar até 5 números por **QR Code**, como "aparelho conectado" no WhatsApp de cada atendente.
- Status de cada conexão (conectado, desconectado, aguardando QR) e alerta quando cair.
- Registrar **todas** as mensagens, inclusive as que o atendente manda do celular.

### 3.2. Painel / Chat centralizado
- Caixa de entrada única com as conversas de todos os números.
- Filtros por atendente, status e prioridade.
- Ler e responder pelo navegador ou pelo app, quando preciso.

### 3.3. Atendimento automático (triagem)
- Mensagens de boas-vindas e de fora do horário.
- Menu de triagem: orçamento, pedido, dúvida, acompanhamento.
- **Base de conhecimento** (FAQ, tabelas, prazos), cadastrada pela gestão.
- **Nível de confiança da resposta**:
  - alto: responde sozinho;
  - médio: sugere a resposta ao atendente;
  - baixo: passa para um humano.
  - Os limites de confiança são configuráveis.
- **O robô para de responder** quando o atendente assume a conversa (detectado quando o atendente responde pelo celular).
- **Resumo para o atendente** ao passar a conversa para um humano.

### 3.4. Catálogo de produtos *(novo)*
- Produtos, variações (tamanho, cor), preços, fotos e, opcionalmente, estoque.
- Dados fiscais por produto (NCM, CFOP, unidade, origem), já pensando na nota.

### 3.5. Pedidos
- **Link de pedido** enviado ao cliente: ele escolhe os produtos, as variações e as quantidades e confirma.
- Opção de montar o pedido pelo próprio WhatsApp (menus e listas).
- Central única de pedidos com status (rascunho, confirmado, em produção, entregue, faturado).
- Cadastro do cliente (CPF/CNPJ, endereço), necessário para a nota.

### 3.6. Gestão de atendimentos
- **Fila por prioridade**: na v1, ordenada pelo tempo de espera.
- **Motor de regras configurável**, preparado para critérios futuros:
  - cliente recorrente;
  - volume de compras;
  - cliente irritado (análise de sentimento, mais complexa).
- **Lembretes** de atendimentos parados, com tempo configurável (geral e por atendente).

### 3.7. Fiscal
- **Fase A**: pedido exportado em formato pronto para nota (JSON/XML/planilha) + integração por API com o emissor que o cliente usar.
- **Fase B**: **emissão própria de NF-e/NFC-e** direto na SEFAZ (detalhes na seção 5).

### 3.8. Gestão / Relatórios (celular)
- Indicadores: atendimentos por dia, tempo médio de resposta, pedidos, faturamento, desempenho por atendente.
- Exportação dos dados (CSV/Excel).

---

## 4. Arquitetura proposta

```
                ┌──────────────────────────┐
  5x WhatsApp ──► Gateway WhatsApp          │  (Baileys / Evolution API)
  (celulares)   └───────────┬──────────────┘
                            │ eventos (mensagens)
                ┌───────────▼──────────────┐
                │ Backend (API + Workers)   │
                │ - triagem / robô          │
                │ - fila e prioridade       │
                │ - lembretes (agendador)   │
                │ - pedidos / catálogo      │
                │ - módulo fiscal (adapter) │
                └──┬──────────┬─────────┬──┘
                   │          │         │
           PostgreSQL     Redis     SEFAZ / emissor externo
                   │
        ┌──────────▼───────────┐
        │ App Web (PWA)         │  painel + gestão, instalável no celular
        │ Página pública pedido │
        └──────────────────────┘
```

**Stack sugerida**
- **Backend**: Node.js + TypeScript.
- **WhatsApp**: Baileys (conexão direta, sem navegador e leve) ou **Evolution API** (já pronta para vários números, com REST e webhooks). Fica por trás de uma interface própria, para trocar pela API oficial depois.
- **Banco**: PostgreSQL + pgvector, para a busca por similaridade na base de FAQ.
- **Filas e agendamentos**: Redis + BullMQ (lembretes, envio de mensagens, reconexões).
- **Frontend**: React (Vite) como **PWA**: um só código para web e celular, instalável e com notificações push. App nativo (React Native/Expo) só se for realmente necessário.
- **Triagem**:
  - v1: busca por palavras-chave + similaridade semântica com nota de confiança;
  - v2: um LLM para resumos e para entender melhor o cliente.

---

## 5. Riscos e observações importantes

1. **WhatsApp Web não oficial**: há risco de **bloqueio do número**, sobretudo com envio em massa ou muitas mensagens automáticas. Para reduzir:
   - mensagens só em resposta ao cliente;
   - intervalos entre os envios;
   - nada de disparos em massa.
2. **Celular do atendente**: o número funciona como aparelho conectado. O celular pode ficar offline por um tempo, mas a sessão cai se ele não se conectar periodicamente (cerca de 14 dias). Precisa de monitoramento de conexão.
3. **Como o resumo chega ao atendente**: como ele usa o WhatsApp do celular, o resumo pode ir:
   - (a) por **notificação push do app**;
   - (b) como **nota no próprio chat** (não visível ao cliente, só no painel);
   - (c) por um **número "sistema"**, que manda o resumo no WhatsApp pessoal do atendente.
   - **Decidido: (a) notificação push no app.**
4. **Emissão de nota fiscal**: a SEFAZ oferece **webservices gratuitos** para autorizar NF-e (modelo 55) e NFC-e (modelo 65), mas eles exigem:
   - **certificado digital A1** da empresa (pago, renovação anual);
   - inscrição estadual e credenciamento como emissor na SEFAZ do estado;
   - XML assinado conforme o layout oficial, com ambiente de homologação para testes;
   - adequação à **Reforma Tributária** (campos de IBS/CBS, em transição desde 2026);
   - acompanhamento das Notas Técnicas, que mudam com frequência.

   **Alternativa**: APIs intermediárias pagas por nota (ex.: Focus NFe, NFE.io, PlugNotas), mais simples de manter. O sistema terá um **adaptador fiscal** para usar qualquer uma das opções.

   Observação: como a confecção vende **mercadoria**, a nota é NF-e/NFC-e (estadual), não NFS-e.
5. **LGPD**: o sistema guarda conversas e dados pessoais. Precisa de controle de acesso, registro de quem acessou e política de retenção.

---

## 6. Fases

| Fase | Entrega | Situação |
|---|---|---|
| **1** | Conexão de até 5 WhatsApps + painel/chat centralizado + PWA | ✅ Código pronto (falta testar com celular real) |
| **2** | Robô de triagem + base de FAQ com confiança + resumo + pausa do robô | ✅ Código pronto (falta testar com celular real) |
| **3** | Catálogo de produtos + página de pedido + central de pedidos + cadastro de clientes | Próxima |
| **4** | Fila por prioridade (tempo de espera) + lembretes configuráveis + motor de regras | Prioridade por espera já existe; faltam lembretes e regras configuráveis |
| **5** | Relatórios e exportação para a gestão | — |
| **6** | Exportação para nota + integração com o emissor do cliente | — |
| **7** | Emissão própria de NF-e/NFC-e (SEFAZ) | — |
| **Futuro** | Avaliação de atendimento, prioridade por recorrência/valor/sentimento, API oficial do WhatsApp | — |

---

## 7. Pendências

- [x] Como o resumo da triagem chega ao atendente → **notificação push no app**
- [ ] Qual sistema de nota fiscal o cliente usa (ou se a emissão própria será o caminho)
- [ ] Levantamento do catálogo inicial de produtos
- [ ] Onde hospedar (VPS própria ou nuvem) e orçamento mensal
- [ ] Perfis de acesso: atendente, gestor, administrador
