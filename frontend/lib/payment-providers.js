export const paymentProviders = [
  {
    id: "zaad",
    name: "ZAAD",
    organization: "Telesom",
    category: "Mobile money",
    description: "Requires an authorized merchant API integration. A phone or merchant number alone does not provide API access."
  },
  {
    id: "evc_plus",
    name: "EVC Plus",
    organization: "Hormuud",
    category: "Mobile money",
    description: "Requires approved gateway credentials and a documented transaction verification flow."
  },
  {
    id: "edahab",
    name: "eDahab",
    organization: "Somtel",
    category: "Mobile money",
    description: "Requires an authorized direct integration or documented aggregator account."
  },
  {
    id: "sahal",
    name: "SAHAL",
    organization: "Golis",
    category: "Mobile money",
    description: "Requires an approved gateway integration. No direct API is assumed."
  },
  {
    id: "sifalo_pay",
    name: "Sifalo Pay",
    organization: "Unified gateway",
    category: "Gateway",
    description: "Official technical API details and staging verification are required before checkout can be enabled."
  },
  {
    id: "card",
    name: "Visa & Mastercard",
    organization: "Hosted card checkout",
    category: "Cards",
    description: "Card entry must stay on a provider-hosted checkout. This app never collects card numbers or CVVs."
  },
  {
    id: "bank_transfer",
    name: "Bank payments",
    organization: "Bank transfer",
    category: "Bank payments",
    description: "No customer checkout bank integration is configured. Withdrawals and payouts are separate operations."
  }
];
