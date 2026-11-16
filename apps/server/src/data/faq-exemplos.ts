/**
 * Perguntas frequentes de exemplo para uma confecção.
 * São importadas DESATIVADAS: a gestão revisa as respostas (valores, prazos,
 * endereço…) e ativa cada uma no app antes de o robô usá-las.
 */
export const faqExemplos = [
  {
    category: 'Pedidos',
    question: 'Qual o pedido mínimo?',
    variants: ['quantidade mínima', 'pedido minimo', 'mínimo de peças', 'vende no varejo', 'posso comprar só uma peça', 'vende unidade'],
    answer: 'Nosso pedido mínimo é de [AJUSTAR: 10] peças por modelo. 😉',
  },
  {
    category: 'Prazos',
    question: 'Qual o prazo de produção?',
    variants: ['quanto tempo demora pra ficar pronto', 'prazo de entrega', 'quando fica pronto', 'quantos dias para produzir', 'demora quanto tempo'],
    answer: 'O prazo de produção é de [AJUSTAR: 15 a 20] dias úteis após a aprovação da arte e do pagamento do sinal.',
  },
  {
    category: 'Pagamento',
    question: 'Quais as formas de pagamento?',
    variants: ['aceita pix', 'aceita cartão', 'parcela', 'como faço o pagamento', 'boleto', 'precisa pagar sinal', 'pagamento'],
    answer: 'Aceitamos [AJUSTAR: Pix, boleto e cartão em até 3x]. Para iniciar a produção pedimos [AJUSTAR: 50%] de sinal e o restante na entrega.',
  },
  {
    category: 'Entrega',
    question: 'Vocês entregam ou enviam pelo correio?',
    variants: ['faz entrega', 'envia para outra cidade', 'frete', 'retirar na loja', 'manda pelos correios', 'entrega'],
    answer: 'Enviamos para todo o Brasil [AJUSTAR: pelos Correios/transportadora]. Também é possível retirar no nosso endereço: [AJUSTAR: endereço].',
  },
  {
    category: 'Produtos',
    question: 'Vocês fazem camiseta personalizada?',
    variants: ['estampa personalizada', 'silk', 'sublimação', 'bordado', 'colocar logo da empresa', 'personalizar uniforme', 'fazem uniforme'],
    answer: 'Sim! Fazemos peças personalizadas com [AJUSTAR: silk, sublimação e bordado]. Envie a sua arte ou logo que montamos a proposta. 🎨',
  },
  {
    category: 'Produtos',
    question: 'Quais tamanhos vocês têm?',
    variants: ['tabela de medidas', 'tem tamanho grande', 'plus size', 'tamanho infantil', 'grade de tamanhos', 'tem GG'],
    answer: 'Trabalhamos do [AJUSTAR: PP ao XGG], e também infantil. Se quiser, mandamos a tabela de medidas.',
  },
  {
    category: 'Loja',
    question: 'Qual o horário de atendimento?',
    variants: ['que horas abre', 'que horas fecha', 'funciona sábado', 'horário de funcionamento', 'estão abertos'],
    answer: 'Atendemos de [AJUSTAR: segunda a sexta, das 8h às 18h, e sábado das 8h às 12h].',
  },
  {
    category: 'Loja',
    question: 'Onde fica a loja?',
    variants: ['endereço', 'qual o endereço', 'localização', 'onde vocês ficam', 'como chego'],
    answer: 'Ficamos em [AJUSTAR: endereço completo]. 📍',
  },
  {
    category: 'Pedidos',
    question: 'Vocês enviam amostra ou peça piloto?',
    variants: ['tem amostra', 'peça piloto', 'posso ver o tecido antes', 'mostruário'],
    answer: 'Sim, [AJUSTAR: produzimos uma peça piloto para aprovação antes da produção do pedido].',
  },
  {
    category: 'Pós-venda',
    question: 'Como funciona a troca?',
    variants: ['trocar tamanho', 'peça com defeito', 'devolução', 'veio errado', 'troca'],
    answer: 'Trocas por defeito de fabricação em até [AJUSTAR: 7] dias após o recebimento. Envie fotos da peça que nossa equipe resolve com você.',
  },
];
