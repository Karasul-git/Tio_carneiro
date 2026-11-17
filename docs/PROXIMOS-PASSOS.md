# Próximos passos

> Registrado em 17/11/2026, ao pausar o desenvolvimento depois da Fase 5.

## Onde paramos

As fases 1 a 5 estão com o código pronto, testado automaticamente e salvo no GitHub (branch `claude/confeccao-support-system-ezp08l`):

1. WhatsApps conectados + painel centralizado + app no celular
2. Robô de triagem + base de respostas + resumo para o atendente
3. Catálogo + link de pedido + central de pedidos + clientes
4. Fila com prioridade configurável + lembretes
5. Relatórios + exportação para Excel

**Ainda não foi feito o teste com WhatsApp e celular de verdade.** O roteiro está em [`CHECKLIST-TESTES.md`](CHECKLIST-TESTES.md).

## Decisão: nota fiscal fica para o final

A emissão e a integração de nota fiscal (antigas fases 6 e 7) são **finalização**. Ficam para depois.

O que já existe e adianta esse trabalho:
- NCM, CFOP e origem no cadastro de produtos;
- CPF/CNPJ validado, inscrição estadual e endereço com código IBGE no cadastro de clientes;
- planilha de **Itens** na exportação, já com NCM/CFOP.

## Próxima direção: experiência e gestão

Ideias levantadas para a próxima etapa:

### 1. Trabalhar o layout
- Refinar o visual geral do app (telas, espaçamentos, hierarquia, identidade da confecção).
- Revisar a navegação no celular e no computador.

### 2. Mais opções de filtros
- Filtros mais ricos nas listas: conversas, pedidos, clientes e produtos.
- Exemplos a detalhar: por atendente, assunto, período, situação, valor, cidade, produto.

### 3. Relatórios mais completos
- Novos indicadores e recortes, a partir do que a gestão sentir falta no uso real.

### 4. Dashboard dinâmico com widgets
- Painel inicial montável pela gestão: escolher, organizar e redimensionar blocos (widgets).
- Exemplos de widgets: tempo de resposta, clientes esperando, faturamento do período, pedidos por situação, produtos mais vendidos, desempenho por atendente.
- Cada pessoa (ou perfil) pode ter o seu arranjo.

> Esses itens ainda serão detalhados em conversa antes de começar.

## Pendências para quando houver um computador

- [ ] Rodar o roteiro de testes com um número de WhatsApp de **teste**
- [ ] Decidir onde hospedar (servidor com domínio e HTTPS). Sem HTTPS, o celular não instala o app nem recebe notificações, e o link de pedido não abre para o cliente.
- [ ] Preencher os trechos `[AJUSTAR: …]` das perguntas de exemplo do robô
- [ ] Cadastrar o catálogo real de produtos (pode ser colado de uma planilha)
- [ ] Confirmar o NCM dos produtos com a contabilidade (só será necessário na fase da nota)

## Limitações conhecidas

- Fotos, áudios e documentos aparecem só como "📷 Imagem", "🎤 Áudio" etc.; o conteúdo continua no celular.
- No iPhone, as notificações só funcionam com o app instalado na tela inicial.
- WhatsApp Web não é a API oficial: há risco de bloqueio do número.
- "Insatisfeito" e "com pressa" são detectados por palavras simples, não por análise de sentimento.

## Para retomar

Abra uma nova conversa, aponte para este repositório e peça para continuar a partir deste documento. O contexto completo está em:
- [`ESCOPO.md`](ESCOPO.md): objetivo, decisões e fases;
- [`../README.md`](../README.md): o que existe e como rodar.
