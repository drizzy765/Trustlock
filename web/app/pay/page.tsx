export default function PayPage() {
  return (
    <main style={{ padding: 32, maxWidth: 720 }}>
      <h1>Buyer — lock funds</h1>
      <p>Wallet selector goes here (testnet first). Amount, item and deadline come from the deal draft.</p>
      <p>Intents widget: quote via the agent, then execute only when NEXT_PUBLIC_APP_MODE=live.</p>
      <p>Status after ft_on_transfer: Funded.</p>
    </main>
  );
}
