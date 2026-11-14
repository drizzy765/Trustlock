import Hero from "@/components/landing/Hero";
import DealStory from "@/components/landing/DealStory";
import WhoItsFor from "@/components/landing/WhoItsFor";
import MoneyPaths from "@/components/landing/MoneyPaths";
import AgentsSection from "@/components/landing/AgentsSection";
import { getProviders } from "@/lib/providers";

// The agents list is re-read from the agent API at most every 5 minutes.
export const revalidate = 300;

export default async function HomePage() {
  const { providers, live } = await getProviders();
  return (
    <main className="pb-8">
      {/* 1. Hero: the example deal plays on photo 1A. */}
      <Hero />
      {/* 2. How a deal works: sticky story, the photo and its UI swap per step. */}
      <DealStory />
      {/* 3. Who it's for (#15): 4A with a chat message, the one masked reveal and parallax. */}
      <WhoItsFor />
      {/* 4. What moves the money: photo-free, who can move funds. */}
      <MoneyPaths />
      {/* 5. Works with your AI agent: rendered from GET /agent/providers. */}
      <AgentsSection providers={providers} live={live} />
    </main>
  );
}
