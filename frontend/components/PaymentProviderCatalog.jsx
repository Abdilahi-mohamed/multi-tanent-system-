import { AlertCircle, Building2, CreditCard, Wallet } from "lucide-react";
import { paymentProviders } from "../lib/payment-providers";

const categoryIcons = {
  "Mobile money": Wallet,
  Gateway: Building2,
  Cards: CreditCard,
  "Bank payments": Building2
};

export function PaymentProviderCatalog() {
  return <div className="payment-provider-grid">
    {paymentProviders.map((provider) => {
      const Icon = categoryIcons[provider.category];
      return <article className="payment-provider-card" key={provider.name}>
        <div className="payment-provider-heading">
          <span className="payment-provider-icon"><Icon size={17} /></span>
          <div><b>{provider.name}</b><small>{provider.organization}</small></div>
          <span className="provider-status"><i />Not integrated</span>
        </div>
        <span className="payment-category">{provider.category}</span>
        <p>{provider.description}</p>
        <div className="payment-provider-foot"><AlertCircle size={13} /> Checkout unavailable until a verified adapter is installed.</div>
      </article>;
    })}
  </div>;
}
